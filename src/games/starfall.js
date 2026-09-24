import { clamp, circleHitsCircle, drawText } from "../engine.js";

export class StarfallGame {
  constructor() {
    this.id = "starfall";
    this.title = "Starfall";
    this.description = "Guide the runner through the falling stars, or send stars at a machine runner.";
    this.side = "stars";
    this.score = 0;
  }
  sideLabel() { return this.side === "runner" ? "You guide the runner" : "You send the stars"; }
  setSide(side) { this.side = side; }
  reset() {
    this.score = 0; this.runner = { x: 400, y: 500, radius: 16 }; this.stars = []; this.gems = []; this.spawnClock = 0.3;
    for (let index = 0; index < 3; index += 1) this.gems.push({ x: 100 + index * 300, y: 80 + Math.random() * 120, collected: false });
  }
  update(dt, input) {
    if (this.side === "runner") {
      const direction = (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0);
      this.runner.x = clamp(this.runner.x + direction * 240 * dt, 20, 780);
    } else {
      if (input.pointer.clicked && this.stars.length < 12) this.stars.push({ x: input.pointer.x, y: 20, vy: 130 + this.score * 2, radius: 10 });
      this.aiRunner(dt);
    }
    if (this.side === "runner") { this.spawnClock -= dt; if (this.spawnClock <= 0) { this.stars.push({ x: 20 + Math.random() * 760, y: 20, vy: 130 + this.score * 2, radius: 10 }); this.spawnClock = Math.max(0.28, 1.1 - this.score * 0.006); } }
    for (const star of this.stars) star.y += star.vy * dt;
    for (const gem of this.gems) if (!gem.collected && circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, gem.x, gem.y, 10)) { gem.collected = true; this.score += 50; gem.x = 20 + Math.random() * 760; gem.y = 80 + Math.random() * 180; }
    for (const star of this.stars) if (circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, star.x, star.y, star.radius)) { star.dead = true; this.score = Math.max(0, this.score - 15); }
    this.stars = this.stars.filter((star) => !star.dead && star.y < 560);
  }
  aiRunner(dt) {
    const threat = this.stars.sort((a, b) => b.y - a.y)[0];
    const target = threat ? (threat.x < this.runner.x ? this.runner.x - 100 : this.runner.x + 100) : 400;
    this.runner.x += clamp(target - this.runner.x, -1, 1) * 220 * dt;
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    context.strokeStyle = "#1e293b"; context.beginPath(); context.moveTo(0, 500); context.lineTo(800, 500); context.stroke();
    this.gems.forEach((gem) => { context.fillStyle = "#22d3ee"; context.beginPath(); context.arc(gem.x, gem.y, 10, 0, Math.PI * 2); context.fill(); });
    this.stars.forEach((star) => { context.fillStyle = "#fb7185"; context.beginPath(); context.arc(star.x, star.y, star.radius, 0, Math.PI * 2); context.fill(); });
    context.fillStyle = "#fbbf24"; context.beginPath(); context.arc(this.runner.x, this.runner.y, this.runner.radius, 0, Math.PI * 2); context.fill();
    drawText(context, this.side === "runner" ? "Arrow keys / WASD to dodge · collect blue gems" : "Click the sky to send a star", 16, 28, 14, "#cbd5e1");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The machine changes direction to dodge; it does not phase through stars." }; }
}
