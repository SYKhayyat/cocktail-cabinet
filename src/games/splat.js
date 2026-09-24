import { clamp, drawText } from "../engine.js";

export class SplatGame {
  constructor() {
    this.id = "splat";
    this.title = "Splat";
    this.description = "Normal play: the climber jumps automatically. Move the mouse or use A/D to land on the next glowing platform.";
    this.side = "climber";
    this.score = 0;
  }
  sideLabel() { return this.side === "climber" ? "You climb the columns" : "You lay out the columns"; }
  setSide(side) { this.side = side; }
  reset() {
    this.score = 0;
    this.climber = { x: 40, y: 500, width: 24, height: 32, vy: 0 };
    this.platforms = [{ x: 0, y: 520, width: 800, height: 40, color: "#334155" }];
    this.targetY = 470;
    this.aiClock = 0;
    this.nextX = 280;
  }
  addPlatform(x) {
    if (x < 25 || x > 655) return;
    this.platforms.push({ x, y: this.targetY, width: 120, height: 14, color: "#22d3ee" });
    this.nextX = clamp(x + (Math.random() > 0.5 ? 150 : -150), 40, 640);
    this.targetY -= 55;
    this.score += 10;
  }
  update(dt, input) {
    if (this.side === "layout" && input.pointer.clicked) this.addPlatform(input.pointer.x - 60);
    if (this.side === "climber") this.moveClimber(input, dt); else this.moveAiClimber(dt);
    this.climber.vy = Math.min(this.climber.vy + 700 * dt, 500);
    this.climber.y += this.climber.vy * dt;
    for (const platform of this.platforms) {
      if (this.climber.vy >= 0 && this.climber.y + this.climber.height >= platform.y && this.climber.y < platform.y + platform.height && this.climber.x + this.climber.width > platform.x && this.climber.x < platform.x + platform.width) {
        this.climber.y = platform.y - this.climber.height;
        this.climber.vy = -330;
        this.score += 5;
      }
    }
    if (this.climber.y < 25) this.score += 100;
    if (this.climber.y > 560) { this.reset(); this.score = 0; }
    if (this.side === "climber" && this.platforms.length < 8 && this.climber.y < this.targetY + 120) this.aiClock += dt;
    if (this.side === "climber" && this.aiClock > 1.1) { this.aiClock = 0; this.addPlatform(this.nextX); }
  }
  moveClimber(input, dt) {
    if (input.pointer.x > 0) {
      const target = input.pointer.x - this.climber.width / 2;
      this.climber.x += clamp(target - this.climber.x, -1, 1) * 220 * dt;
    } else {
      const direction = (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0);
      this.climber.x += direction * 220 * dt;
    }
  }
  moveAiClimber(dt) {
    const next = this.platforms.filter((platform) => platform.y < this.climber.y - 20).sort((a, b) => b.y - a.y)[0];
    if (!next) return;
    const target = next.x + next.width / 2 - this.climber.width / 2;
    this.climber.x += clamp(target - this.climber.x, -1, 1) * 190 * dt;
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    this.platforms.forEach((platform) => { context.fillStyle = platform.color; context.fillRect(platform.x, platform.y, platform.width, platform.height); });
    const next = this.platforms.filter((platform) => platform.y < this.climber.y).sort((a, b) => b.y - a.y)[0];
    if (next && this.side === "climber") { context.strokeStyle = "#fbbf24"; context.lineWidth = 3; context.strokeRect(next.x - 3, next.y - 3, next.width + 6, next.height + 6); }
    context.fillStyle = this.side === "climber" ? "#fbbf24" : "#fb7185"; context.fillRect(this.climber.x, this.climber.y, this.climber.width, this.climber.height);
    drawText(context, this.side === "climber" ? "The climber jumps automatically · move the mouse left and right" : "Click to lay a platform · the computer climbs toward it", 16, 28, 14, "#cbd5e1");
    drawText(context, this.side === "climber" ? "Land on the glowing platform above. The next one appears higher." : "Build a reachable route upward; do not trap the climber.", 16, 542, 12, "#64748b");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The jump is automatic; your job is choosing the landing column." }; }
}
