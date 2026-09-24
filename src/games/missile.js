import { circleHitsCircle, drawText } from "../engine.js";

export class MissileCommandGame {
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
      this.target = { x: input.pointer.x || this.target.x, y: input.pointer.y || this.target.y };
      if (this.launchClock <= 0) { this.launchEnemy(); this.launchClock = Math.max(0.65, 2.1 - this.score * 0.012); }
      if (input.pressed.has(" ") && this.interceptorClock <= 0) { this.launchInterceptor(); this.interceptorClock = 0.22; }
    } else {
      if (input.pointer.clicked) this.launchEnemy(input.pointer.x, this.closestBase(input.pointer.x));
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
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    context.strokeStyle = "#334155"; context.lineWidth = 2; context.beginPath(); context.moveTo(0, 530); context.lineTo(800, 530); context.stroke();
    this.bases.forEach((base) => {
      context.fillStyle = base.alive ? "#38bdf8" : "#475569"; context.beginPath(); context.arc(base.x, base.y, base.radius, 0, Math.PI * 2); context.fill();
      drawText(context, base.label, base.x, base.y + 5, 14, "#06111f", "center");
    });
    this.enemyMissiles.forEach((missile) => { drawMissile(context, missile); drawTarget(context, missile.targetX, missile.targetY, "#fb7185"); });
    this.interceptors.forEach((missile) => drawMissile(context, missile));
    if (this.side === "defender") { context.strokeStyle = "#fbbf24"; context.lineWidth = 2; context.beginPath(); context.arc(this.target.x, this.target.y, 13, 0, Math.PI * 2); context.stroke(); context.beginPath(); context.moveTo(this.target.x - 18, this.target.y); context.lineTo(this.target.x + 18, this.target.y); context.moveTo(this.target.x, this.target.y - 18); context.lineTo(this.target.x, this.target.y + 18); context.stroke(); }
    drawText(context, this.side === "defender" ? "Move the mouse to aim · press Space to launch a blue interceptor" : "Click a city area to launch a red missile · the computer intercepts", 16, 28, 14, "#cbd5e1");
    drawText(context, "Red = incoming · blue = yours · protect the three city circles", 16, 556, 12, "#64748b");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "Every missile has a visible target and every interceptor can miss." }; }
}

function moveMissile(missile, dt, speedScale) {
  const dx = missile.targetX - missile.x; const dy = missile.targetY - missile.y; const length = Math.hypot(dx, dy);
  if (length < 5) { missile.dead = true; return; }
  missile.x += dx / length * missile.speed * speedScale * dt; missile.y += dy / length * missile.speed * speedScale * dt;
}
function drawMissile(context, missile) {
  const dx = missile.targetX - missile.x; const dy = missile.targetY - missile.y; const length = Math.max(Math.hypot(dx, dy), 1);
  context.strokeStyle = missile.color; context.lineWidth = 3; context.beginPath(); context.moveTo(missile.x, missile.y); context.lineTo(missile.x - dx / length * 18, missile.y - dy / length * 18); context.stroke();
}
function drawTarget(context, x, y, color) { context.strokeStyle = color; context.lineWidth = 2; context.beginPath(); context.moveTo(x - 6, y - 6); context.lineTo(x + 6, y + 6); context.moveTo(x + 6, y - 6); context.lineTo(x - 6, y + 6); context.stroke(); }
