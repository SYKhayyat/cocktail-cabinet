import { clamp } from "../../engine.js";

const AI_TARGET_ERROR_CHANCE = 0.1;
const AI_TARGET_ERROR_RANGE = 220;
export class SplatModel {
  constructor() {
    this.id = "splat";
    this.title = "Splat";
    this.description = "Normal play: the climber jumps automatically. Move the mouse or use A/D to land on the next glowing platform.";
    this.side = "climber";
    this.score = 0;
  }
  sideLabel() { return this.side === "climber" ? "You climb the columns" : "You lay out the columns"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.climber = { x: 40, y: 500, width: 24, height: 32, vy: 0 };
    this.platforms = [{ x: 0, y: 520, width: 800, height: 40, color: "#334155", active: true, isGround: true }];
    this.targetY = 470;
    this.aiClock = 0;
    this.aiTarget = null;
    this.aiTargetOffset = 0;
    this.nextX = 200;
  }
  addPlatform(x) {
    if (x < 25 || x > 655) return;
    this.platforms.push({ x, y: this.targetY, width: 120, height: 14, color: "#22d3ee", active: true });
    this.nextX = clamp(x + (Math.random() > 0.5 ? 150 : -150), 40, 640);
    this.targetY -= 55;
    this.score += 10;
  }
  update(dt, input) {
    if (this.side === "layout" && input.placePlatform !== undefined) this.addPlatform(input.placePlatform);
    if (this.side === "climber") this.moveClimber(input, dt); else this.moveAiClimber(dt);
    this.climber.vy = Math.min(this.climber.vy + 700 * dt, 500);
    this.climber.y += this.climber.vy * dt;
    const ground = this.platforms.find((platform) => platform.isGround);
    if (ground && this.climber.y < ground.y - this.climber.height) ground.active = false;
    for (const platform of this.platforms) {
      if (platform.active !== false && this.climber.vy >= 0 && this.climber.y + this.climber.height >= platform.y && this.climber.y < platform.y + platform.height && this.climber.x + this.climber.width > platform.x && this.climber.x < platform.x + platform.width) {
        this.climber.y = platform.y - this.climber.height;
        this.climber.vy = -330;
        this.aiTarget = null;
        this.score += 5;
      }
    }
    if (this.climber.y < 25) this.score += 100;
    if (this.climber.y > 560) { this.lifeLost = true; return; }
    if (this.side === "climber" && this.platforms.length < 8 && this.climber.y < this.targetY + 120) this.aiClock += dt;
    const platformDelay = this.platforms.length < 2 ? 0.35 : 1.1;
    if (this.side === "climber" && this.aiClock > platformDelay) { this.aiClock = 0; this.addPlatform(this.nextX); }
  }
  moveClimber(input, dt) {
    if (input.keyDirection) this.climber.x += input.keyDirection * 220 * dt;
    else if (input.pointerX > 0) this.climber.x += clamp(input.pointerX - this.climber.width / 2 - this.climber.x, -1, 1) * 220 * dt;
  }
  moveAiClimber(dt) {
    if (this.aiTarget && this.climber.vy >= 0 && this.climber.y > this.aiTarget.y + this.climber.height) this.aiTarget = null;
    if (!this.aiTarget || this.aiTarget.active === false) {
      this.aiTarget = this.platforms.filter((platform) => platform.active !== false && platform.y < this.climber.y + 20).sort((a, b) => b.y - a.y)[0] || null;
      this.aiTargetOffset = this.aiTarget && Math.random() < AI_TARGET_ERROR_CHANCE ? (Math.random() - 0.5) * AI_TARGET_ERROR_RANGE : 0;
    }
    if (!this.aiTarget) return;
    const target = this.aiTarget.x + this.aiTarget.width / 2 - this.climber.width / 2 + this.aiTargetOffset;
    this.climber.x += clamp(target - this.climber.x, -1, 1) * 280 * dt;
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The jump is automatic; your job is choosing the landing column." }; }
}
