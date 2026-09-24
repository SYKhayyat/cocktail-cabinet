import { clamp } from "../../engine.js";

const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 560;
const AI_MISTAKE_CHANCE = 0.45;
const AI_MIN_REACTION_STEPS = 1;
const AI_MAX_REACTION_STEPS = 3;

export class SnakeModel {
  constructor() {
    this.id = "snake";
    this.title = "Snake";
    this.description = "Guide the snake with the mouse or keyboard. The computer places apples in the flipped mode.";
    this.side = "snake";
    this.score = 0;
    this.snake = [];
    this.apple = null;
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.aiClock = 0;
    this.cols = 40;
    this.rows = 28;
    this.startingLength = 3;
    this.wrap = false;
    this.pendingSettings = { cols: 40, rows: 28, startingLength: 3, wrap: false };
    this.roundSettings = { ...this.pendingSettings };
    this.gameOver = false;
  }
  sideLabel() { return this.side === "apples" ? "You place apples" : "You steer the snake"; }
  setSide(side) { this.side = side; }
  setSettings(settings) {
    this.pendingSettings = {
      cols: Number(settings.cols) || this.pendingSettings.cols,
      rows: Number(settings.rows) || this.pendingSettings.rows,
      startingLength: Number(settings.startingLength) || this.pendingSettings.startingLength,
      wrap: Boolean(settings.wrap),
    };
  }
  applyPendingSettings() {
    this.roundSettings = { ...this.pendingSettings };
    this.cols = this.roundSettings.cols;
    this.rows = this.roundSettings.rows;
    this.startingLength = clamp(this.roundSettings.startingLength, 3, 12);
    this.wrap = this.roundSettings.wrap;
  }
  cellWidth() { return BOARD_WIDTH / this.cols; }
  cellHeight() { return BOARD_HEIGHT / this.rows; }
  cellFromPointer(pointer) {
    return { x: clamp(Math.floor(pointer.x / this.cellWidth()), 0, this.cols - 1), y: clamp(Math.floor(pointer.y / this.cellHeight()), 0, this.rows - 1) };
  }
  cellCenter(cell) { return { x: cell.x * this.cellWidth() + this.cellWidth() / 2, y: cell.y * this.cellHeight() + this.cellHeight() / 2 }; }
  reset(keepScore = false, length = this.startingLength) {
    this.cols = this.roundSettings.cols;
    this.rows = this.roundSettings.rows;
    this.startingLength = clamp(this.roundSettings.startingLength, 3, 12);
    this.wrap = this.roundSettings.wrap;
    if (!keepScore) this.score = 0;
    this.gameOver = false;
    this.lossReason = "";
    const startX = Math.floor(this.cols / 2);
    const startY = Math.floor(this.rows / 2);
    this.snake = Array.from({ length: Math.max(this.startingLength, length) }, (_, index) => ({ x: startX - index, y: startY }));
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.aiClock = 0;
    this.aiErrorSteps = 3;
    this.apple = this.side === "apples" ? { x: Math.min(this.cols - 3, startX + 6), y: Math.max(2, startY - 6) } : this.freeApple();
  }
  moveInterval() { return Math.max(0.08, 0.18 - this.score * 0.004); }
  freeApple() {
    const open = [];
    for (let y = 0; y < this.rows; y += 1) for (let x = 0; x < this.cols; x += 1) {
      if (!this.snake.some((part) => part.x === x && part.y === y)) open.push({ x, y });
    }
    return open[Math.floor(Math.random() * open.length)] || { x: 0, y: 0 };
  }
  update(dt, input) {
    if (this.gameOver) return;
    if (this.side === "apples" && input.placeApple) {
      const cell = this.cellFromPointer(input.placeApple);
      if (!this.snake.some((part) => part.x === cell.x && part.y === cell.y)) this.apple = cell;
    }
    const interval = this.moveInterval();
    if (this.side === "snake") {
      if (input.direction) this.nextDirection = input.direction;
      if (input.steer) this.steerToward(input.steer.x, input.steer.y);
    }
    this.aiClock += dt;
    if (this.side !== "snake" && this.aiClock >= interval) this.chooseDirection();
    if (this.nextDirection.x + this.direction.x !== 0 || this.nextDirection.y + this.direction.y !== 0) this.direction = this.nextDirection;
    if (this.aiClock < interval) return;
    this.aiClock = 0;
    const head = this.snake[0];
    let next = { x: head.x + this.direction.x, y: head.y + this.direction.y };
    if (this.wrap) next = { x: (next.x + this.cols) % this.cols, y: (next.y + this.rows) % this.rows };
    else if (next.x < 0 || next.x >= this.cols || next.y < 0 || next.y >= this.rows) { this.gameOver = true; this.lossReason = "wall"; return; }
    if (this.snake.some((part) => part.x === next.x && part.y === next.y)) { this.gameOver = true; this.lossReason = "self"; return; }
    if (next.x === this.apple?.x && next.y === this.apple?.y) {
      this.score += 1;
      this.snake.unshift(next);
      this.apple = this.freeApple();
      return;
    }
    this.snake.unshift(next);
    this.snake.pop();
  }
  steerToward(pointerX, pointerY) {
    const head = this.snake[0];
    const target = this.cellFromPointer({ x: pointerX, y: pointerY });
    const dx = target.x - head.x;
    const dy = target.y - head.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const direction = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    if (direction.x + this.direction.x || direction.y + this.direction.y) this.nextDirection = direction;
  }
  chooseDirection() {
    const head = this.snake[0];
    const apple = this.apple;
    if (!apple) return;
    const choices = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].filter((direction) => !(direction.x + this.direction.x === 0 && direction.y + this.direction.y === 0));
    choices.sort((a, b) => this.routeScore(head, a, apple) - this.routeScore(head, b, apple));
    const current = choices.find((direction) => direction.x === this.direction.x && direction.y === this.direction.y);
    if (this.aiErrorSteps > 0 && current && this.routeScore(head, current, apple) < 1000) {
      this.aiErrorSteps -= 1;
      this.nextDirection = current;
    } else {
      this.aiErrorSteps = AI_MIN_REACTION_STEPS + Math.floor(Math.random() * (AI_MAX_REACTION_STEPS - AI_MIN_REACTION_STEPS + 1));
      this.nextDirection = Math.random() < AI_MISTAKE_CHANCE ? choices[Math.floor(Math.random() * choices.length)] : choices[0];
    }
  }
  routeScore(head, direction, apple) {
    const next = { x: head.x + direction.x, y: head.y + direction.y };
    const x = this.wrap ? (next.x + this.cols) % this.cols : next.x;
    const y = this.wrap ? (next.y + this.rows) % this.rows : next.y;
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return 10000;
    if (this.snake.some((part) => part.x === x && part.y === y)) return 5000;
    return Math.abs(x - apple.x) + Math.abs(y - apple.y);
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The computer makes every move from the same collision rules you do." }; }
}

export { BOARD_WIDTH, BOARD_HEIGHT };
