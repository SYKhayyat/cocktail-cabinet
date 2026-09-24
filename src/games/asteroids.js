import { clamp, circleHitsCircle, drawText } from "../engine.js";

export class AsteroidsGame {
  constructor() {
    this.id = "asteroids";
    this.title = "Asteroids";
    this.description = "Pilot the ship, or launch the rocks. The machine flies with the same collision rules you do.";
    this.side = "rocks";
    this.score = 0;
  }
  sideLabel() { return this.side === "ship" ? "You fly the ship" : "You send the asteroids"; }
  setSide(side) { this.side = side; }
  reset() {
    this.score = 0; this.ship = { x: 400, y: 280, angle: -Math.PI / 2, speed: 0, radius: 13 };
    this.asteroids = []; this.bullets = []; this.spawnClock = 0.4; this.shotClock = 0; this.invulnerable = 1;
    if (this.side === "rocks") this.spawnAsteroid();
  }
  spawnAsteroid() {
    const edge = Math.floor(Math.random() * 4); let x = 0; let y = 0;
    if (edge === 0) { x = 20; y = Math.random() * 520; }
    if (edge === 1) { x = 780; y = Math.random() * 520; }
    if (edge === 2) { x = Math.random() * 780; y = 20; }
    if (edge === 3) { x = Math.random() * 780; y = 540; }
    this.asteroids.push({ x, y, vx: 35 + this.score * 0.4, vy: 20 + this.score * 0.2, radius: 24, rotation: Math.random() * 6 });
  }
  steer(dt, input) {
    const turn = (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0);
    const thrust = input.keys.has("ArrowUp") || input.keys.has("w") ? 1 : 0;
    this.ship.angle += turn * 3.2 * dt; this.ship.speed += thrust * 190 * dt; this.ship.speed *= Math.pow(0.98, dt * 60);
    this.ship.x = (this.ship.x + Math.cos(this.ship.angle) * this.ship.speed * dt + 800) % 800;
    this.ship.y = (this.ship.y + Math.sin(this.ship.angle) * this.ship.speed * dt + 560) % 560;
  }
  aiShip(dt) {
    const target = this.asteroids[0]; if (!target) return;
    const angle = Math.atan2(target.y - this.ship.y, target.x - this.ship.x);
    let difference = angle - this.ship.angle; while (difference > Math.PI) difference -= Math.PI * 2; while (difference < -Math.PI) difference += Math.PI * 2;
    this.ship.angle += clamp(difference, -2.2 * dt, 2.2 * dt); this.ship.speed = 90; this.ship.x += Math.cos(this.ship.angle) * 90 * dt; this.ship.y += Math.sin(this.ship.angle) * 90 * dt;
    if (this.ship.x < 0) this.ship.x = 800; if (this.ship.x > 800) this.ship.x = 0; if (this.ship.y < 0) this.ship.y = 560; if (this.ship.y > 560) this.ship.y = 0;
  }
  fire() { this.bullets.push({ x: this.ship.x, y: this.ship.y, vx: Math.cos(this.ship.angle) * 360, vy: Math.sin(this.ship.angle) * 360, life: 1 }); }
  update(dt, input) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.side === "ship") this.steer(dt, input); else this.aiShip(dt);
    this.shotClock -= dt;
    if (this.side === "ship" && input.pressed.has(" ") && this.shotClock <= 0) { this.fire(); this.shotClock = 0.18; }
    if (this.side === "rocks" && this.shotClock <= 0) { this.fire(); this.shotClock = Math.max(0.16, 0.34 - this.score * 0.002); }
    if (this.side === "rocks" && input.pointer.clicked && this.asteroids.length < 8) { this.spawnAsteroidAt(input.pointer.x, input.pointer.y); }
    if (this.side === "ship") { this.spawnClock -= dt; if (this.spawnClock <= 0) { this.spawnAsteroid(); this.spawnClock = Math.max(0.25, 1.3 - this.score * 0.012); } }
    for (const asteroid of this.asteroids) { asteroid.x = (asteroid.x + asteroid.vx * dt + 800) % 800; asteroid.y = (asteroid.y + asteroid.vy * dt + 560) % 560; }
    for (const bullet of this.bullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt; }
    for (const bullet of this.bullets) for (const asteroid of this.asteroids) {
      if (asteroid.radius && circleHitsCircle(bullet.x, bullet.y, 3, asteroid.x, asteroid.y, asteroid.radius)) { asteroid.radius = 0; bullet.life = 0; this.score += 10; }
    }
    this.asteroids = this.asteroids.filter((asteroid) => asteroid.radius); this.bullets = this.bullets.filter((bullet) => bullet.life > 0);
    if (this.asteroids.length === 0 && this.side === "ship") this.spawnAsteroid();
    if (this.invulnerable === 0 && this.asteroids.some((asteroid) => circleHitsCircle(this.ship.x, this.ship.y, this.ship.radius, asteroid.x, asteroid.y, asteroid.radius))) { this.score = Math.max(0, this.score - 25); this.invulnerable = 1.5; this.ship.x = 400; this.ship.y = 280; }
  }
  spawnAsteroidAt(x, y) { this.asteroids.push({ x: clamp(x, 10, 790), y: clamp(y, 10, 550), vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90, radius: 24, rotation: 0 }); }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    context.save(); context.translate(this.ship.x, this.ship.y); context.rotate(this.ship.angle);
    context.fillStyle = this.invulnerable > 0 && Math.floor(this.invulnerable * 10) % 2 === 0 ? "#475569" : "#fbbf24";
    context.beginPath(); context.moveTo(16, 0); context.lineTo(-11, -10); context.lineTo(-6, 0); context.lineTo(-11, 10); context.closePath(); context.fill(); context.restore();
    context.fillStyle = "#94a3b8"; this.asteroids.forEach((asteroid) => { context.beginPath(); for (let point = 0; point < 8; point += 1) { const angle = point / 8 * Math.PI * 2; const radius = asteroid.radius * (point % 2 ? 0.72 : 1); const x = asteroid.x + Math.cos(angle) * radius; const y = asteroid.y + Math.sin(angle) * radius; if (point === 0) context.moveTo(x, y); else context.lineTo(x, y); } context.closePath(); context.fill(); });
    context.fillStyle = "#22d3ee"; this.bullets.forEach((bullet) => context.fillRect(bullet.x - 2, bullet.y - 2, 4, 4));
    drawText(context, this.side === "ship" ? "Arrows / WASD to fly · Space to shoot" : "Click to send a rock · the machine shoots it", 16, 28, 14, "#cbd5e1");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "Rocks get faster as your score rises, but collisions are always checked." }; }
}
