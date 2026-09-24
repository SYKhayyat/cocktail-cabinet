import { clamp, drawText } from "../engine.js";

export class SnakeGame {
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
    this.cols = this.pendingSettings.cols;
    this.rows = this.pendingSettings.rows;
    this.startingLength = clamp(this.pendingSettings.startingLength, 3, 12);
    this.wrap = this.pendingSettings.wrap;
  }
  cellWidth() { return 800 / this.cols; }
  cellHeight() { return 560 / this.rows; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.gameOver = false;
    this.lossReason = "";
    const startX = Math.floor(this.cols / 2);
    const startY = Math.floor(this.rows / 2);
    this.snake = Array.from({ length: this.startingLength }, (_, index) => ({ x: startX - index, y: startY }));
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
    if (this.side === "apples" && input.pointer.clicked) {
      const x = clamp(Math.floor(input.pointer.x / this.cellWidth()), 0, this.cols - 1);
      const y = clamp(Math.floor(input.pointer.y / this.cellHeight()), 0, this.rows - 1);
      if (!this.snake.some((part) => part.x === x && part.y === y)) this.apple = { x, y };
    }
    const interval = this.moveInterval();
    if (this.side === "snake") {
      if (input.pressed.has("ArrowUp") || input.pressed.has("w")) this.nextDirection = { x: 0, y: -1 };
      if (input.pressed.has("ArrowDown") || input.pressed.has("s")) this.nextDirection = { x: 0, y: 1 };
      if (input.pressed.has("ArrowLeft") || input.pressed.has("a")) this.nextDirection = { x: -1, y: 0 };
      if (input.pressed.has("ArrowRight") || input.pressed.has("d")) this.nextDirection = { x: 1, y: 0 };
      if (input.pointer.down) this.steerToward(input.pointer.x, input.pointer.y);
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
    const dx = pointerX / this.cellWidth() - head.x - 0.5;
    const dy = pointerY / this.cellHeight() - head.y - 0.5;
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
      this.aiErrorSteps = 2 + Math.floor(Math.random() * 3);
      this.nextDirection = choices[0];
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
  draw(context) {
    const cellWidth = this.cellWidth();
    const cellHeight = this.cellHeight();
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    context.strokeStyle = "#1e293b"; context.lineWidth = 1;
    for (let x = 0; x <= this.cols; x += 1) { context.beginPath(); context.moveTo(x * cellWidth, 0); context.lineTo(x * cellWidth, 560); context.stroke(); }
    for (let y = 0; y <= this.rows; y += 1) { context.beginPath(); context.moveTo(0, y * cellHeight); context.lineTo(800, y * cellHeight); context.stroke(); }
    if (this.apple) { context.fillStyle = "#fb7185"; context.beginPath(); context.arc(this.apple.x * cellWidth + cellWidth / 2, this.apple.y * cellHeight + cellHeight / 2, Math.min(cellWidth, cellHeight) * 0.38, 0, Math.PI * 2); context.fill(); }
    this.snake.forEach((part, index) => { context.fillStyle = index === 0 ? "#22d3ee" : "#0e7490"; context.fillRect(part.x * cellWidth + 2, part.y * cellHeight + 2, cellWidth - 4, cellHeight - 4); });
    drawText(context, this.gameOver ? "Game over — press New round" : this.side === "apples" ? "Click to place apples · computer steers" : "Hold the mouse to steer · arrow keys also work", 16, 28, 14, "#cbd5e1");
    drawText(context, `${this.cols} × ${this.rows} board · ${this.wrap ? "walls wrap" : "walls end the round"} · starts at ${this.startingLength}`, 16, 542, 12, "#64748b");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The computer makes every move from the same collision rules you do." }; }
}
