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
  newGem(x = 20 + Math.random() * 760, y = -20) {
    return { x, y, vx: (Math.random() * 2 - 1) * 32, vy: 35 + Math.random() * 30, collected: false };
  }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0; this.runner = { x: 400, y: 500, radius: 16 }; this.stars = []; this.gems = []; this.spawnClock = 0.3; this.aiTargetX = null; this.gemHoldTime = 0; this.gemSpawnClock = 0;
    if (this.side === "runner") for (let index = 0; index < 3; index += 1) this.gems.push(this.newGem(undefined, -20 - index * 80));
  }
  update(dt, input) {
    if (this.side === "runner") {
      const direction = input.keyDirection || 0;
      if (direction || input.mode === "keyboard") this.runner.x += direction * 240 * dt;
      else if (input.mode === "mouse" && input.pointerX > 0) {
        const smoothing = 1 - Math.exp(-18 * dt);
        this.runner.x += (input.pointerX - this.runner.x) * smoothing;
      }
      this.runner.x = clamp(this.runner.x, 20, 780);
    } else {
      if (input.spawnStar && this.stars.length < 12) {
        const dragX = input.spawnStar.dragDeltaX || 0;
        const dragY = input.spawnStar.dragDeltaY || 0;
        const horizontalSpeed = input.spawnStar.dragDistance ? clamp(dragX / Math.max(Math.abs(dragY), 1) * 180, -240, 240) : 0;
        this.stars.push({ x: input.spawnStar.x, y: 20, vx: horizontalSpeed, vy: 130 + this.score * 2, radius: 10, age: 0, userCreated: true });
      }
      if (input.spawnGem && this.gems.length < 12) {
        for (let index = this.stars.length - 1; index >= 0; index -= 1) {
          if (this.stars[index].userCreated && (this.stars[index].age || 0) < 0.5) { this.stars.splice(index, 1); break; }
        }
        this.gems.push(this.newGem(clamp(input.spawnGem.x, 20, 780), 20));
      }
      if (input.pointerDown && !input.spawnGem) {
        this.gemHoldTime += dt;
        this.gemSpawnClock -= dt;
        if (this.gemHoldTime >= 0.35 && this.gemSpawnClock <= 0 && this.gems.length < 12) {
          this.gems.push(this.newGem(clamp(input.pointerX, 20, 780), 20));
          this.gemSpawnClock = 0.2;
        }
      } else {
        this.gemHoldTime = 0;
        this.gemSpawnClock = 0;
      }
      this.aiRunner(dt);
    }
    if (this.side === "runner") {
      this.spawnClock -= dt;
      if (this.spawnClock <= 0) { this.stars.push({ x: 20 + Math.random() * 760, y: 20, vy: 130 + this.score * 2, radius: 10 }); this.spawnClock = Math.max(0.28, 1.1 - this.score * 0.006); }
    }
    for (const star of this.stars) { star.x += (star.vx || 0) * dt; star.y += star.vy * dt; star.age = (star.age || 0) + dt; }
    for (const gem of this.gems) {
      if (gem.collected) {
        gem.respawn = (gem.respawn || 0) - dt;
        if (gem.respawn <= 0) Object.assign(gem, this.newGem());
        continue;
      }
      gem.x += (gem.vx || 0) * dt;
      gem.y += (gem.vy || 50) * dt;
      if (gem.x < 0) gem.x = 800;
      if (gem.x > 800) gem.x = 0;
      if (gem.y > 580) Object.assign(gem, this.newGem());
      if (circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, gem.x, gem.y, 10)) { gem.collected = true; gem.respawn = 0.7; this.score += 50; }
    }
    for (const star of this.stars) if (circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, star.x, star.y, star.radius)) { star.dead = true; this.lifeLost = true; }
    this.stars = this.stars.filter((star) => !star.dead && star.y < 560 && star.x > -30 && star.x < 830);
  }
  aiRunner(dt) {
    if (!this.stars.length) return;
    const candidates = [20, 160, 300, 440, 580, 720, 780];
    const targetIsSafe = this.aiTargetX !== null && this.stars.every((star) => Math.abs(this.aiTargetX - star.x) > 45);
    if (!targetIsSafe) {
      const safe = candidates.filter((candidate) => this.stars.every((star) => Math.abs(candidate - star.x) > 45));
      this.aiTargetX = safe.length ? safe.reduce((nearest, candidate) => Math.abs(candidate - this.runner.x) < Math.abs(nearest - this.runner.x) ? candidate : nearest, safe[0]) : this.runner.x < 400 ? 20 : 780;
    }
    this.runner.x = clamp(this.runner.x + clamp(this.aiTargetX - this.runner.x, -1, 1) * 300 * dt, 20, 780);
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The computer changes direction to dodge; it does not phase through stars." }; }
}
