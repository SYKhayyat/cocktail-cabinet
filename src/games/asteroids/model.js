import { clamp } from "../../geometry.js";
import { recordDecision } from "../../decisions.js";

// Extra radius cleared around the ship when it respawns, so the spawn point
// is not still inside a rock once the grace period lapses.
const RESPAWN_CLEARANCE = 30;

// Ships are equal mass, so a bounce exchanges velocity along the collision
// normal. Below 1 sheds a little energy so a graze cannot ping forever.
const SHIP_RESTITUTION = 0.85;

// Ship computer factors. It does not roll for mistakes: it turns at a bounded
// rate, it keeps aiming where it last decided until its reaction runs out, and
// once it commits to a swerve it holds that swerve for a beat.
// The escape heading is picked from a coarse set rather than computed exactly.
// A player swerves; it does not solve for the precise tangent of a circle.
// Seconds, radians/s, pixels and px/s. Cadence jitter preserves the original
// random arithmetic as well as its draw order. See tests/ai/TUNING.md.
export const ASTEROIDS_AI_DEFAULTS = Object.freeze({
  turnRate: 3.6, reactionMin: 0.18, reactionMax: 0.38, dodgeRange: 105,
  dodgeCommitMin: 0.14, dodgeCommitMax: 0.3, escapeChoices: 8,
  speed: 165, versusSpeed: 105, initialShotDelay: 1.3,
  shotInterval: 1.3, versusShotInterval: 1.1, shotJitter: 0.3, noTargetShotDelay: 0.5
});

export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 560;

// The board wraps, so an entity just past the left edge is one pixel from one
// just before the right edge. Plain differences report those as ~800 apart,
// which makes collisions vanish at the seam and aims and dodges take the long
// way round. Every distance in this model therefore goes through wrapDeltaX/Y.
export function wrapDeltaX(a, b) {
  let delta = a - b;
  if (delta > BOARD_WIDTH / 2) delta -= BOARD_WIDTH;
  if (delta < -BOARD_WIDTH / 2) delta += BOARD_WIDTH;
  return delta;
}

export function wrapDeltaY(a, b) {
  let delta = a - b;
  if (delta > BOARD_HEIGHT / 2) delta -= BOARD_HEIGHT;
  if (delta < -BOARD_HEIGHT / 2) delta += BOARD_HEIGHT;
  return delta;
}

export function wrapDistance(ax, ay, bx, by) {
  return Math.hypot(wrapDeltaX(ax, bx), wrapDeltaY(ay, by));
}

// Wrapped equivalent of circleHitsCircle: the closest approach between two
// wrapped circles may be across the seam rather than between their own centres.
export function wrapHitsCircle(ax, ay, ar, bx, by, br) {
  return wrapDistance(ax, ay, bx, by) < ar + br;
}

export const ASTEROIDS_MODES = [
  { value: "ship", label: "Solo — fly the ship" },
  { value: "versus", label: "You vs computer — both ships" },
  { value: "rocks", label: "Computer vs you — send asteroids" }
];

export class AsteroidsModel {
  constructor({ aiTuning = {} } = {}) {
    this.aiTuning = { ...ASTEROIDS_AI_DEFAULTS, ...aiTuning };
    this.id = "asteroids";
    this.title = "Asteroids";
    this.description = "Fly with the mouse or WASD, click or hold to shoot, and break rocks into pieces. Versus mode gives both pilots a ship.";
    this.side = "ship";
    this.score = 0;
    // The engine treats lifeLost and gameOver as edge triggers, so they must
    // start as definite booleans rather than depending on the caller to clear
    // them.
    this.lifeLost = false;
    this.gameOver = false;
    this.eventLog = [];
    this.nextAsteroidId = 1;
  }
  get modes() { return ASTEROIDS_MODES; }
  get sides() { return ASTEROIDS_MODES.map((mode) => mode.value); }
  sideLabel() { return this.modes.find((mode) => mode.value === this.side)?.label || ASTEROIDS_MODES[0].label; }
  setSide(side) { if (this.sides.includes(side)) this.side = side; }
  reset(keepScore = false, { startingLives = 3 } = {}) {
    if (!keepScore) this.score = 0;
    this.scores = { human: 0, computer: 0 };
    // Round configuration is value-only, so a headless caller and the cabinet
    // use the same duel budget without a host reference.
    this.playerLives = { human: startingLives, computer: startingLives };
    this.ship = this.newShip(400, 280);
    this.computerShip = this.side === "versus" ? this.newShip(400, 160) : null;
    this.asteroids = [];
    this.bullets = [];
    this.spawnClock = 1.2;
    this.shotClock = 0;
    this.computerShotClock = this.aiTuning.initialShotDelay;
    this.invulnerable = 1;
    this.decisionLog = [];
    this.lastDecision = null;
    this.eventLog = [];
    this.nextAsteroidId = 1;
    this.asteroidSpeed = 1;
    this.won = false;
    this.gameOver = false;
    this.winner = null;
    this.lifeLost = false;
    this.draggedAsteroid = null;
    this.dragVelocityX = 0;
    this.dragVelocityY = 0;
    this.lastLifeLossOwner = null;
    // Which side the engine still owes a charge to, for losses that arrive
    // without passing through the bullet path (a rock collision).
    this.lastDuelLossOwner = null;
    if (this.side !== "rocks") for (let index = 0; index < 3; index += 1) this.spawnAsteroid();
  }
  // Ships carry a knockback velocity separate from their own thrust speed.
  // A bounce must survive the next frame even when a pilot is coasting, and
  // steering recomputes speed from thrust every frame, so an impulse written
  // straight into `speed` would be erased immediately.
  newShip(x, y) { return { x, y, angle: -Math.PI / 2, speed: 0, knockX: 0, knockY: 0, radius: 13, aiTarget: null, aiReaction: 0, aiAim: 0, aiDodgeCommit: 0, aiEscape: null }; }
  recordEvent(type, details = {}) {
    this.eventLog.push({ type, ...details });
    if (this.eventLog.length > 4096) this.eventLog.splice(0, 1024);
  }
  spawnAsteroid() {
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) { x = 20; y = Math.random() * 520; }
    if (edge === 1) { x = 780; y = Math.random() * 520; }
    if (edge === 2) { x = Math.random() * 780; y = 20; }
    if (edge === 3) { x = Math.random() * 780; y = 540; }
    const target = this.side === "versus" && Math.random() < 0.5 ? this.computerShip : this.ship;
    return this.spawnAsteroidAt(x, y, target);
  }
  steer(dt, input, ship = this.ship) {
    const turn = input.turn || 0;
    const thrust = input.thrust || 0;
    if (input.pointer) {
      const dx = wrapDeltaX(input.pointer.x, ship.x);
      const dy = wrapDeltaY(input.pointer.y, ship.y);
      if (Math.hypot(dx, dy) > 24) ship.angle = Math.atan2(dy, dx);
      const pointerThrust = input.pointer.down ? 1 : 0;
      ship.speed = thrust || pointerThrust ? Math.min(ship.speed + 190 * dt, 220) : 0;
    } else {
      ship.angle += turn * 3.2 * dt;
      ship.speed += thrust * 190 * dt;
      ship.speed *= Math.pow(0.98, dt * 60);
    }
    ship.x = (ship.x + (Math.cos(ship.angle) * ship.speed + ship.knockX) * dt + BOARD_WIDTH) % BOARD_WIDTH;
    ship.y = (ship.y + (Math.sin(ship.angle) * ship.speed + ship.knockY) * dt + BOARD_HEIGHT) % BOARD_HEIGHT;
  }
  aiShip(dt, ship = this.ship, target = null) {
    if (!target) target = this.asteroids.reduce((nearest, asteroid) => {
      if (!nearest) return asteroid;
      return wrapDistance(asteroid.x, asteroid.y, ship.x, ship.y) < wrapDistance(nearest.x, nearest.y, ship.x, ship.y) ? asteroid : nearest;
    }, null);
    if (!target) {
      ship.aiTarget = null;
      ship.aiReaction = 0;
      return;
    }
    if (ship.aiTarget !== target) {
      ship.aiTarget = target;
      ship.aiReaction = this.aiTuning.reactionMin + Math.random() * (this.aiTuning.reactionMax - this.aiTuning.reactionMin);
      ship.aiAim = Math.atan2(wrapDeltaY(target.y, ship.y), wrapDeltaX(target.x, ship.x));
    }
    ship.aiReaction = Math.max(0, ship.aiReaction - dt);
    const targetAngle = Math.atan2(wrapDeltaY(target.y, ship.y), wrapDeltaX(target.x, ship.x));
    const targetDistance = wrapDistance(target.x, target.y, ship.x, ship.y);
    const hazards = this.side === "versus" ? [this.ship, ...this.asteroids] : [target];
    const hazard = hazards.reduce((nearest, candidate) => !nearest || wrapDistance(candidate.x, candidate.y, ship.x, ship.y) < wrapDistance(nearest.x, nearest.y, ship.x, ship.y) ? candidate : nearest, null);
    const hazardDistance = hazard ? wrapDistance(hazard.x, hazard.y, ship.x, ship.y) : Infinity;
    const hazardAngle = hazard ? Math.atan2(wrapDeltaY(hazard.y, ship.y), wrapDeltaX(hazard.x, ship.x)) : targetAngle;
    const dodging = this.side === "versus" ? hazardDistance < this.aiTuning.dodgeRange : targetDistance < this.aiTuning.dodgeRange;
    ship.aiDodgeCommit = Math.max(0, (ship.aiDodgeCommit || 0) - dt);

    let desiredAngle;
    let replanned = false;
    if (dodging) {
      // A swerve is committed. Without this the escape heading is recomputed every
      // frame from a moving hazard, so the ship jitters on the spot instead of
      // actually getting away from anything.
      // Whether this frame picks a fresh swerve or holds the previous one.
      replanned = ship.aiDodgeCommit <= 0;
      if (replanned) {
        const escape = hazardAngle + Math.PI;
        const step = (Math.PI * 2) / this.aiTuning.escapeChoices;
        ship.aiEscape = Math.round(escape / step) * step;
        ship.aiDodgeCommit = this.aiTuning.dodgeCommitMin + Math.random() * (this.aiTuning.dodgeCommitMax - this.aiTuning.dodgeCommitMin);
      }
      desiredAngle = ship.aiEscape ?? hazardAngle + Math.PI;
    } else {
      // Still reacting to where the rock was when it last looked.
      desiredAngle = ship.aiReaction > 0 ? ship.aiAim : targetAngle;
    }
    recordDecision(this, {
      side: this.side,
      dodging,
      hazardDistance: Math.round(hazardDistance),
      desiredAngle,
      replanned
    });
    let difference = desiredAngle - ship.angle;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    ship.angle += clamp(difference, -this.aiTuning.turnRate * dt, this.aiTuning.turnRate * dt);
    ship.speed = this.side === "versus" ? this.aiTuning.versusSpeed : this.aiTuning.speed;
    ship.x = (ship.x + (Math.cos(ship.angle) * ship.speed + ship.knockX) * dt + BOARD_WIDTH) % BOARD_WIDTH;
    ship.y = (ship.y + (Math.sin(ship.angle) * ship.speed + ship.knockY) * dt + BOARD_HEIGHT) % BOARD_HEIGHT;
  }
  fire(owner = "human", ship = this.ship, aimError = 0, aimAngle = ship.angle) {
    if (owner === "human") this.asteroidSpeed = Math.min(1.8, this.asteroidSpeed + 0.012);
    const angle = aimAngle + aimError;
    this.bullets.push({ x: ship.x + Math.cos(angle) * ship.radius, y: ship.y + Math.sin(angle) * ship.radius, vx: Math.cos(angle) * 360, vy: Math.sin(angle) * 360, life: 1, owner });
  }
  fractureAsteroid(asteroid) {
    const speed = Math.max(35, Math.hypot(asteroid.vx, asteroid.vy));
    const angle = Math.atan2(asteroid.vy, asteroid.vx);
    for (const offset of [-0.9, 0.9]) this.asteroids.push({ id: this.nextAsteroidId++, x: asteroid.x, y: asteroid.y, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed, radius: asteroid.radius * 0.55, rotation: asteroid.rotation, spin: asteroid.spin * 1.2, shape: asteroid.shape.map((scale) => 0.78 + scale * 0.22), tone: asteroid.tone, generation: 1 });
    asteroid.radius = 0;
  }
  updateRockPlacement(input) {
    const pointer = input.pointer;
    if (!pointer) return;
    if (pointer.down && pointer.dragDistance > 0 && this.asteroids.length < 8) {
      if (!this.draggedAsteroid) this.draggedAsteroid = this.spawnAsteroidAt(pointer.x, pointer.y, this.ship, { vx: 0, vy: 0 });
      this.draggedAsteroid.x = clamp(pointer.x, 10, 790);
      this.draggedAsteroid.y = clamp(pointer.y, 10, 550);
      this.dragVelocityX = clamp(pointer.dragDeltaX / Math.max(0.001, input.dt || 1 / 60), -280, 280);
      this.dragVelocityY = clamp((pointer.dragDeltaY || 0) / Math.max(0.001, input.dt || 1 / 60), -280, 280);
    }
    if (pointer.released) {
      if (this.draggedAsteroid) {
        this.draggedAsteroid.vx = this.dragVelocityX;
        this.draggedAsteroid.vy = this.dragVelocityY;
        this.draggedAsteroid = null;
      } else if (this.asteroids.length < 8) this.spawnAsteroidAt(pointer.x, pointer.y, this.ship);
    }
  }
  update(dt, input) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.side === "versus") {
      // Knockback bleeds off quickly so a bounce reads as a shove, not a drift.
      const bleed = Math.pow(0.9, dt * 60);
      for (const ship of [this.ship, this.computerShip]) {
        ship.knockX *= bleed;
        ship.knockY *= bleed;
      }
    }
    if (this.side === "ship") this.steer(dt, input);
    else if (this.side === "rocks") this.aiShip(dt);
    else {
      this.steer(dt, input);
      this.aiShip(dt, this.computerShip);
    }
    this.shotClock -= dt;
    this.computerShotClock -= dt;
    if ((this.side === "ship" || this.side === "versus") && input.fire && this.shotClock <= 0) { this.fire("human", this.ship); this.shotClock = 0.18; }
    if ((this.side === "rocks" || this.side === "versus") && this.computerShotClock <= 0) {
      const computerShip = this.side === "versus" ? this.computerShip : this.ship;
      const computerTarget = this.side === "versus" ? this.computerShip.aiTarget : this.asteroids.reduce((nearest, asteroid) => !nearest || wrapDistance(asteroid.x, asteroid.y, this.ship.x, this.ship.y) < wrapDistance(nearest.x, nearest.y, this.ship.x, this.ship.y) ? asteroid : nearest, null);
      if (computerTarget) {
        this.fire("computer", computerShip, 0, computerShip.angle);
        this.computerShotClock = (this.side === "versus" ? this.aiTuning.versusShotInterval : this.aiTuning.shotInterval) + Math.random() * this.aiTuning.shotJitter;
      } else this.computerShotClock = this.aiTuning.noTargetShotDelay;
    }
    if (this.side === "rocks") {
      if (input.spawnAsteroid && this.asteroids.length < 8) this.spawnAsteroidAt(input.spawnAsteroid.x, input.spawnAsteroid.y, this.ship);
      this.updateRockPlacement({ ...input, dt });
    }
    if (this.side === "ship" || this.side === "versus") { this.spawnClock -= dt; if (this.spawnClock <= 0 && this.asteroids.length < 7) { this.spawnAsteroid(); this.spawnClock = Math.max(0.25, 1.3 - this.score * 0.012); } }
    for (const asteroid of this.asteroids) { asteroid.x = (asteroid.x + asteroid.vx * this.asteroidSpeed * dt + BOARD_WIDTH) % BOARD_WIDTH; asteroid.y = (asteroid.y + asteroid.vy * this.asteroidSpeed * dt + BOARD_HEIGHT) % BOARD_HEIGHT; asteroid.rotation += asteroid.spin * dt; }
    for (const bullet of this.bullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt; }
    if (this.side === "versus") {
      // Separation is measured across the seam too: two ships meeting at the
      // wrap boundary are close, not half a board apart.
      const dx = wrapDeltaX(this.computerShip.x, this.ship.x);
      const dy = wrapDeltaY(this.computerShip.y, this.ship.y);
      const distance = Math.hypot(dx, dy);
      const minimumDistance = this.ship.radius + this.computerShip.radius;
      if (distance < minimumDistance) {
        // Ships bounce. This used to point both ships away from each other and
        // teleport them apart, which overwrote each pilot's own heading and made
        // the computer look like it was dragging the human around. Now only the
        // velocity along the collision normal is exchanged -- the equal-mass
        // elastic result -- so a pilot who is not flying into the other ship is
        // left alone.
        const normalX = distance > 0 ? dx / distance : 1;
        const normalY = distance > 0 ? dy / distance : 0;
        // Relative velocity must include knockback already in flight. Measuring
        // thrust alone re-applies a full impulse every frame to two ships that
        // are already flying apart, which shakes them instead of bouncing them.
        const humanThrustX = Math.cos(this.ship.angle) * this.ship.speed + this.ship.knockX;
        const humanThrustY = Math.sin(this.ship.angle) * this.ship.speed + this.ship.knockY;
        const computerThrustX = Math.cos(this.computerShip.angle) * this.computerShip.speed + this.computerShip.knockX;
        const computerThrustY = Math.sin(this.computerShip.angle) * this.computerShip.speed + this.computerShip.knockY;
        // The normal runs from the human to the computer, so the human closing on
        // the computer is a positive projection: they are approaching when the
        // relative velocity points along the normal.
        const closingSpeed = (humanThrustX - computerThrustX) * normalX + (humanThrustY - computerThrustY) * normalY;
        if (closingSpeed > 0) {
          const impulse = (1 + SHIP_RESTITUTION) * closingSpeed / 2;
          this.ship.knockX -= impulse * normalX;
          this.ship.knockY -= impulse * normalY;
          this.computerShip.knockX += impulse * normalX;
          this.computerShip.knockY += impulse * normalY;
        }
        // Still nudge them out of each other so they cannot sit overlapped; this
        // is a de-overlap, not the shove, and it never touches heading.
        // The normal runs human -> computer, so each ship is pushed along it in
        // the opposite direction. Adding it to the human drove both ships
        // straight through each other, which is the same "drag" symptom from the
        // other side.
        const separation = (minimumDistance - distance) / 2;
        this.ship.x = (this.ship.x - normalX * separation + BOARD_WIDTH) % BOARD_WIDTH;
        this.ship.y = (this.ship.y - normalY * separation + BOARD_HEIGHT) % BOARD_HEIGHT;
        this.computerShip.x = (this.computerShip.x + normalX * separation + BOARD_WIDTH) % BOARD_WIDTH;
        this.computerShip.y = (this.computerShip.y + normalY * separation + BOARD_HEIGHT) % BOARD_HEIGHT;
      }
    }
    for (const bullet of this.bullets) {
      if (bullet.life <= 0) continue;
      for (const asteroid of this.asteroids) {
        if (!asteroid.radius || !wrapHitsCircle(bullet.x, bullet.y, 3, asteroid.x, asteroid.y, asteroid.radius)) continue;
        bullet.life = 0;
        this.scores[bullet.owner || "human"] += 10;
        if (this.side !== "versus" || bullet.owner === "human") this.score = this.scores.human;
        if ((asteroid.generation ?? 0) === 0) this.fractureAsteroid(asteroid);
        else asteroid.radius = 0;
        break;
      }
    }
    if (this.side === "versus") this.resolveDuelBullets();
    this.asteroids = this.asteroids.filter((asteroid) => asteroid.radius);
    this.bullets = this.bullets.filter((bullet) => bullet.life > 0);
    if (this.asteroids.length === 0 && (this.side === "ship" || this.side === "versus")) this.spawnAsteroid();
    this.resolveShipHazards();
    // One terminal check per update, covering every way a life can be spent.
    // Lives can reach zero through a bullet, through a rock, or through both
    // in the same frame, so the check lives here rather than in each path.
    if (this.side === "versus" && (this.playerLives.human <= 0 || this.playerLives.computer <= 0)) this.lifeLost = true;
  }
  // Rocks threaten both pilots in the duel, as the view states. The respawn
  // grace period covers whichever ship respawned, so a life lost to a rock
  // cannot immediately cost a second life while the ship is still blinking.
  resolveShipHazards() {
    if (this.side !== "versus") {
      const asteroid = this.asteroids.find((candidate) => wrapHitsCircle(this.ship.x, this.ship.y, this.ship.radius, candidate.x, candidate.y, candidate.radius));
      if (this.invulnerable === 0 && asteroid) {
        if (!this.lifeLost) {
          this.recordEvent("asteroid-collision", { asteroidId: asteroid.id ?? null, owner: "human" });
          this.lifeLost = true;
          this.lastLifeLossOwner = "human";
          this.recordEvent("life-loss", { owner: "human", cause: "asteroid" });
        }
      }
      return;
    }
    for (const [owner, ship] of [["human", this.ship], ["computer", this.computerShip]]) {
      if (!ship) continue;
      const asteroid = this.asteroids.find((candidate) => wrapHitsCircle(ship.x, ship.y, ship.radius, candidate.x, candidate.y, candidate.radius));
      if (!asteroid) continue;
      if (owner === "human") {
        if (this.invulnerable === 0) {
          this.recordEvent("asteroid-collision", { asteroidId: asteroid.id ?? null, owner });
          this.chargeLifeLoss("human", "asteroid");
        }
        continue;
      }
      this.recordEvent("asteroid-collision", { asteroidId: asteroid.id ?? null, owner });
      this.chargeLifeLoss("computer", "asteroid");
      // Move the computer clear so it does not lose every remaining life to
      // one rock in consecutive frames.
      ship.x = (ship.x + 240) % 800;
      ship.y = clamp(ship.y, 40, 520);
      ship.aiTarget = null;
    }
  }
  spawnAsteroidAt(x, y, target = this.ship, velocity = null) {
    const angle = velocity ? Math.atan2(velocity.vy, velocity.vx) : Math.atan2(wrapDeltaY(target.y, y), wrapDeltaX(target.x, x)) + (Math.random() - 0.5) * 0.8;
    const speed = velocity ? Math.hypot(velocity.vx, velocity.vy) : 48 + this.score * 0.4;
    const asteroid = { id: this.nextAsteroidId++, x: clamp(x, 10, 790), y: clamp(y, 10, 550), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 20 + Math.random() * 10, rotation: 0, spin: (Math.random() - 0.5) * 1.8, shape: Array.from({ length: 9 }, () => 0.72 + Math.random() * 0.35), tone: Math.random(), generation: 0 };
    this.asteroids.push(asteroid);
    return asteroid;
  }
  // A bullet is spent by either ship regardless of who fired it. A hit on the
  // computer spends one of its lives; a hit on the human spends a life and
  // raises the shared lifeLost flag, so both sides resolve through the same
  // engine path instead of the duel silently being one-sided.
  resolveDuelBullets() {
    for (const bullet of this.bullets) {
      if (bullet.life <= 0) continue;
      if (bullet.owner === "human" && this.computerShip && wrapHitsCircle(bullet.x, bullet.y, 3, this.computerShip.x, this.computerShip.y, this.computerShip.radius)) {
        bullet.life = 0;
        this.chargeLifeLoss("computer");
        continue;
      }
      if (bullet.owner === "computer" && wrapHitsCircle(bullet.x, bullet.y, 3, this.ship.x, this.ship.y, this.ship.radius)) {
        bullet.life = 0;
        this.chargeLifeLoss("human");
      }
    }
  }
  // One authoritative resolution path for the duel. Every way a life can be lost
  // -- a computer bullet, a rock, or reaching zero -- is charged here against
  // the same playerLives counters the overlay reads. Bullets already decremented
  // at the point of impact; rock collisions only raised the flag, so the duel
  // counter never moved while the round still restarted.
  chargeLifeLoss(owner, cause = "bullet") {
    this.playerLives[owner] = Math.max(0, this.playerLives[owner] - 1);
    this.lifeLost = true;
    this.lastDuelLossOwner = owner;
    this.recordEvent("life-loss", { owner, cause });
  }
  handleLifeLoss() {
    if (this.side !== "versus") {
      if (!this.lifeLost && this.lastLifeLossOwner === null) return null;
      this.lifeLost = false;
      this.lastLifeLossOwner = null;
      return { gameOver: false, message: "One life lost — starting again in 3…" };
    }
    if (this.playerLives.human <= 0 || this.playerLives.computer <= 0) {
      this.gameOver = true;
      this.won = true;
      this.winner = this.playerLives.human <= 0 ? "computer" : "human";
      return { gameOver: true, message: `${this.winner === "human" ? "You win" : "Computer wins"} the space duel!` };
    }
    // The pending owner is a durable edge trigger even for a caller that has
    // already cleared lifeLost; an already-charged duel loss must not be spent twice.
    if (!this.lifeLost && this.lastDuelLossOwner === null) return null;
    this.lifeLost = false;
    // Keep the fallback for a caller that raises lifeLost directly, but all real
    // bullet and rock collisions use chargeLifeLoss() before reaching here.
    if (this.lastDuelLossOwner === null) {
      this.playerLives.human = Math.max(0, this.playerLives.human - 1);
      this.lastDuelLossOwner = "human";
      if (this.playerLives.human <= 0) {
        this.gameOver = true;
        this.won = true;
        this.winner = "computer";
        return { gameOver: true, message: "Computer wins the space duel!" };
      }
    }
    const owner = this.lastDuelLossOwner;
    this.lastDuelLossOwner = null;
    return { gameOver: false, owner, message: owner === "computer" ? "The computer lost a life." : "You lost a life." };
  }
  // Every mode respawns. This used to return early outside versus, so in the
  // solo modes a life lost left the ship exactly where it collided -- often
  // still inside the rock -- and the next update consumed another life with no
  // grace period to move away.
  resetAfterLife() {
    this.ship.x = 400;
    this.ship.y = 280;
    this.ship.angle = -Math.PI / 2;
    this.ship.speed = 0;
    this.ship.knockX = 0;
    this.ship.knockY = 0;
    this.invulnerable = 1.2;
    this.lifeLost = false;
    this.lastLifeLossOwner = null;
    // Clear the respawn area. Repositioning the ship alone is not enough: a
    // rock can drift over the fixed spawn point, and once the grace period
    // lapses -- which is sooner than the three-second countdown -- the same
    // collision takes another life. The blast is small and reads as the
    // respawn pushing the rocks off.
    this.asteroids = this.asteroids.filter((asteroid) => {
      if (!wrapHitsCircle(this.ship.x, this.ship.y, this.ship.radius + RESPAWN_CLEARANCE, asteroid.x, asteroid.y, asteroid.radius)) return true;
      this.recordEvent("asteroid-despawn", { asteroidId: asteroid.id ?? null, reason: "life-reset" });
      return false;
    });
    if (this.side === "rocks") {
      // The computer steers the ship in rocks mode, so its targeting state has
      // to be dropped too or it resumes aiming at the rock it just hit.
      this.ship.aiTarget = null;
      this.ship.aiReaction = 0;
      this.ship.aiAim = 0;
      this.ship.aiDodgeCommit = 0;
      this.ship.aiEscape = null;
    }
    if (this.side !== "versus") return;
    // The computer's position is restored alongside the human's, so a life
    // lost does not leave the duel with the computer displaced or missing.
    this.computerShip = this.newShip(400, 160);
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "versus" ? "Shoot the opposing ship and protect your own." : "Asteroids vary in size, shape, speed, and rotation as the score rises." }; }
}
