import { clamp } from "../../engine.js";

const COLUMN_WIDTH = 28;
const GAP_HEIGHT = 100;
const GRAVITY = 900;
const JUMP_SPEED = 390;
const COMPUTER_MISTAKE_CHANCE = 0.18;

export class SplatModel {
  constructor() {
    this.id = "splat";
    this.title = "Splat";
    this.description = "Guide the falling object through the gaps. Click or press Space to boost upward before it hits a column.";
    this.side = "climber";
    this.score = 0;
  }
  sideLabel() { return this.side === "climber" ? "You guide the falling object" : "Computer climbs; you place the gaps"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.player = { x: 60, y: 500, radius: 12, vy: 0 };
    this.columns = [];
    this.nextColumn = null;
    this.aiClock = 0;
    this.won = false;
    for (let index = 0; index < 5; index += 1) this.addColumn(150 + index * 145, 450 - index * 55);
    this.nextColumn = this.columns[0];
  }
  addColumn(x = null, gapY = null) {
    const columnX = x ?? 120 + this.columns.length * 145 + Math.random() * 40;
    const columnGapY = gapY ?? 80 + Math.random() * 300;
    const column = { x: clamp(columnX, 8, 800 - COLUMN_WIDTH - 8), y: 0, width: COLUMN_WIDTH, height: 560, gapY: clamp(columnGapY, 70, 450), gapHeight: GAP_HEIGHT, passed: false };
    this.columns.push(column);
    return column;
  }
  update(dt, input) {
    if (this.side === "layout" && input.placeColumnX !== undefined) this.addColumn(input.placeColumnX, this.player.y);
    if (this.side === "climber") this.movePlayer(input, dt); else this.moveComputer(dt);
    this.player.vy = Math.min(this.player.vy + GRAVITY * dt, 520);
    this.player.y += this.player.vy * dt;
    this.player.x = clamp(this.player.x, 16, 784);
    for (const column of this.columns) {
      if (column.passed || !this.horizontalCollision(column)) continue;
      const insideGap = this.player.y + this.player.radius > column.gapY && this.player.y - this.player.radius < column.gapY + column.gapHeight;
      if (!insideGap) {
        this.lifeLost = true;
        this.player.vy *= -0.35;
        break;
      }
      if (this.player.vy < 0 && this.player.y < column.gapY + column.gapHeight * 0.55) {
        column.passed = true;
        this.score += 100;
        this.nextColumn = this.columns.find((candidate) => !candidate.passed) || null;
        this.computerMistake = Math.random() < COMPUTER_MISTAKE_CHANCE;
      }
    }
    if (this.player.y > 560) this.lifeLost = true;
    if (this.columns.every((column) => column.passed)) this.won = true;
  }
  horizontalCollision(column) { return this.player.x + this.player.radius > column.x && this.player.x - this.player.radius < column.x + column.width; }
  movePlayer(input, dt) {
    const direction = input.keyDirection || 0;
    if (direction) this.player.x += direction * 260 * dt;
    else if (input.pointerMoved && input.pointerX > 0) this.player.x += clamp(input.pointerX - this.player.x, -1, 1) * 260 * dt;
    if (input.jump && this.player.vy > -220) this.player.vy = -JUMP_SPEED;
  }
  moveComputer(dt) {
    const column = this.columns.find((candidate) => !candidate.passed);
    if (!column) return;
    const center = column.x + column.width / 2;
    this.player.x += clamp(center - this.player.x, -1, 1) * 190 * dt;
    this.aiClock += dt;
    if (Math.abs(this.player.x - center) < 55 && this.player.vy > -100 && this.player.y > column.gapY + column.gapHeight * 0.35 && this.aiClock > (this.computerMistake ? 0.4 : 0.12)) {
      this.player.vy = -JUMP_SPEED;
    this.aiClock = 0;
    this.computerMistake = Math.random() < COMPUTER_MISTAKE_CHANCE;
    }
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "Pass through every highlighted gap. Click or press Space to rise." }; }
}
