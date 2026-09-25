import { clamp, circleHitsCircle } from "../../engine.js";

export class StarfallModel {
  constructor() {
    this.id = "starfall";
    this.title = "Starfall";
    this.description = "Guide the runner with the mouse or keyboard, collect falling blue gems, and avoid red stars. In flipped play, click or drag to send stars.";
    this.side = "runner";
    this.score = 0;
  }
  sideLabel() { return this.side === "runner" ? "You guide the runner" : "You send the stars"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0; this.runner = { x: 400, y: 500, radius: 16 }; this.stars = []; this.gems = []; this.spawnClock = 0.3;
    for (let index = 0; index < 3; index += 1) this.gems.push({ x: 100 + index * 300, y: -20 - index * 90, vy: 45 + index * 8, collected: false });
  }
  update(dt, input) {
    if (this.side === "runner") {
      const direction = input.keyDirection || 0;
      if (direction || input.mode === "keyboard") this.runner.x += direction * 240 * dt;
      else if (input.pointerX > 0) this.runner.x += clamp(input.pointerX - this.runner.x, -1, 1) * 260 * dt;
      this.runner.x = clamp(this.runner.x, 20, 780);
    } else {
      if (input.spawnStar && this.stars.length < 12) this.stars.push({ x: input.spawnStar.x, y: 20, vy: 130 + this.score * 2, radius: 10 });
      this.aiRunner(dt);
    }
    if (this.side === "runner") {
      this.spawnClock -= dt;
      if (this.spawnClock <= 0) { this.stars.push({ x: 20 + Math.random() * 760, y: 20, vy: 130 + this.score * 2, radius: 10 }); this.spawnClock = Math.max(0.28, 1.1 - this.score * 0.006); }
    }
    for (const star of this.stars) star.y += star.vy * dt;
    for (const gem of this.gems) {
      gem.y += (gem.vy || 50) * dt;
      if (gem.y > 580) { gem.x = 20 + Math.random() * 760; gem.y = -20; }
      if (!gem.collected && circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, gem.x, gem.y, 10)) { gem.collected = false; this.score += 50; gem.x = 20 + Math.random() * 760; gem.y = -20; }
    }
    for (const star of this.stars) if (circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, star.x, star.y, star.radius)) { star.dead = true; this.lifeLost = true; }
    this.stars = this.stars.filter((star) => !star.dead && star.y < 560);
  }
  aiRunner(dt) {
    const candidates = [20, 160, 300, 440, 580, 720, 780];
    const safe = candidates.filter((candidate) => this.stars.every((star) => Math.abs(candidate - star.x) > 45));
    const target = safe.length ? safe.reduce((nearest, candidate) => Math.abs(candidate - this.runner.x) < Math.abs(nearest - this.runner.x) ? candidate : nearest, safe[0]) : this.runner.x < 400 ? 20 : 780;
    this.runner.x = clamp(this.runner.x + clamp(target - this.runner.x, -1, 1) * 300 * dt, 20, 780);
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The computer changes direction to dodge; it does not phase through stars." }; }
}
