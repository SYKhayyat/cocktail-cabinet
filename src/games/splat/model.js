import { clamp } from "../../engine.js";

const COLUMN_WIDTH = 30;
const COLUMN_COUNT = 30;
const COLUMN_SPACING = 150;
const GAP_HEIGHT = 112;
const HORIZONTAL_SPEED = 120;
const GRAVITY = 220;
const THRUST = 680;
const COMPUTER_MISTAKE_CHANCE = 0.005;

export class SplatModel {
  constructor() {
    this.id = "splat";
    this.title = "Splat";
    this.description = "The object moves right automatically. Click the upper or lower half of the screen to thrust up or down through the gaps.";
    this.side = "climber";
    this.score = 0;
  }
  sideLabel() { return this.side === "climber" ? "You steer the falling object" : "Computer steers; you place columns"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.player = { x: 70, y: 280, radius: 12, vy: 0 };
    this.columns = [];
    this.cameraX = 0;
    this.aiClock = 0;
    this.computerMistake = false;
    this.won = false;
    for (let index = 0; index < COLUMN_COUNT; index += 1) {
      const gapY = 150 + ((index * 83 + 47) % 230);
      this.columns.push({ x: 190 + index * COLUMN_SPACING, y: 0, width: COLUMN_WIDTH, height: 560, gapY, gapHeight: GAP_HEIGHT, passed: false });
    }
    this.nextColumn = this.columns[0];
  }
  update(dt, input) {
    if (this.side === "layout" && input.placeColumnX !== undefined) this.addColumn(input.placeColumnX, this.player.y);
    this.player.vy += GRAVITY * dt;
    if (this.side === "climber") this.applyPlayerThrust(input, dt); else this.moveComputer(dt);
    this.player.x += HORIZONTAL_SPEED * dt;
    this.player.y += this.player.vy * dt;
    this.player.y = clamp(this.player.y, 18, 542);
    this.cameraX = clamp(this.player.x - 110, 0, this.columns.at(-1).x - 650);
    for (const column of this.columns) {
      if (column.passed || !this.horizontalCollision(column)) continue;
      const insideGap = this.player.y + this.player.radius > column.gapY && this.player.y - this.player.radius < column.gapY + column.gapHeight;
      if (!insideGap) {
        this.lifeLost = true;
        this.player.vy *= -0.25;
        break;
      }
      if (this.player.x > column.x + column.width / 2) {
        column.passed = true;
        this.score += 1;
        this.nextColumn = this.columns.find((candidate) => !candidate.passed) || null;
        this.computerMistake = Math.random() < COMPUTER_MISTAKE_CHANCE;
        this.aiClock = 0;
      }
    }
    if (this.player.x >= this.columns.at(-1).x + 100) this.won = true;
  }
  addColumn(x, gapY = 280) {
    const column = { x: clamp(x, this.player.x + 90, this.player.x + 260), y: 0, width: COLUMN_WIDTH, height: 560, gapY: clamp(gapY, 90, 390), gapHeight: GAP_HEIGHT, passed: false };
    this.columns.push(column);
    this.columns.sort((a, b) => a.x - b.x);
    if (!this.nextColumn) this.nextColumn = column;
    return column;
  }
  horizontalCollision(column) { return this.player.x + this.player.radius > column.x && this.player.x - this.player.radius < column.x + column.width; }
  applyPlayerThrust(input, dt) {
    const keyThrust = input.thrust || 0;
    this.player.vy += keyThrust * THRUST * dt;
  }
  moveComputer(dt) {
    const column = this.columns.find((candidate) => !candidate.passed && candidate.x > this.player.x);
    if (!column) return;
    const targetY = column.gapY + column.gapHeight / 2;
    const difference = targetY - this.player.y;
    if (this.computerMistake && this.player.x > column.x - 60) {
      this.lifeLost = true;
      return;
    }
    const desiredVelocity = clamp(difference * 4, -360, 360);
    this.player.vy += (desiredVelocity - this.player.vy) * Math.min(1, dt * 8);
    this.aiClock += dt;
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "Clear the gaps to score; reach the far right to win." }; }
}
