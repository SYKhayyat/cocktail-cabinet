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
    this.lifeLost = false;
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
  // setSettings is the model's public API and may be called directly, not only
  // through the DOM. It validates exactly as validateSettings does, and keeps
  // the previous value for anything invalid, so a caller cannot install a board
  // that produces a body with negative coordinates.
  setSettings(settings = {}) {
    const validated = this.validateSettings({ ...this.pendingSettings, ...settings });
    if (!validated) return false;
    this.pendingSettings = validated;
    return true;
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
    this.lifeLost = false;
    this.lossReason = "";
    // The body trails to the left of the head along the middle row, so the body is
  // laid out from the head at x = headX back to x = headX - length + 1. The
  // head is pushed right far enough for the whole body to fit: valid settings
  // alone do not guarantee that, since a start length only has to be smaller
  // than the smaller board dimension, and at 10 columns a length of 7 would
  // run off the left edge from the centre. Clamping each segment instead would
  // stack several of them on one cell, which is a different corruption.
  const bodyLength = clamp(Math.max(this.startingLength, length), 1, this.cols);
  const startY = Math.floor(this.rows / 2);
  const headX = clamp(Math.floor(this.cols / 2), bodyLength - 1, this.cols - 1);
  this.snake = Array.from({ length: bodyLength }, (_, index) => ({ x: headX - index, y: startY }));
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.aiClock = 0;
    this.won = false;
    this.rebuildOccupied();
    const placed = this.side === "apples" ? { x: Math.min(this.cols - 3, headX + 6), y: Math.max(2, startY - 6) } : this.freeApple();
    this.apple = placed || this.freeApple();
  }
  moveInterval() { return Math.max(0.08, 0.18 - this.score * 0.004); }
  // Returns a free cell, or null when the board is full. Null is a real
  // outcome, not a fallback case: the caller treats a full board as a win.
// A single integer key per cell. The board is at most 60x44, so y * cols + x
  // is unique and cheap; a "x,y" string would allocate ~2,600 strings on every
  // scan, which dominated the measurement once the scan stopped being
  // quadratic.
cellKey(x, y) { return y * this.cols + x; }
  // The occupied set is maintained as the snake moves rather than rebuilt for
  // every scan. The original code re-tested every segment for every candidate
  // cell -- O(cells * snake length), about 6.7 million comparisons per apple on
  // a nearly-full 60x44 board, with a move possible every 80ms.
  //
  // Coherence: update() is the only mutator, and reset() rebuilds from scratch.
  // The size check in occupiedCells() catches an externally replaced body (as
  // tests do) and rebuilds. Assigning a body of the *same* length without going
  // through reset() or update() would defeat it, so external callers should
  // prefer reset() -- a stale cache would otherwise misplace an apple.
  rebuildOccupied() {
    this.occupied = new Set(this.snake.map((part) => this.cellKey(part.x, part.y)));
    return this.occupied;
  }
  occupiedCells() {
    if (!this.occupied || this.occupied.size !== this.snake.length) return this.rebuildOccupied();
    return this.occupied;
  }
  isOccupiedCell(x, y) { return this.occupiedCells().has(this.cellKey(x, y)); }
  // Two passes and exactly one random draw per placement: count the free cells,
  // pick an index, then walk to that cell. Neither pass allocates, so this
  // avoids the ~2,600 object allocations the original array-building version
  // performed per apple.
  //
  // The single draw is deliberate. Reservoir sampling also avoids allocation,
//  but it consumes one Math.random call per free cell, which changes how many
  // values the seeded Monte Carlo suite consumes per turn -- that silently
  // resampled the opponent's mistake rolls and moved the measured difficulty
  // band. Keeping the draw count constant preserves the existing stream.
  freeApple() {
    const occupied = this.occupiedCells();
    let freeCount = 0;
    for (let y = 0; y < this.rows; y += 1) for (let x = 0; x < this.cols; x += 1) {
      if (!occupied.has(this.cellKey(x, y))) freeCount += 1;
    }
    if (!freeCount) return null;
    let index = Math.floor(Math.random() * freeCount);
    for (let y = 0; y < this.rows; y += 1) for (let x = 0; x < this.cols; x += 1) {
      if (occupied.has(this.cellKey(x, y))) continue;
      if (index === 0) return { x, y };
      index -= 1;
    }
    return null;
  }
  update(dt, input) {
    if (this.gameOver || this.won) return;
    if (this.side === "apples" && input.placeApple) {
      const cell = this.cellFromPointer(input.placeApple);
      if (!this.isOccupiedCell(cell.x, cell.y)) this.apple = cell;
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
      this.occupied.add(this.cellKey(next.x, next.y));
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
    const vacated = this.snake.pop();
    this.snake.unshift(next);
    this.occupied.delete(this.cellKey(vacated.x, vacated.y));
    this.occupied.add(this.cellKey(next.x, next.y));
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
