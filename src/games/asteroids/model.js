import { clamp, circleHitsCircle } from "../../engine.js";

export class AsteroidsModel {
  constructor() {
    this.id = "asteroids";
    this.title = "Asteroids";
    this.description = "Normal play: fly the ship with the mouse or WASD and click to shoot. Flipped play: click the sky to send rocks.";
    this.side = "ship";
    this.score = 0;
  }
  sideLabel() { return this.side === "ship" ? "You fly the ship" : "You send the asteroids"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.ship = { x: 400, y: 280, angle: -Math.PI / 2, speed: 0, radius: 13 };
    this.asteroids = []; this.bullets = []; this.spawnClock = 1.2; this.shotClock = 0; this.invulnerable = 1; this.asteroidSpeed = 1;
    for (let index = 0; index < 3; index += 1) this.spawnAsteroid();
  }
  spawnAsteroid() {
    const edge = Math.floor(Math.random() * 4); let x = 0; let y = 0;
    if (edge === 0) { x = 20; y = Math.random() * 520; }
    if (edge === 1) { x = 780; y = Math.random() * 520; }
    if (edge === 2) { x = Math.random() * 780; y = 20; }
    if (edge === 3) { x = Math.random() * 780; y = 540; }
    const angle = Math.atan2(this.ship.y - y, this.ship.x - x) + (Math.random() - 0.5) * 0.35;
    const speed = 48 + this.score * 0.4;
    this.asteroids.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 20 + Math.random() * 12, rotation: Math.random() * 6, spin: (Math.random() - 0.5) * 1.8, shape: Array.from({ length: 9 }, () => 0.72 + Math.random() * 0.35), tone: Math.random(), generation: 0 });
  }
  steer(dt, input) {
    const turn = input.turn || 0;
    const thrust = input.thrust || 0;
    if (input.pointer) {
      const dx = input.pointer.x - this.ship.x;
      const dy = input.pointer.y - this.ship.y;
      if (Math.hypot(dx, dy) > 24) {
        this.ship.angle = Math.atan2(dy, dx);
        this.ship.speed = Math.min(this.ship.speed + 170 * dt, 220);
      } else this.ship.speed *= Math.pow(0.9, dt * 60);
    } else {
      this.ship.angle += turn * 3.2 * dt;
      this.ship.speed += thrust * 190 * dt;
      this.ship.speed *= Math.pow(0.98, dt * 60);
    }
    this.ship.x = (this.ship.x + Math.cos(this.ship.angle) * this.ship.speed * dt + 800) % 800;
    this.ship.y = (this.ship.y + Math.sin(this.ship.angle) * this.ship.speed * dt + 560) % 560;
  }
  aiShip(dt) {
    const target = this.asteroids.reduce((nearest, asteroid) => {
      if (!nearest) return asteroid;
      return Math.hypot(asteroid.x - this.ship.x, asteroid.y - this.ship.y) < Math.hypot(nearest.x - this.ship.x, nearest.y - this.ship.y) ? asteroid : nearest;
    }, null);
    if (!target) return;
    const dx = target.x - this.ship.x;
    const dy = target.y - this.ship.y;
    const distance = Math.hypot(dx, dy);
    const angle = distance < 240 ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx);
    let difference = angle - this.ship.angle;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    this.ship.angle += clamp(difference, -3.5 * dt, 3.5 * dt);
    this.ship.speed = 150;
    this.ship.x += Math.cos(this.ship.angle) * 150 * dt;
    this.ship.y += Math.sin(this.ship.angle) * 150 * dt;
    if (this.ship.x < 0) this.ship.x = 800;
    if (this.ship.x > 800) this.ship.x = 0;
    if (this.ship.y < 0) this.ship.y = 560;
    if (this.ship.y > 560) this.ship.y = 0;
  }
  fire() {
    if (this.side === "ship") this.asteroidSpeed = Math.min(1.8, this.asteroidSpeed + 0.012);
    this.bullets.push({ x: this.ship.x, y: this.ship.y, vx: Math.cos(this.ship.angle) * 360, vy: Math.sin(this.ship.angle) * 360, life: 1 });
  }
  fractureAsteroid(asteroid) {
    const speed = Math.max(35, Math.hypot(asteroid.vx, asteroid.vy));
    const angle = Math.atan2(asteroid.vy, asteroid.vx);
    for (const offset of [-0.9, 0.9]) {
      this.asteroids.push({ x: asteroid.x, y: asteroid.y, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed, radius: asteroid.radius * 0.55, rotation: asteroid.rotation, spin: asteroid.spin * 1.2, shape: asteroid.shape.map((scale) => 0.78 + scale * 0.22), tone: asteroid.tone, generation: 1 });
    }
    asteroid.radius = 0;
  }
  update(dt, input) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.side === "ship") this.steer(dt, input); else this.aiShip(dt);
    this.shotClock -= dt;
    if (this.side === "ship" && input.fire && this.shotClock <= 0) { this.fire(); this.shotClock = 0.18; }
    if (this.side === "rocks" && this.shotClock <= 0) { this.fire(); this.shotClock = Math.max(0.16, 0.34 - this.score * 0.002); }
    if (this.side === "rocks" && input.spawnAsteroid && this.asteroids.length < 8) this.spawnAsteroidAt(input.spawnAsteroid.x, input.spawnAsteroid.y);
    if (this.side === "ship") { this.spawnClock -= dt; if (this.spawnClock <= 0 && this.asteroids.length < 7) { this.spawnAsteroid(); this.spawnClock = Math.max(0.25, 1.3 - this.score * 0.012); } }
    for (const asteroid of this.asteroids) { asteroid.x = (asteroid.x + asteroid.vx * this.asteroidSpeed * dt + 800) % 800; asteroid.y = (asteroid.y + asteroid.vy * this.asteroidSpeed * dt + 560) % 560; asteroid.rotation += asteroid.spin * dt; }
    for (const bullet of this.bullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt; }
    for (const bullet of this.bullets) {
      if (bullet.life <= 0) continue;
      for (const asteroid of this.asteroids) {
        if (!asteroid.radius || !circleHitsCircle(bullet.x, bullet.y, 3, asteroid.x, asteroid.y, asteroid.radius)) continue;
        bullet.life = 0;
        this.score += 10;
        if ((asteroid.generation ?? 0) === 0) this.fractureAsteroid(asteroid);
        else asteroid.radius = 0;
        break;
      }
    }
    this.asteroids = this.asteroids.filter((asteroid) => asteroid.radius); this.bullets = this.bullets.filter((bullet) => bullet.life > 0);
    if (this.asteroids.length === 0) this.spawnAsteroid();
    if (this.invulnerable === 0 && this.asteroids.some((asteroid) => circleHitsCircle(this.ship.x, this.ship.y, this.ship.radius, asteroid.x, asteroid.y, asteroid.radius))) { this.lifeLost = true; }
  }
  spawnAsteroidAt(x, y) {
    const targetX = this.ship.x;
    const targetY = this.ship.y;
    const angle = Math.atan2(targetY - y, targetX - x) + (Math.random() - 0.5) * 0.35;
    const speed = 48 + this.score * 0.4;
    this.asteroids.push({ x: clamp(x, 10, 790), y: clamp(y, 10, 550), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 20 + Math.random() * 10, rotation: 0, spin: (Math.random() - 0.5) * 1.8, shape: Array.from({ length: 9 }, () => 0.72 + Math.random() * 0.35), tone: Math.random(), generation: 0 });
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "Asteroids vary in size, shape, speed, and rotation as the score rises." }; }
}
