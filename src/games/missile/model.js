import { circleHitsCircle } from "../../engine.js";

export class MissileModel {
  constructor() {
    this.id = "missile";
    this.title = "Missile Command";
    this.description = "Normal play: move the mouse to aim, then press Space to launch blue interceptors at red missiles before they reach a city.";
    this.side = "defender";
    this.score = 0;
  }
  sideLabel() { return this.side === "defender" ? "You defend the cities" : "You attack the cities"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.bases = [130, 400, 670].map((x, index) => ({ x, y: 510, radius: 18, label: ["A", "B", "C"][index], alive: true }));
    this.enemyMissiles = [];
    this.interceptors = [];
    this.target = { x: 400, y: 250 };
    this.launchClock = 0.8;
    this.interceptorClock = 0;
  }
  launchEnemy(targetX = null, targetBase = null) {
    const base = targetBase || this.bases[Math.floor(Math.random() * this.bases.length)];
    const destinationX = targetX ?? base.x;
    this.enemyMissiles.push({ x: 40 + Math.random() * 720, y: 20, targetX: destinationX, targetY: base.y, speed: 90 + this.score * 0.8, color: "#fb7185", targetBase: base });
  }
  launchInterceptor() {
    const base = this.bases.find((candidate) => candidate.alive);
    if (!base) return;
    this.interceptors.push({ x: base.x, y: base.y - 20, targetX: this.target.x, targetY: this.target.y, speed: 270, color: "#22d3ee" });
  }
  launchMachineInterceptor() {
    const base = this.bases.find((candidate) => candidate.alive);
    const target = this.enemyMissiles[0];
    if (!base || !target) return;
    this.interceptors.push({ x: base.x, y: base.y - 20, targetX: target.x, targetY: target.y, speed: 245, color: "#22d3ee" });
  }
  update(dt, input) {
    this.launchClock -= dt;
    this.interceptorClock -= dt;
    if (this.side === "defender") {
      if (input.aim) this.target = { x: input.aim.x || this.target.x, y: input.aim.y || this.target.y };
      if (this.launchClock <= 0) { this.launchEnemy(); this.launchClock = Math.max(0.65, 2.1 - this.score * 0.012); }
      if (input.launch && this.interceptorClock <= 0) { this.launchInterceptor(); this.interceptorClock = 0.22; }
    } else {
      if (input.attack) this.launchEnemy(input.attack.x, this.closestBase(input.attack.x));
      if (this.interceptorClock <= 0) { this.launchMachineInterceptor(); this.interceptorClock = 0.65; }
    }
    for (const missile of this.enemyMissiles) moveMissile(missile, dt, 1);
    for (const missile of this.interceptors) moveMissile(missile, dt, 1.2);
    for (const interceptor of this.interceptors) for (const enemy of this.enemyMissiles) if (circleHitsCircle(interceptor.x, interceptor.y, 6, enemy.x, enemy.y, 7)) { interceptor.dead = true; enemy.dead = true; this.score += 15; }
    for (const enemy of this.enemyMissiles) if (enemy.targetBase?.alive && enemy.y >= enemy.targetBase.y - enemy.targetBase.radius - 8) { enemy.targetBase.alive = false; enemy.dead = true; }
    this.enemyMissiles = this.enemyMissiles.filter((missile) => !missile.dead && missile.y < 560);
    this.interceptors = this.interceptors.filter((missile) => !missile.dead);
    if (this.bases.every((base) => !base.alive)) this.lifeLost = true;
  }
  closestBase(x) { return this.bases.reduce((closest, base) => Math.abs(base.x - x) < Math.abs(closest.x - x) ? base : closest, this.bases[0]); }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "Every missile has a visible target and every interceptor can miss." }; }
}

function moveMissile(missile, dt, speedScale) {
  const dx = missile.targetX - missile.x; const dy = missile.targetY - missile.y; const length = Math.hypot(dx, dy);
  if (length < 5) { missile.dead = true; return; }
  missile.x += dx / length * missile.speed * speedScale * dt; missile.y += dy / length * missile.speed * speedScale * dt;
}
