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
  newGem(x = null, y = -20) {
    let nextX = x;
    if (nextX === null || nextX === undefined) {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        nextX = 20 + Math.random() * 760;
        if (this.gems.every((gem) => Math.abs(gem.x - nextX) >= 110)) break;
      }
    }
    return { x: nextX, y, vx: (Math.random() * 2 - 1) * 32, vy: 35 + Math.random() * 30, collected: false };
  }
  separateGems() {
    for (let first = 0; first < this.gems.length; first += 1) {
      for (let second = first + 1; second < this.gems.length; second += 1) {
        const left = this.gems[first];
        const right = this.gems[second];
        if (left.remove || right.remove || left.collected || right.collected) continue;
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        if (Math.abs(dx) >= 90 || Math.abs(dy) >= 45) continue;
        const direction = dx === 0 ? (first % 2 ? 1 : -1) : Math.sign(dx);
        const push = (90 - Math.abs(dx)) / 2;
        left.x = clamp(left.x - direction * push, 0, 800);
        right.x = clamp(right.x + direction * push, 0, 800);
      }
    }
  }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0; this.runner = { x: 400, y: 500, radius: 16 }; this.stars = []; this.gems = []; this.spawnClock = 0.3; this.aiTargetX = null; this.aiTargetGem = null; this.gemHoldTime = 0; this.gemSpawnClock = 0; this.gemSpawnCooldown = 0;
    if (this.side === "runner") for (let index = 0; index < 3; index += 1) this.gems.push(this.newGem(undefined, -20 - index * 80));
  }
  update(dt, input) {
    this.gemSpawnCooldown = Math.max(0, (this.gemSpawnCooldown || 0) - dt);
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
      if (input.spawnGem && this.gemSpawnCooldown <= 0 && this.gems.length < 12) {
        for (let index = this.stars.length - 1; index >= 0; index -= 1) {
          if (this.stars[index].userCreated && (this.stars[index].age || 0) < 0.5) { this.stars.splice(index, 1); break; }
        }
        this.gems.push(this.newGem(clamp(input.spawnGem.x, 20, 780), 20));
        this.gemSpawnCooldown = 0.25;
      }
      if (input.pointerDown && !input.pointerDragDistance && !input.spawnGem) {
        this.gemHoldTime += dt;
        this.gemSpawnClock -= dt;
        if (this.gemHoldTime >= 0.35 && this.gemSpawnClock <= 0 && this.gems.length < 12) {
          this.gems.push(this.newGem(clamp(input.pointerX + (Math.random() * 2 - 1) * 45, 20, 780), 20));
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
        if (this.side === "runner") {
          gem.respawn = (gem.respawn || 0) - dt;
          if (gem.respawn <= 0) Object.assign(gem, this.newGem());
        } else gem.remove = true;
        continue;
      }
      gem.x += (gem.vx || 0) * dt;
      gem.y += (gem.vy || 50) * dt;
      if (gem.x < 0) gem.x = 800;
      if (gem.x > 800) gem.x = 0;
      if (gem.y > 580) {
        if (this.side === "runner") Object.assign(gem, this.newGem());
        else { gem.remove = true; continue; }
      }
      if (circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, gem.x, gem.y, 10)) {
        this.score += 50;
        if (this.side === "runner") { gem.collected = true; gem.respawn = 0.7; }
        else gem.remove = true;
      }
    }
    this.separateGems();
    this.gems = this.gems.filter((gem) => !gem.remove);
    for (const star of this.stars) if (circleHitsCircle(this.runner.x, this.runner.y, this.runner.radius, star.x, star.y, star.radius)) { star.dead = true; this.lifeLost = true; }
    this.stars = this.stars.filter((star) => !star.dead && star.y < 560 && star.x > -30 && star.x < 830);
  }
  aiRunner(dt) {
    const activeGems = this.gems.filter((gem) => !gem.collected && gem.y <= this.runner.y + 50);
    if (!this.stars.length && !activeGems.length) return;
    const targetGem = activeGems.find((gem) => gem === this.aiTargetGem) || activeGems.reduce((nearest, gem) => {
      const cost = Math.abs(gem.x - this.runner.x) + Math.abs(this.runner.y - gem.y) * 0.15;
      const nearestCost = Math.abs(nearest.x - this.runner.x) + Math.abs(this.runner.y - nearest.y) * 0.15;
      return cost < nearestCost ? gem : nearest;
    }, activeGems[0]);
    const candidates = [20, 160, 300, 440, 580, 720, 780];
    const safe = candidates.filter((candidate) => this.stars.every((star) => Math.abs(candidate - star.x) > 45));
    const pool = safe.length ? safe : [this.runner.x < 400 ? 20 : 780];
    const target = pool.reduce((best, candidate) => {
      const distance = targetGem ? Math.abs(candidate - targetGem.x) : Math.abs(candidate - this.runner.x);
      return distance < best.distance ? { x: candidate, distance } : best;
    }, { x: pool[0], distance: Infinity });
    const targetIsSafe = this.aiTargetX === null || this.stars.every((star) => Math.abs(this.aiTargetX - star.x) > 45);
    if (!targetIsSafe || this.aiTargetX === null || this.aiTargetGem !== targetGem) {
      this.aiTargetX = target.x;
      this.aiTargetGem = targetGem || null;
    }
    if (Math.abs(this.aiTargetX - this.runner.x) <= 4) this.runner.x = this.aiTargetX;
    else this.runner.x = clamp(this.runner.x + clamp(this.aiTargetX - this.runner.x, -1, 1) * 300 * dt, 20, 780);
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The computer changes direction to dodge; it does not phase through stars." }; }
}
