import { clamp } from "../../engine.js";

const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 560;
const AI_MISTAKE_CHANCE = 0.0001;

export const SNAKE_MODES = [
  { value: "snake", label: "Solo — steer the snake" },
  { value: "apples", label: "Computer vs you — place apples" }
];

export const SNAKE_SETTINGS = {
  cols: { label: "Columns", min: 10, max: 60, step: 1, default: 40 },
  rows: { label: "Rows", min: 8, max: 44, step: 1, default: 28 },
  startingLength: { label: "Start length", min: 3, max: 12, step: 1, default: 3 },
  wrap: { type: "checkbox", default: false }
};

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
  get modes() { return SNAKE_MODES; }
  get sides() { return SNAKE_MODES.map((mode) => mode.value); }
  get settings() { return SNAKE_SETTINGS; }
  sideLabel() { return this.modes.find((mode) => mode.value === this.side)?.label || SNAKE_MODES[0].label; }
  setSide(side) { if (this.sides.includes(side)) this.side = side; }
  validateSettings(values) {
    const read = (key) => {
      const descriptor = SNAKE_SETTINGS[key];
      if (!descriptor || descriptor.type === "checkbox") return undefined;
      const value = Number(values[key]);
      if (!Number.isInteger(value) || value < descriptor.min || value > descriptor.max) return null;
      return value;
    };
    const cols = read("cols");
    const rows = read("rows");
    const startingLength = read("startingLength");
    if (cols === null || rows === null || startingLength === null) return null;
    if (startingLength >= Math.min(cols, rows)) return null;
    return { cols, rows, startingLength, wrap: Boolean(values.wrap) };
  }
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
    this.startingLength = clamp(this.roundSettings.startingLength, SNAKE_SETTINGS.startingLength.min, SNAKE_SETTINGS.startingLength.max);
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
    this.startingLength = clamp(this.roundSettings.startingLength, SNAKE_SETTINGS.startingLength.min, SNAKE_SETTINGS.startingLength.max);
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
    this.won = false;
    const placed = this.side === "apples" ? { x: Math.min(this.cols - 3, startX + 6), y: Math.max(2, startY - 6) } : this.freeApple();
    this.apple = placed || this.freeApple();
  }
  moveInterval() { return Math.max(0.08, 0.18 - this.score * 0.004); }
  // Returns a free cell, or null when the board is full. Null is a real
  // outcome, not a fallback case: the caller treats a full board as a win.
  freeApple() {
    const open = [];
    for (let y = 0; y < this.rows; y += 1) for (let x = 0; x < this.cols; x += 1) {
      if (!this.snake.some((part) => part.x === x && part.y === y)) open.push({ x, y });
    }
    if (!open.length) return null;
    return open[Math.floor(Math.random() * open.length)];
  }
  update(dt, input) {
    if (this.gameOver || this.won) return;
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
    const eating = next.x === this.apple?.x && next.y === this.apple?.y;
    // On a non-eating move the tail cell is vacated by the pop() at the end of
    // this tick, so the head may legitimately move into it. Checking the tail
    // as a collision would forbid a legal move. When the snake grows the tail
    // stays put, so the same cell must still count as solid.
    const collides = this.snake.some((part, index) => {
      if (!eating && index === this.snake.length - 1) return false;
      return part.x === next.x && part.y === next.y;
    });
    if (collides) { this.gameOver = true; this.lossReason = "self"; return; }
    if (eating) {
      this.score += 1;
      this.snake.unshift(next);
      const apple = this.freeApple();
      if (!apple) {
        // Every cell is occupied: the board is cleared, so the round is won.
        // Previously the apple fell back to (0,0), which the snake was
        // already covering, and the game limped on to a self-collision.
        this.apple = null;
        this.won = true;
        return;
      }
      this.apple = apple;
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
    const safeChoices = choices.filter((direction) => this.routeScore(head, direction, apple) < 10000);
    const candidates = safeChoices.length ? safeChoices : choices;
    this.nextDirection = Math.random() < AI_MISTAKE_CHANCE ? candidates[Math.min(candidates.length - 1, 1 + Math.floor(Math.random() * Math.max(1, candidates.length - 1)))] : candidates[0];
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
