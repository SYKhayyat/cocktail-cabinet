// Independent human-input recipes. No production prediction/AI helper, hidden
// clocks, brick collision search, or random-stream access is given to a policy.
import { BreakoutGame } from "../src/games/breakout/index.js";
import { seeded, summary } from "./player/harness.mjs";

export const CALIBRATION_SEEDS = [57, 113, 227, 449, 907, 1801, 3607, 7207, 14407, 28813, 57637, 115271];
export const VALIDATION_SEEDS = [83, 167, 331, 659, 1327, 2657, 5309, 10613, 21227, 42457, 84913, 169859];
export const POLICIES = ["bank-pulse", "coarse-pointer", "reactive-keys"];
export const DT = 1 / 60;
export const HORIZON = 180;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function visible(model) {
  return {
    paddle: { x: model.human.x, y: model.human.y, width: model.human.width },
    balls: model.balls.map(({ x, y, vx, vy, radius }) => ({ x, y, vx, vy, radius }))
  };
}

function controls(direction = 0) {
  return { mode: "keyboard", keys: new Set(direction ? [direction > 0 ? "ArrowRight" : "ArrowLeft"] : []), pointer: { x: 0, y: 0, moved: false, down: false } };
}

export function humanInputs(name, seed) {
  if (!POLICIES.includes(name) && name !== "idle") throw new Error(`Unknown policy: ${name}`);
  const period = name === "reactive-keys" ? 0.15 : name === "coarse-pointer" ? 0.25 : 0.20;
  let next = (seed % 7) / 60;
  let release = Infinity;
  let held = controls();
  let polls = 0;
  return {
    period,
    get polls() { return polls; },
    read(snapshot, time) {
      if (name === "idle") return controls();
      if (time + 1e-9 >= release) held = controls();
      if (time + 1e-9 < next) return held;
      next = time + period;
      polls += 1;
      const { paddle, balls } = snapshot;
      const incoming = balls.filter((ball) => ball.vy > 0 && ball.y < paddle.y)
        .sort((a, b) => (paddle.y - a.y) / a.vy - (paddle.y - b.y) / b.vy)[0];
      if (name === "bank-pulse") {
        // Timed arrow pulse from one rough, capped 1.5s bank estimate. Aiming
        // 24px off centre steers toward the brick field, not an optimal search.
        let target = incoming ? incoming.x + incoming.vx * Math.min(1.5, (paddle.y - incoming.radius - incoming.y) / incoming.vy) : balls[0]?.x ?? 400;
        if (target < 8) target = 16 - target;
        else if (target > 792) target = 1584 - target;
        target = clamp(target + (target > 400 ? 24 : -24), 8, 792);
        const error = target - paddle.x - paddle.width / 2;
        held = controls(Math.abs(error) > 10 ? Math.sign(error) : 0);
        release = time + Math.min(period, Math.max(0.05, Math.abs(error) / 460));
      } else if (name === "coarse-pointer") {
        // A different control/aim strategy: lead only 0.75s, no wall mirror,
        // quantize to a 32px lane, centre the return, hold cursor between polls.
        const target = incoming ? incoming.x + incoming.vx * Math.min(0.75, (paddle.y - incoming.y) / incoming.vy) : 400;
        held = { ...controls(), mode: "mouse", pointer: { x: clamp(Math.round(target / 32) * 32, 8, 792), y: 500, moved: true, down: false } };
        release = Infinity;
      } else {
        // Reactive keyboard player follows current x, not projected landing.
        // Hold whole arrow decisions, 18px dead zone; recentres while outgoing.
        const error = (incoming?.x ?? 400) - paddle.x - paddle.width / 2;
        held = controls(Math.abs(error) > 18 ? Math.sign(error) : 0);
        release = Infinity;
      }
      return held;
    }
  };
}

export function versusSample(policy, seed, { aiTuning = {}, lifeDeficit = false, horizon = HORIZON } = {}) {
  return seeded(seed, () => {
    const game = new BreakoutGame();
    game.setSide("versus");
    Object.assign(game.model.aiTuning, aiTuning);
    game.lifecycle.startRound({ startingLives: 3, reason: "load" });
    const m = game.model;
    if (lifeDeficit) m.playerLives.human = 2;
    const player = humanInputs(policy, seed);
    let active = 0;
    let wall = 0;
    let countdown = 0;
    let losses = 0;
    let deficit = null;
    let regained = null;
    let lifeGap = null;
    const lossEvents = [];
    while (!game.lifecycle.resultState().ended && active + 1e-9 < horizon) {
      wall += DT;
      if (countdown > 0) { countdown = Math.max(0, countdown - DT); continue; }
      game.update(DT, player.read(visible(m), active));
      active += DT;
      // A real score comeback: at least a brick-plus deficit after the opening,
      // then regain the lead (not just win by attrition while still behind).
      if (!deficit && active >= 2 && m.scores.computer - m.scores.human >= 25) deficit = { time: active, gap: m.scores.computer - m.scores.human, lives: { ...m.playerLives } };
      if (deficit && !regained && m.scores.human > m.scores.computer) regained = { time: active, lead: m.scores.human - m.scores.computer };
      if (!game.won && game.lifecycle.lifeLossPending()) {
        const loss = game.lifecycle.resolveLifeLoss();
        losses += loss.owners?.length ?? 0;
        lossEvents.push({ time: active, owners: loss.owners, lives: { ...m.playerLives } });
        if (!lifeGap && !loss.gameOver && m.playerLives.human < m.playerLives.computer) lifeGap = { time: active, lives: { ...m.playerLives } };
        if (!loss.gameOver) { game.lifecycle.restartAfterLife(); countdown = 3; }
      }
    }
    const result = game.lifecycle.resultState();
    return { policy, seed, outcome: !result.ended ? "censored" : m.versusTie ? "tie" : m.winner,
      reason: m.versusEndReason, active, wall, losses, polls: player.polls,
      scores: { ...m.scores }, lives: { ...m.playerLives }, deficit, regained, lifeGap,
      comeback: m.winner === "human" && Boolean(deficit && regained) && m.scores.human > m.scores.computer,
      lifeComeback: m.winner === "human" && Boolean(lifeGap), lossEvents };
  });
}

export function versusDistribution(policy, { seeds = CALIBRATION_SEEDS, ...options } = {}) {
  const runs = seeds.map((seed) => versusSample(policy, seed, options));
  return { policy, count: runs.length,
    human: runs.filter((r) => r.outcome === "human").length,
    computer: runs.filter((r) => r.outcome === "computer").length,
    tie: runs.filter((r) => r.outcome === "tie").length,
    censored: runs.filter((r) => r.outcome === "censored").length,
    comebacks: runs.filter((r) => r.comeback).length,
    lifeComebacks: runs.filter((r) => r.lifeComeback).length,
    deficits: runs.filter((r) => r.deficit).length,
    active: summary(runs.map((r) => r.active)), runs };
}
