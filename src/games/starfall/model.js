import { clamp, circleHitsCircle } from "../../geometry.js";
import { recordDecision } from "../../decisions.js";
import { installEvents } from "../../events.js";
// Runner factors. The runner does not roll for mistakes: it can only see stars
// that have fallen past a certain height, it re-reads them on a clock, and once
// it commits to a lane it holds that lane for a beat.
// Seconds, pixels and px/s. Lane width is policy clearance, not collision
// geometry. Outcome accounting keeps its fixed 0.95s threat horizon, so tuning
// commitment cannot silently change the measurement denominator.
// See tests/ai/TUNING.md.
export const STARFALL_AI_DEFAULTS = Object.freeze({
  perceptionMin: 0.1, perceptionMax: 0.24, visionHeight: 300,
  laneCommitMin: 0.55, laneCommitMax: 0.95, laneWidth: 45, speed: 220,
  targetLock: 0.45, gemPastMargin: 50, gemVerticalWeight: 0.15,
  gemSwitchAdvantage: 25, gemSwitchFirstChance: 0.5,
  gemSwitchSecondChance: 0.8, gemSwitchThirdChance: 0.9,
  lanes: Object.freeze([20, 160, 300, 440, 580, 720, 780]), arriveTolerance: 4
});
// Preserve the existing public constant as a default alias, not live tuning.
export const RUNNER_PERCEPTION_MIN = STARFALL_AI_DEFAULTS.perceptionMin;
const THREAT_HORIZON = 0.95;

const HUMAN_RUNNER_SPEED = 240;
const RUNNER_RADIUS = 16;
const STAR_RADIUS = 10;
// Human-only budgets, independent of the flipped runner's perception/tuning.
// For a vertical star 160px above the runner (y340), allow 0.35s to react,
// 26/240s to clear the collision corridor, and one 60Hz frame of margin:
// vy <= (160 - 26) / (0.35 + 26/240 + 1/60) = 282.1px/s; round down to 280.
// Space spawns by reaction + a full 52px corridor crossing + one frame:
// 0.35 + 52/240 + 1/60 = 0.5833s; round up to 0.6s. This bounds pressure,
// not a guarantee against every random multi-star arrangement or late response.
const HUMAN_MAX_STAR_SPEED = 280;
const HUMAN_MIN_SPAWN_INTERVAL = 0.6;

export function starfallHumanDifficulty(score) {
  // Keep the original opening/first-gem ramp. Then ease toward the budgets
  // over two more gems (50 points each), with strict progression up to 150.
  const opening = Math.min(Math.max(0, score), 50);
  const later = clamp((score - 50) / 100, 0, 1);
  return {
    starSpeed: 130 + opening * 2 + later * (HUMAN_MAX_STAR_SPEED - 230),
    spawnInterval: 1.1 - opening * 0.006 - later * (0.8 - HUMAN_MIN_SPAWN_INTERVAL)
  };
}

const STARFALL_MODES = [
  { value: "runner", label: "Solo — guide the runner" },
  { value: "stars", label: "Computer vs you — send stars" }
];

export class StarfallModel {
  constructor({ aiTuning = {} } = {}) {
    installEvents(this);
    this.aiTuning = { ...STARFALL_AI_DEFAULTS, ...aiTuning, lanes: [...(aiTuning.lanes || STARFALL_AI_DEFAULTS.lanes)] };
    this.id = "starfall";
    this.title = "Starfall";
    this.description = "Guide the runner with the mouse or keyboard, collect falling blue gems, and avoid red stars. In flipped play, click or drag to send stars.";
    this.side = "runner";
    this.score = 0;
    // The engine treats lifeLost as an edge trigger, so it must start and end
    // a round as a definite false rather than depending on the caller to
    // clear it.
    this.lifeLost = false;
    this.gameOver = false;
    this.won = false;
    this.eventLog = [];
    this.nextEntityId = 1;
  }
  get modes() { return STARFALL_MODES; }
  get sides() { return STARFALL_MODES.map((mode) => mode.value); }
  sideLabel() { return this.modes.find((mode) => mode.value === this.side)?.label || STARFALL_MODES[0].label; }
  setSide(side) { if (this.sides.includes(side)) this.side = side; }
  newRunnerStar(x = 20 + Math.random() * 760, y = 20) {
    return { id: this.nextEntityId++, x, y, vy: starfallHumanDifficulty(this.score).starSpeed, radius: STAR_RADIUS, outcome: null, threatened: false };
  }
  newGem(x = null, y = -20) {
    let nextX = x;
    if (nextX === null || nextX === undefined) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        nextX = 20 + Math.random() * 760;
        if (this.gems.every((gem) => Math.abs(gem.x - nextX) >= 110)) break;
      }
    }
    return { id: this.nextEntityId++, x: nextX, y, vx: (Math.random() * 2 - 1) * 32, vy: 35 + Math.random() * 30, collected: false, outcome: null };
  }
  separateGems() {
    for (let first = 0; first < this.gems.length; first += 1) {
      for (let second = first + 1; second < this.gems.length; second += 1) {
        const left = this.gems[first];
        const right = this.gems[second];
        if (left.remove || right.remove || left.collected || right.collected) continue;
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        if (Math.abs(dx) >= 90 || Math.abs(dy) >= 45) continue;
        const direction = dx === 0 ? (first % 2 ? 1 : -1) : Math.sign(dx);
        const push = (90 - Math.abs(dx)) / 2;
        left.x = clamp(left.x - direction * push, 0, 800);
        right.x = clamp(right.x + direction * push, 0, 800);
      }
    }
  }
  reset(keepScore = false) {
    this.clearEvents();
    if (!keepScore) this.score = 0; this.runner = { x: 400, y: 500, radius: RUNNER_RADIUS }; this.stars = []; this.gems = []; this.spawnClock = 0.3; this.aiTargetX = null; this.aiTargetGem = null; this.aiTargetLock = 0; this.aiLaneCommit = 0; this.aiPerceptionClock = 0; this.aiSeenStars = []; this.decisionLog = []; this.lastDecision = null; this.eventLog = []; this.nextEntityId = 1; this.gemHoldTime = 0; this.gemSpawnClock = 0; this.gemSpawnCooldown = 0; this.lifeLost = false; this.pendingLifeLoss = false; this.gameOver = false; this.won = false;
    if (this.side === "runner") for (let index = 0; index < 3; index += 1) this.gems.push(this.newGem(undefined, -20 - index * 80));
  }
  recordEvent(type, details = {}) {
    this.eventLog.push({ type, ...details });
    if (this.eventLog.length > 4096) this.eventLog.splice(0, 1024);
  }
  threatensRunner(star) {
    const corridor = this.runner.radius + star.radius;
    if (star.vy <= 0 || star.y > this.runner.y + corridor) return false;
    // A threat is on a collision course within one lane-commitment window,
    // not a star that happened to share the runner's x while high on the board.
    const timeToRunner = Math.max(0, (this.runner.y - star.y) / star.vy);
    if (timeToRunner > THREAT_HORIZON) return false;
    const xAtRunner = star.x + (star.vx || 0) * timeToRunner;
    return Math.abs(xAtRunner - this.runner.x) <= corridor;
  }
  update(dt, input) {
    this.gemSpawnCooldown = Math.max(0, (this.gemSpawnCooldown || 0) - dt);
    if (this.side === "runner") {
      const direction = input.keyDirection || 0;
      if (direction || input.mode === "keyboard") this.runner.x += direction * HUMAN_RUNNER_SPEED * dt;
      else if (input.mode === "mouse" && input.pointerX > 0) {
        const smoothing = 1 - Math.exp(-18 * dt);
        this.runner.x += (input.pointerX - this.runner.x) * smoothing;
      }
      this.runner.x = clamp(this.runner.x, 20, 780);
    } else {
      if (input.spawnStar && this.stars.length < 12) {
        const dragX = input.spawnStar.dragDeltaX || 0;
        const dragY = input.spawnStar.dragDeltaY || 0;
        const horizontalSpeed = input.spawnStar.dragDistance ? clamp(dragX / Math.max(Math.abs(dragY), 1) * 180, -240, 240) : 0;
        this.stars.push({ id: this.nextEntityId++, x: input.spawnStar.x, y: 20, vx: horizontalSpeed, vy: 130 + this.score * 2, radius: 10, age: 0, userCreated: true, outcome: null, threatened: false });
      }
      if (input.spawnGem && this.gemSpawnCooldown <= 0 && this.gems.length < 12) {
        for (let index = this.stars.length - 1; index >= 0; index -= 1) {
          if (this.stars[index].userCreated && (this.stars[index].age || 0) < 0.5) {
            const removed = this.stars.splice(index, 1)[0];
            if (!removed.outcome) {
              removed.outcome = "star-despawn";
              this.recordEvent("star-despawn", { starId: removed.id ?? null, reason: "gem-spawn" });
            }
            break;
          }
        }
        this.gems.push(this.newGem(clamp(input.spawnGem.x, 20, 780), 20));
        this.gemSpawnCooldown = 0.25;
      }
      if (input.pointerDown && !input.pointerDragDistance && !input.spawnGem) {
        this.gemHoldTime += dt;
        this.gemSpawnClock -= dt;
        if (this.gemHoldTime >= 0.35 && this.gemSpawnClock <= 0 && this.gems.length < 12) {
          this.gems.push(this.newGem(clamp(input.pointerX + (Math.random() * 2 - 1) * 45, 20, 780), 20));
          this.gemSpawnClock = 0.2;
        }
      } else {
        this.gemHoldTime = 0;
        this.gemSpawnClock = 0;
      }
      this.aiRunner(dt);
    }
    if (this.side === "runner") {
      this.spawnClock -= dt;
      if (this.spawnClock <= 0) {
        this.stars.push(this.newRunnerStar());
        this.spawnClock = starfallHumanDifficulty(this.score).spawnInterval;
      }
    }
    for (const star of this.stars) {
      star.x += (star.vx || 0) * dt;
      star.y += star.vy * dt;
      star.age = (star.age || 0) + dt;
      if (!star.threatened && this.threatensRunner(star)) {
        star.threatened = true;
        this.recordEvent("star-threatened", { starId: star.id ?? null });
      }
    }
    for (const gem of this.gems) {
      if (gem.collected) {
        if (this.side === "runner") {
          gem.respawn = (gem.respawn || 0) - dt;
          if (gem.respawn <= 0) Object.assign(gem, this.newGem());
        } else gem.remove = true;
        continue;
      }
      gem.x += (gem.vx || 0) * dt;
      gem.y += (gem.vy || 50) * dt;
      if (gem.x < 0) gem.x = 800;
      if (gem.x > 800) gem.x = 0;
      if (gem.y > 580) {
        if (this.side === "runner") {
          if (!gem.outcome) {
            gem.outcome = "gem-expired";
            this.recordEvent("gem-expired", { gemId: gem.id ?? null });
          }
          Object.assign(gem, this.newGem());
        }
        else { gem.remove = true; continue; }
      }
      if (circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, gem.x, gem.y, 10)) {
        this.score += 50;
        this.emit("gem");
        if (!gem.outcome) {
          gem.outcome = "gem-collected";
          this.recordEvent("gem-collected", { gemId: gem.id ?? null });
        }
        if (this.side === "runner") { gem.collected = true; gem.respawn = 0.7; }
        else gem.remove = true;
      } else if (!gem.outcome && gem.y > this.runner.y + this.runner.radius + 10) {
        gem.outcome = "gem-passed";
        this.recordEvent("gem-passed", { gemId: gem.id ?? null });
      }
    }
    this.separateGems();
    for (const gem of this.gems) if (gem.remove && !gem.outcome) {
      gem.outcome = "gem-expired";
      this.recordEvent("gem-expired", { gemId: gem.id ?? null });
    }
    this.gems = this.gems.filter((gem) => !gem.remove);
    for (const star of this.stars) {
      if (circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, star.x, star.y, star.radius)) {
        if (!star.threatened) this.recordEvent("star-threatened", { starId: star.id ?? null });
        star.threatened = true;
        star.dead = true;
        if (!star.outcome) {
          star.outcome = "star-collision";
          this.recordEvent("star-collision", { starId: star.id ?? null });
        }
        if (!this.lifeLost) {
          this.lifeLost = true;
          this.pendingLifeLoss = true;
          this.emit("life");
          this.recordEvent("life-loss", { cause: "star" });
        }
      }
    }
    for (const star of this.stars) {
      if (star.dead || star.y >= 560 || star.x <= -30 || star.x >= 830) {
        if (!star.outcome) {
          const passedRunner = star.y >= 560 && star.x > -30 && star.x < 830;
          star.outcome = star.threatened && passedRunner ? "star-dodged" : "star-expired";
          this.recordEvent(star.outcome, { starId: star.id ?? null });
        }
      }
    }
    this.stars = this.stars.filter((star) => !star.dead && star.y < 560 && star.x > -30 && star.x < 830);
  }
  // What the runner can actually see. A star still high up has not been falling
  // long enough to have registered, which is why it used to look invulnerable:
  // it was checking every star on the board against every candidate lane.
  visibleStars() {
    return this.stars.filter((star) => star.y >= this.aiTuning.visionHeight);
  }
  aiRunner(dt) {
    const visible = this.visibleStars();
    this.aiTargetLock = Math.max(0, (this.aiTargetLock || 0) - dt);
    this.aiLaneCommit = Math.max(0, (this.aiLaneCommit || 0) - dt);
    this.aiPerceptionClock = Math.max(0, (this.aiPerceptionClock || 0) - dt);
    // Re-read the lanes on a clock rather than continuously.
    if (this.aiPerceptionClock <= 0) {
      this.aiSeenStars = visible.map((star) => ({ x: star.x, vx: star.vx || 0 }));
      this.aiPerceptionClock = this.aiTuning.perceptionMin + Math.random() * (this.aiTuning.perceptionMax - this.aiTuning.perceptionMin);
    }
    const seen = this.aiSeenStars || [];
    const activeGems = this.gems.filter((gem) => !gem.collected && gem.y <= this.runner.y + this.aiTuning.gemPastMargin);
    if (!seen.length && !activeGems.length) return;
    const gemCost = (gem) => Math.abs(gem.x - this.runner.x) + Math.abs(this.runner.y - gem.y) * this.aiTuning.gemVerticalWeight;
    const rankedGems = [...activeGems].sort((first, second) => gemCost(first) - gemCost(second));
    let targetGem = rankedGems.find((gem) => gem === this.aiTargetGem);
    const targetIsSafe = this.aiTargetX === null || seen.every((star) => Math.abs(this.aiTargetX - star.x) > this.aiTuning.laneWidth);
    if (!targetGem || !targetIsSafe) {
      targetGem = rankedGems[0] || null;
      this.aiTargetLock = this.aiTuning.targetLock;
    } else if (!this.aiTargetLock) {
      const currentCost = gemCost(targetGem);
      const betterGems = rankedGems.filter((gem) => gem !== targetGem && gemCost(gem) < currentCost - this.aiTuning.gemSwitchAdvantage);
      const roll = Math.random();
      if (betterGems[0] && roll < this.aiTuning.gemSwitchFirstChance) targetGem = betterGems[0];
      else if (betterGems[1] && roll < this.aiTuning.gemSwitchSecondChance) targetGem = betterGems[1];
      else if (betterGems[2] && roll < this.aiTuning.gemSwitchThirdChance) targetGem = betterGems[2];
      this.aiTargetLock = this.aiTuning.targetLock;
    }
    const candidates = this.aiTuning.lanes;
    const safe = candidates.filter((candidate) => seen.every((star) => Math.abs(candidate - star.x) > this.aiTuning.laneWidth));
    const pool = safe.length ? safe : [this.runner.x < 400 ? 20 : 780];
    const target = pool.reduce((best, candidate) => {
      const distance = targetGem ? Math.abs(candidate - targetGem.x) : Math.abs(candidate - this.runner.x);
      return distance < best.distance ? { x: candidate, distance } : best;
    }, { x: pool[0], distance: Infinity });

    // A lane is held once chosen. Without this the runner re-picks the safest
    // lane every frame, so a star that moves into its path is never a problem --
    // there was never a decision to get wrong.
    let replanned = false;
    const laneUnsafe = this.aiTargetX !== null && !seen.every((star) => Math.abs(this.aiTargetX - star.x) > this.aiTuning.laneWidth);
    if (this.aiTargetX === null || this.aiLaneCommit <= 0 && (laneUnsafe || this.aiTargetGem !== targetGem)) {
      this.aiTargetX = target.x;
      this.aiTargetGem = targetGem;
      this.aiLaneCommit = this.aiTuning.laneCommitMin + Math.random() * (this.aiTuning.laneCommitMax - this.aiTuning.laneCommitMin);
      replanned = true;
    } else if (this.aiTargetGem !== targetGem) {
      this.aiTargetGem = targetGem;
    }
    recordDecision(this, {
      lane: this.aiTargetX,
      replanned,
      laneUnsafe,
      starsSeen: seen.length,
      starsOnBoard: this.stars.length,
      targetGemX: targetGem ? Math.round(targetGem.x) : null
    });
    if (Math.abs(this.aiTargetX - this.runner.x) <= this.aiTuning.arriveTolerance) this.runner.x = this.aiTargetX;
    else this.runner.x = clamp(this.runner.x + clamp(this.aiTargetX - this.runner.x, -1, 1) * this.aiTuning.speed * dt, 20, 780);
  }
  handleLifeLoss() {
    if (!this.lifeLost && !this.pendingLifeLoss) return null;
    this.lifeLost = false;
    this.pendingLifeLoss = false;
    return { gameOver: false, message: "One life lost — starting again in 3…" };
  }
  resetAfterLife() {
    for (const star of this.stars) if (!star.outcome) {
      star.outcome = "star-despawn";
      this.recordEvent("star-despawn", { starId: star.id ?? null, reason: "life-reset" });
    }
    for (const gem of this.gems) if (!gem.outcome) {
      gem.outcome = "gem-despawn";
      this.recordEvent("gem-despawn", { gemId: gem.id ?? null, reason: "life-reset" });
    }
    this.runner = { x: 400, y: 500, radius: RUNNER_RADIUS };
    this.stars = [];
    this.gems = [];
    this.spawnClock = 0.3;
    this.aiTargetX = null;
    this.aiTargetGem = null;
    this.aiTargetLock = 0;
    this.aiLaneCommit = 0;
    this.aiPerceptionClock = 0;
    this.aiSeenStars = [];
    this.gemHoldTime = 0;
    this.gemSpawnClock = 0;
    this.gemSpawnCooldown = 0;
    this.lifeLost = false;
    this.pendingLifeLoss = false;
    this.gameOver = false;
    this.won = false;
    if (this.side === "runner") for (let index = 0; index < 3; index += 1) this.gems.push(this.newGem(undefined, -20 - index * 80));
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The computer changes direction to dodge; it does not phase through stars." }; }
}
