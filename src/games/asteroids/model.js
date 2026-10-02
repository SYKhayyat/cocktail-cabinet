import { clamp } from "../../engine.js";

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
  constructor() {
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
  }
  get modes() { return ASTEROIDS_MODES; }
  get sides() { return ASTEROIDS_MODES.map((mode) => mode.value); }
  sideLabel() { return this.modes.find((mode) => mode.value === this.side)?.label || ASTEROIDS_MODES[0].label; }
  setSide(side) { if (this.sides.includes(side)) this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.scores = { human: 0, computer: 0 };
    this.playerLives = { human: 3, computer: 3 };
    this.ship = this.newShip(400, 280);
    this.computerShip = this.side === "versus" ? this.newShip(400, 160) : null;
    this.asteroids = [];
    this.bullets = [];
    this.spawnClock = 1.2;
    this.shotClock = 0;
    this.computerShotClock = 1.3;
    this.invulnerable = 1;
    this.asteroidSpeed = 1;
    this.won = false;
    this.gameOver = false;
    this.winner = null;
    this.lifeLost = false;
    this.draggedAsteroid = null;
    this.dragVelocityX = 0;
    this.dragVelocityY = 0;
    this.computerMistake = false;
    this.computerMistakeClock = 5 + Math.random() * 4;
    this.shipCollisionCooldown = 0;
    this.lastLifeLossOwner = null;
    if (this.side !== "rocks") for (let index = 0; index < 3; index += 1) this.spawnAsteroid();
  }
  newShip(x, y) { return { x, y, angle: -Math.PI / 2, speed: 0, radius: 13, aiTarget: null, aiReaction: 0, aiError: 0, aiAim: 0 }; }
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
    ship.x = (ship.x + Math.cos(ship.angle) * ship.speed * dt + BOARD_WIDTH) % BOARD_WIDTH;
    ship.y = (ship.y + Math.sin(ship.angle) * ship.speed * dt + BOARD_HEIGHT) % BOARD_HEIGHT;
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
      ship.aiReaction = 0.2 + Math.random() * 0.24;
      ship.aiError = (Math.random() - 0.5) * 0.9;
      ship.aiAim = Math.atan2(wrapDeltaY(target.y, ship.y), wrapDeltaX(target.x, ship.x));
    }
    ship.aiReaction = Math.max(0, ship.aiReaction - dt);
    const targetAngle = Math.atan2(wrapDeltaY(target.y, ship.y), wrapDeltaX(target.x, ship.x));
    const targetDistance = wrapDistance(target.x, target.y, ship.x, ship.y);
    const hazards = this.side === "versus" ? [this.ship, ...this.asteroids] : [target];
    const hazard = hazards.reduce((nearest, candidate) => !nearest || wrapDistance(candidate.x, candidate.y, ship.x, ship.y) < wrapDistance(nearest.x, nearest.y, ship.x, ship.y) ? candidate : nearest, null);
    const hazardDistance = hazard ? wrapDistance(hazard.x, hazard.y, ship.x, ship.y) : Infinity;
    const hazardAngle = hazard ? Math.atan2(wrapDeltaY(hazard.y, ship.y), wrapDeltaX(hazard.x, ship.x)) : targetAngle;
    const dodging = this.side === "versus" ? hazardDistance < 120 : targetDistance < 105;
    const desiredAngle = dodging ? hazardAngle + Math.PI : ship.aiReaction > 0 ? ship.aiAim + ship.aiError : targetAngle;
    let difference = desiredAngle - ship.angle;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    ship.angle += clamp(difference, -3.6 * dt, 3.6 * dt);
    ship.speed = this.side === "versus" ? 105 : 165;
    ship.x = (ship.x + Math.cos(ship.angle) * ship.speed * dt + BOARD_WIDTH) % BOARD_WIDTH;
    ship.y = (ship.y + Math.sin(ship.angle) * ship.speed * dt + BOARD_HEIGHT) % BOARD_HEIGHT;
  }
  fire(owner = "human", ship = this.ship, aimError = 0, aimAngle = ship.angle) {
    if (owner === "human") this.asteroidSpeed = Math.min(1.8, this.asteroidSpeed + 0.012);
    const angle = aimAngle + aimError;
    this.bullets.push({ x: ship.x + Math.cos(angle) * ship.radius, y: ship.y + Math.sin(angle) * ship.radius, vx: Math.cos(angle) * 360, vy: Math.sin(angle) * 360, life: 1, owner });
  }
  fractureAsteroid(asteroid) {
    const speed = Math.max(35, Math.hypot(asteroid.vx, asteroid.vy));
    const angle = Math.atan2(asteroid.vy, asteroid.vx);
    for (const offset of [-0.9, 0.9]) this.asteroids.push({ x: asteroid.x, y: asteroid.y, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed, radius: asteroid.radius * 0.55, rotation: asteroid.rotation, spin: asteroid.spin * 1.2, shape: asteroid.shape.map((scale) => 0.78 + scale * 0.22), tone: asteroid.tone, generation: 1 });
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
    this.shipCollisionCooldown = Math.max(0, this.shipCollisionCooldown - dt);
    if (this.side === "rocks") {
      this.computerMistakeClock -= dt;
      if (this.computerMistakeClock <= 0) { this.computerMistake = Math.random() < 0.2; this.computerMistakeClock = 8 + Math.random() * 6; }
      if (this.computerMistake && this.invulnerable === 0 && this.asteroids.some((asteroid) => wrapDistance(asteroid.x, asteroid.y, this.ship.x, this.ship.y) < 72)) { this.computerMistake = false; this.lifeLost = true; }
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
        this.computerShotClock = this.side === "versus" ? 1.1 + Math.random() * 0.3 : 1.3 + Math.random() * 0.3;
      } else this.computerShotClock = 0.5;
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
        const angle = distance > 0 ? Math.atan2(dy, dx) : 0;
        const separation = minimumDistance - distance;
        const humanSpeed = this.ship.speed;
        const computerSpeed = this.computerShip.speed;
        this.ship.x = (this.ship.x - Math.cos(angle) * separation / 2 + BOARD_WIDTH) % BOARD_WIDTH;
        this.ship.y = (this.ship.y - Math.sin(angle) * separation / 2 + BOARD_HEIGHT) % BOARD_HEIGHT;
        this.computerShip.x = (this.computerShip.x + Math.cos(angle) * separation / 2 + BOARD_WIDTH) % BOARD_WIDTH;
        this.computerShip.y = (this.computerShip.y + Math.sin(angle) * separation / 2 + BOARD_HEIGHT) % BOARD_HEIGHT;
        this.ship.angle = angle + Math.PI;
        this.computerShip.angle = angle;
        this.ship.speed = Math.max(80, humanSpeed);
        this.computerShip.speed = Math.max(80, computerSpeed);
        this.shipCollisionCooldown = 0.75;
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
      if (this.invulnerable === 0 && this.asteroids.some((asteroid) => wrapHitsCircle(this.ship.x, this.ship.y, this.ship.radius, asteroid.x, asteroid.y, asteroid.radius))) this.lifeLost = true;
      return;
    }
    for (const [owner, ship] of [["human", this.ship], ["computer", this.computerShip]]) {
      if (!ship) continue;
      const hit = this.asteroids.some((asteroid) => wrapHitsCircle(ship.x, ship.y, ship.radius, asteroid.x, asteroid.y, asteroid.radius));
      if (!hit) continue;
      if (owner === "human") {
        if (this.invulnerable === 0) this.lifeLost = true;
        continue;
      }
      this.playerLives.computer = Math.max(0, this.playerLives.computer - 1);
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
    const asteroid = { x: clamp(x, 10, 790), y: clamp(y, 10, 550), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 20 + Math.random() * 10, rotation: 0, spin: (Math.random() - 0.5) * 1.8, shape: Array.from({ length: 9 }, () => 0.72 + Math.random() * 0.35), tone: Math.random(), generation: 0 };
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
        this.playerLives.computer = Math.max(0, this.playerLives.computer - 1);
        continue;
      }
      if (bullet.owner === "computer" && wrapHitsCircle(bullet.x, bullet.y, 3, this.ship.x, this.ship.y, this.ship.radius)) {
        bullet.life = 0;
        this.playerLives.human = Math.max(0, this.playerLives.human - 1);
        this.lifeLost = true;
      }
    }
  }
  handleLifeLoss() {
    if (this.side !== "versus") return null;
    if (this.playerLives.human <= 0 || this.playerLives.computer <= 0) {
      this.gameOver = true;
      this.won = true;
      this.winner = this.playerLives.human <= 0 ? "computer" : "human";
      return { gameOver: true, message: `${this.winner === "human" ? "You win" : "Computer wins"} the space duel!` };
    }
    if (!this.lifeLost) return null;
    this.lifeLost = false;
    return { gameOver: false, message: "You lost a life." };
  }
  resetAfterLife() {
    if (this.side !== "versus") return;
    this.ship.x = 400;
    this.ship.y = 280;
    this.ship.angle = -Math.PI / 2;
    this.ship.speed = 0;
    this.invulnerable = 1.2;
    // The computer's position is restored alongside the human's, so a life
    // lost does not leave the duel with the computer displaced or missing.
    this.computerShip = this.newShip(400, 160);
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "versus" ? "Shoot the opposing ship and protect your own." : "Asteroids vary in size, shape, speed, and rotation as the score rises." }; }
}
