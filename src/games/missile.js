import { clamp, circleHitsCircle, drawText } from "../engine.js";

export class MissileCommandGame {
  constructor() {
    this.id = "missile";
    this.title = "Missile Command";
    this.description = "Normal play: move the mouse to aim, then press Space to launch blue interceptors at red missiles before the cities are hit.";
    this.side = "defender";
    this.score = 0;
  }
  sideLabel() { return this.side === "defender" ? "You defend the cities" : "You attack the cities"; }
  setSide(side) { this.side = side; }
  reset() {
    this.score = 0; this.bases = [130, 400, 670].map((x) => ({ x, y: 510, radius: 16, alive: true }));
    this.enemyMissiles = []; this.friendlyMissiles = []; this.interceptors = []; this.target = { x: 400, y: 250 }; this.launchClock = 1.2; this.interceptorClock = 0;
    if (this.side === "attacker") this.launchEnemy();
  }
  launchEnemy() { const base = this.bases[Math.floor(Math.random() * this.bases.length)]; this.enemyMissiles.push({ x: Math.random() * 700 + 50, y: 530, targetX: Math.random() * 700 + 50, targetY: 120 + Math.random() * 300, speed: 75, color: "#fb7185" }); }
  launchInterceptor(input) {
    const base = this.bases.find((candidate) => candidate.alive); if (!base) return;
    const target = this.side === "defender" ? this.target : { x: input.pointer.x, y: input.pointer.y };
    this.interceptors.push({ x: base.x, y: base.y - 16, target, speed: 250, color: "#22d3ee" });
  }
  launchMachineInterceptor() {
    const base = this.bases.find((candidate) => candidate.alive);
    const target = this.enemyMissiles[0];
    if (!base || !target) return;
    this.interceptors.push({ x: base.x, y: base.y - 16, target: { x: target.x, y: target.y }, speed: 230, color: "#22d3ee" });
  }
  update(dt, input) {
    this.launchClock -= dt; this.interceptorClock -= dt;
    if (this.launchClock <= 0) { if (this.side === "defender") this.launchEnemy(); else this.launchClock = 2.3; this.launchClock = this.side === "defender" ? Math.max(0.65, 2.1 - this.score * 0.015) : 2.3; }
    if (this.side === "defender") { this.target = { x: input.pointer.x, y: input.pointer.y }; if (input.pressed.has(" ") && this.interceptorClock <= 0) { this.launchInterceptor(input); this.interceptorClock = 0.22; } }
    else {
      if (input.pointer.clicked) this.launchInterceptor(input);
      if (this.interceptorClock <= 0) { this.launchMachineInterceptor(); this.interceptorClock = 0.8; }
      this.launchClock -= dt;
      if (this.launchClock <= 0) { this.launchClock = 2.3; }
    }
    for (const missile of this.enemyMissiles) moveMissile(missile, dt, 0.9);
    for (const missile of this.interceptors) moveMissile(missile, dt, 1.25);
    for (const missile of this.interceptors) for (const enemy of this.enemyMissiles) {
      if (circleHitsCircle(missile.x, missile.y, 5, enemy.x, enemy.y, 6)) { missile.dead = true; enemy.dead = true; this.score += 15; }
    }
    for (const missile of this.enemyMissiles) for (const base of this.bases) {
      if (base.alive && circleHitsCircle(missile.x, missile.y, 6, base.x, base.y, base.radius + 3)) { base.alive = false; missile.dead = true; this.score = Math.max(0, this.score - 20); }
    }
    this.enemyMissiles = this.enemyMissiles.filter((missile) => !missile.dead && missile.y < 560); this.interceptors = this.interceptors.filter((missile) => !missile.dead);
    if (this.bases.every((base) => !base.alive)) { this.score = Math.max(0, this.score - 10); this.reset(); }
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    context.strokeStyle = "#334155"; context.beginPath(); context.moveTo(0, 510); context.lineTo(800, 510); context.stroke();
    this.bases.forEach((base) => { context.fillStyle = base.alive ? "#38bdf8" : "#475569"; context.beginPath(); context.arc(base.x, base.y, base.radius, 0, Math.PI * 2); context.fill(); });
    this.enemyMissiles.forEach((missile) => drawMissile(context, missile)); this.interceptors.forEach((missile) => drawMissile(context, missile));
    if (this.side === "defender") { context.strokeStyle = "#fbbf24"; context.beginPath(); context.arc(this.target.x, this.target.y, 12, 0, Math.PI * 2); context.stroke(); }
    drawText(context, this.side === "defender" ? "Move the mouse to aim · press Space to launch a blue interceptor" : "Click above the cities to launch a red missile · blue interceptors defend", 16, 28, 14, "#cbd5e1");
    drawText(context, "Red lines are incoming · blue lines are yours · protect the three city circles", 16, 542, 12, "#64748b");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "Each interceptor follows a real target and can miss." }; }
}

function moveMissile(missile, dt, speedScale) {
  const dx = missile.targetX - missile.x; const dy = missile.targetY - missile.y; const length = Math.hypot(dx, dy);
  if (length < 8) { missile.dead = true; return; }
  missile.x += dx / length * missile.speed * speedScale * dt; missile.y += dy / length * missile.speed * speedScale * dt;
}
function drawMissile(context, missile) {
  const dx = missile.targetX - missile.x;
  const dy = missile.targetY - missile.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  context.strokeStyle = missile.color; context.lineWidth = 3; context.beginPath();
  context.moveTo(missile.x, missile.y); context.lineTo(missile.x - dx / length * 18, missile.y - dy / length * 18); context.stroke();
}
