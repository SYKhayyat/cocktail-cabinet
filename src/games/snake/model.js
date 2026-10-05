import { clamp } from "../../geometry.js";
import { recordDecision } from "../../decisions.js";

const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 560;

// Snake computer factors. There is deliberately no chance of a wrong turn: the
// snake goes wrong because it has not looked at the board yet, or because it is
// already committed to a heading. Both are limits, not dice.
const AI_PERCEPTION_INTERVAL = 0.26;
const AI_COMMIT_MOVES = 3;

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
    this.decisionLog = [];
    this.lastDecision = null;
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
    this.aiPerceptionInterval = AI_PERCEPTION_INTERVAL;
    this.aiCommitMoves = AI_COMMIT_MOVES;
    this.aiPerceptionClock = 0;
    this.aiPerceivedApple = null;
    this.aiCommitLeft = 0;
    this.decisionLog = [];
    this.lastDecision = null;
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
    const interval = this.moveInterval() * (this.side === "snake" ? 1 : 1);
    if (this.side === "snake") {
      if (input.direction) this.nextDirection = input.direction;
      if (input.steer) this.steerToward(input.steer.x, input.steer.y);
    }
    this.aiClock += dt;
    if (this.side !== "snake") {
      // Perception is refreshed on a clock rather than every frame, so the
      // apple can move out from under the snake between looks.
      this.refreshPerception(dt);
      if (this.aiClock >= interval) this.chooseDirection();
    }
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
  // The snake only re-reads the board every perceptionInterval seconds. When
  // the apple is placed somewhere new it keeps steering toward where the apple
  // used to be, which is where its mistakes come from: it is not thinking badly,
  // it has not noticed yet.
  refreshPerception(dt) {
    // Seconds, not frames. Subtracting 1 per frame drove the clock negative on
    // the first frame at any normal timestep, so the snake re-read the board
    // every frame and the reaction delay did not exist.
    this.aiPerceptionClock -= dt;
    if (this.aiPerceptionClock > 0 || !this.apple) return;
    this.aiPerceptionClock = this.aiPerceptionInterval;
    this.aiPerceivedApple = { x: this.apple.x, y: this.apple.y };
  }
  chooseDirection() {
    const head = this.snake[0];
    const believed = this.aiPerceivedApple;
    if (!believed) return;
    const choices = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].filter((direction) => !(direction.x + this.direction.x === 0 && direction.y + this.direction.y === 0));
    if (!choices.length) return;
    // Scored against what the snake believes, not against the true apple.
    choices.sort((a, b) => this.routeScore(head, a, believed) - this.routeScore(head, b, believed));
    // Safety is decided by whether the cell is actually enterable, not by the
    // route score. Filtering on the score treated a cell inside the snake's own
    // body as safe, because that scores 5000 and the wall scores 10000 -- so the
    // snake would plan into its own tail and never once find itself with no
    // legal move.
    const safeChoices = choices.filter((direction) => this.canEnter(head, direction));
    const forced = safeChoices.length === 0;
    const candidates = forced ? choices : safeChoices;

    // Momentum: while a commitment is running the snake holds its heading unless
    // that heading is about to kill it. Without this it re-plans every move and
    // plays like a machine that can see the whole board.
    let chosen;
    let held = false;
    // Counted in moves, not frames: a commitment is about how many turns the
    // snake holds, and the snake only turns on a move.
    if (this.aiCommitLeft > 0) this.aiCommitLeft -= 1;
    if (this.aiCommitLeft > 0 && candidates.some((direction) => direction.x === this.direction.x && direction.y === this.direction.y)) {
      chosen = this.direction;
      held = true;
    } else {
      chosen = candidates[0];
      if (chosen.x !== this.direction.x || chosen.y !== this.direction.y) this.aiCommitLeft = this.aiCommitMoves;
    }
    this.nextDirection = chosen;
    // The true apple position is recorded so a test can score the decision after
    // the fact. Nothing in this function branches on it.
    // The legal cells at the moment of the decision are recorded so a test can
    // judge the choice against what was actually on offer, rather than against
    // every adjacent cell including the ones inside the snake's body.
    const headCell = { x: head.x, y: head.y };
    const safeCells = safeChoices.map((direction) => {
      const next = { x: headCell.x + direction.x, y: headCell.y + direction.y };
      return { x: this.wrap ? (next.x + this.cols) % this.cols : next.x, y: this.wrap ? (next.y + this.rows) % this.rows : next.y };
    });
    const chosenNext = { x: headCell.x + chosen.x, y: headCell.y + chosen.y };
    recordDecision(this, {
      chose: { x: chosen.x, y: chosen.y },
      choseCell: { x: this.wrap ? (chosenNext.x + this.cols) % this.cols : chosenNext.x, y: this.wrap ? (chosenNext.y + this.rows) % this.rows : chosenNext.y },
      head: headCell,
      safeCells,
      held,
      forced,
      safeOptions: safeChoices.length,
      believed: { x: believed.x, y: believed.y },
      actual: this.apple ? { x: this.apple.x, y: this.apple.y } : null
    });
  }
  canEnter(head, direction) {
    const next = { x: head.x + direction.x, y: head.y + direction.y };
    const x = this.wrap ? (next.x + this.cols) % this.cols : next.x;
    const y = this.wrap ? (next.y + this.rows) % this.rows : next.y;
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return false;
    if (this.snake.some((part) => part.x === x && part.y === y)) return false;
    return true;
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
