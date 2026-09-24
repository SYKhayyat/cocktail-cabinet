import { clamp, circleHitsCircle } from "../../engine.js";

export class AsteroidsModel {
  constructor() {
    this.id = "asteroids";
    this.title = "Asteroids";
    this.description = "Fly with the mouse or WASD, click or hold to shoot, and break rocks into pieces. Versus mode gives both pilots a ship.";
    this.side = "ship";
    this.score = 0;
  }
  sideLabel() { return this.side === "ship" ? "You fly the ship" : this.side === "versus" ? "You and the computer fly" : "You send the asteroids"; }
  setSide(side) { this.side = side; }
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
    this.draggedAsteroid = null;
    this.dragVelocityX = 0;
    this.dragVelocityY = 0;
    this.computerMistake = false;
    this.computerMistakeClock = 5 + Math.random() * 4;
    this.lastLifeLossOwner = null;
    for (let index = 0; index < 3; index += 1) this.spawnAsteroid();
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
      const dx = input.pointer.x - ship.x;
      const dy = input.pointer.y - ship.y;
      if (Math.hypot(dx, dy) > 24) ship.angle = Math.atan2(dy, dx);
      ship.speed = thrust ? Math.min(ship.speed + 190 * dt, 220) : 0;
    } else {
      ship.angle += turn * 3.2 * dt;
      ship.speed += thrust * 190 * dt;
      ship.speed *= Math.pow(0.98, dt * 60);
    }
    ship.x = (ship.x + Math.cos(ship.angle) * ship.speed * dt + 800) % 800;
    ship.y = (ship.y + Math.sin(ship.angle) * ship.speed * dt + 560) % 560;
  }
  aiShip(dt, ship = this.ship, target = null) {
    if (!target) target = this.asteroids.reduce((nearest, asteroid) => {
      if (!nearest) return asteroid;
      return Math.hypot(asteroid.x - ship.x, asteroid.y - ship.y) < Math.hypot(nearest.x - ship.x, nearest.y - ship.y) ? asteroid : nearest;
    }, null);
    if (!target) return;
    if (ship.aiTarget !== target) {
      ship.aiTarget = target;
      ship.aiReaction = 0.2 + Math.random() * 0.24;
      ship.aiError = (Math.random() - 0.5) * 0.9;
      ship.aiAim = Math.atan2(target.y - ship.y, target.x - ship.x);
    }
    ship.aiReaction = Math.max(0, ship.aiReaction - dt);
    const targetAngle = Math.atan2(target.y - ship.y, target.x - ship.x);
    const distance = Math.hypot(target.x - ship.x, target.y - ship.y);
    const desiredAngle = this.side === "rocks" && distance < 105 ? targetAngle + Math.PI : ship.aiReaction > 0 ? ship.aiAim + ship.aiError : targetAngle;
    let difference = desiredAngle - ship.angle;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    ship.angle += clamp(difference, -3.6 * dt, 3.6 * dt);
    ship.speed = this.side === "versus" ? 105 : 165;
    ship.x = (ship.x + Math.cos(ship.angle) * ship.speed * dt + 800) % 800;
    ship.y = (ship.y + Math.sin(ship.angle) * ship.speed * dt + 560) % 560;
  }
  fire(owner = "human", ship = this.ship, aimError = 0) {
    if (owner === "human") this.asteroidSpeed = Math.min(1.8, this.asteroidSpeed + 0.012);
    const angle = ship.angle + aimError;
    this.bullets.push({ x: ship.x, y: ship.y, vx: Math.cos(angle) * 360, vy: Math.sin(angle) * 360, life: 1, owner });
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
    if (this.side === "rocks") {
      this.computerMistakeClock -= dt;
      if (this.computerMistakeClock <= 0) { this.computerMistake = Math.random() < 0.2; this.computerMistakeClock = 8 + Math.random() * 6; }
      if (this.computerMistake && this.invulnerable === 0 && this.asteroids.some((asteroid) => Math.hypot(asteroid.x - this.ship.x, asteroid.y - this.ship.y) < 72)) { this.computerMistake = false; this.lifeLost = true; }
    }
    if (this.side === "ship") this.steer(dt, input);
    else if (this.side === "rocks") this.aiShip(dt);
    else {
      this.steer(dt, input);
      this.aiShip(dt, this.computerShip, this.ship);
    }
    this.shotClock -= dt;
    this.computerShotClock -= dt;
    if ((this.side === "ship" || this.side === "versus") && input.fire && this.shotClock <= 0) { this.fire("human", this.ship); this.shotClock = 0.18; }
    if ((this.side === "rocks" || this.side === "versus") && this.computerShotClock <= 0) { this.fire("computer", this.side === "versus" ? this.computerShip : this.ship, (Math.random() - 0.5) * 0.42); this.computerShotClock = this.side === "versus" ? 1.1 + Math.random() * 0.3 : 1.3 + Math.random() * 0.3; }
    if (this.side === "rocks") this.updateRockPlacement({ ...input, dt });
    if (this.side === "ship" || this.side === "versus") { this.spawnClock -= dt; if (this.spawnClock <= 0 && this.asteroids.length < 7) { this.spawnAsteroid(); this.spawnClock = Math.max(0.25, 1.3 - this.score * 0.012); } }
    for (const asteroid of this.asteroids) { asteroid.x = (asteroid.x + asteroid.vx * this.asteroidSpeed * dt + 800) % 800; asteroid.y = (asteroid.y + asteroid.vy * this.asteroidSpeed * dt + 560) % 560; asteroid.rotation += asteroid.spin * dt; }
    for (const bullet of this.bullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt; }
    for (const bullet of this.bullets) {
      if (bullet.life <= 0) continue;
      for (const asteroid of this.asteroids) {
        if (!asteroid.radius || !circleHitsCircle(bullet.x, bullet.y, 3, asteroid.x, asteroid.y, asteroid.radius)) continue;
        bullet.life = 0;
        this.scores[bullet.owner || "human"] += 10;
        if (this.side !== "versus" || bullet.owner === "human") this.score = this.scores.human;
        if ((asteroid.generation ?? 0) === 0) this.fractureAsteroid(asteroid);
        else asteroid.radius = 0;
        break;
      }
    }
    if (this.side === "versus") {
      for (const bullet of this.bullets) {
        if (bullet.owner === "human" && this.computerShip && circleHitsCircle(bullet.x, bullet.y, 3, this.computerShip.x, this.computerShip.y, this.computerShip.radius)) { bullet.life = 0; this.playerLives.computer = Math.max(0, this.playerLives.computer - 1); }
        if (bullet.owner === "computer" && circleHitsCircle(bullet.x, bullet.y, 3, this.ship.x, this.ship.y, this.ship.radius)) { bullet.life = 0; this.playerLives.human = Math.max(0, this.playerLives.human - 1); this.lifeLost = true; this.lastLifeLossOwner = "human"; }
      }
    }
    this.asteroids = this.asteroids.filter((asteroid) => asteroid.radius);
    this.bullets = this.bullets.filter((bullet) => bullet.life > 0);
    if (this.asteroids.length === 0 && (this.side === "ship" || this.side === "versus")) this.spawnAsteroid();
    if (this.invulnerable === 0 && this.asteroids.some((asteroid) => circleHitsCircle(this.ship.x, this.ship.y, this.ship.radius, asteroid.x, asteroid.y, asteroid.radius))) this.lifeLost = true;
  }
  spawnAsteroidAt(x, y, target = this.ship, velocity = null) {
    const angle = velocity ? Math.atan2(velocity.vy, velocity.vx) : Math.atan2(target.y - y, target.x - x) + (Math.random() - 0.5) * 0.8;
    const speed = velocity ? Math.hypot(velocity.vx, velocity.vy) : 48 + this.score * 0.4;
    const asteroid = { x: clamp(x, 10, 790), y: clamp(y, 10, 550), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 20 + Math.random() * 10, rotation: 0, spin: (Math.random() - 0.5) * 1.8, shape: Array.from({ length: 9 }, () => 0.72 + Math.random() * 0.35), tone: Math.random(), generation: 0 };
    this.asteroids.push(asteroid);
    return asteroid;
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
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "versus" ? "Shoot the opposing ship and protect your own." : "Asteroids vary in size, shape, speed, and rotation as the score rises." }; }
}
