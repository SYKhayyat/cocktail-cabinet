import { clamp, drawText } from "../engine.js";

const CELL = 20;
const COLS = 40;
const ROWS = 28;

export class SnakeGame {
  constructor() {
    this.id = "snake";
    this.title = "Snake";
    this.description = "You can grow the snake or feed it. The machine makes every move honestly.";
    this.side = "apples";
    this.score = 0;
    this.snake = [];
    this.apple = null;
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.elapsed = 0;
    this.aiClock = 0;
  }

  sideLabel() { return this.side === "apples" ? "You place apples" : "You steer the snake"; }
  setSide(side) { this.side = side; }
  reset() {
    this.score = 0;
    this.snake = [{ x: 20, y: 14 }, { x: 19, y: 14 }, { x: 18, y: 14 }];
    this.direction = { x: 1, y: 0 };
    this.nextDirection = { x: 1, y: 0 };
    this.elapsed = 0;
    this.aiClock = 0;
    this.apple = this.side === "apples" ? { x: 28, y: 7 } : this.freeApple();
  }
  freeApple() {
    const open = [];
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
      if (!this.snake.some((part) => part.x === x && part.y === y)) open.push({ x, y });
    }
    return open[Math.floor(Math.random() * open.length)] || { x: 0, y: 0 };
  }
  update(dt, input) {
    this.elapsed += dt;
    if (this.side === "apples" && input.pointer.clicked) {
      const x = clamp(Math.floor(input.pointer.x / CELL), 0, COLS - 1);
      const y = clamp(Math.floor(input.pointer.y / CELL), 0, ROWS - 1);
      if (!this.snake.some((part) => part.x === x && part.y === y)) this.apple = { x, y };
    }
    if (this.side === "snake") {
      if (input.pressed.has("ArrowUp") || input.pressed.has("w")) this.nextDirection = { x: 0, y: -1 };
      if (input.pressed.has("ArrowDown") || input.pressed.has("s")) this.nextDirection = { x: 0, y: 1 };
      if (input.pressed.has("ArrowLeft") || input.pressed.has("a")) this.nextDirection = { x: -1, y: 0 };
      if (input.pressed.has("ArrowRight") || input.pressed.has("d")) this.nextDirection = { x: 1, y: 0 };
    } else {
      this.chooseDirection();
    }
    if (this.nextDirection.x + this.direction.x !== 0 || this.nextDirection.y + this.direction.y !== 0) this.direction = this.nextDirection;
    this.aiClock += dt;
    const interval = Math.max(0.07, 0.17 - this.score * 0.002);
    if (this.aiClock < interval) return;
    this.aiClock = 0;
    const head = this.snake[0];
    const next = { x: (head.x + this.direction.x + COLS) % COLS, y: (head.y + this.direction.y + ROWS) % ROWS };
    if (next.x === this.apple?.x && next.y === this.apple?.y) {
      this.score += 1;
      this.snake.unshift(next);
      this.apple = this.side === "apples" ? this.freeApple() : this.freeApple();
      return;
    }
    this.snake.unshift(next);
    this.snake.pop();
  }
  chooseDirection() {
    const head = this.snake[0];
    const apple = this.apple;
    if (!apple) return;
    const choices = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
    ].filter((direction) => !(direction.x + this.direction.x === 0 && direction.y + this.direction.y === 0));
    choices.sort((a, b) => {
      const scoreA = this.routeScore(head, a, apple);
      const scoreB = this.routeScore(head, b, apple);
      return scoreA - scoreB;
    });
    this.nextDirection = choices[0];
  }
  routeScore(head, direction, apple) {
    const next = { x: head.x + direction.x, y: head.y + direction.y };
    if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) return 10000;
    if (this.snake.some((part) => part.x === next.x && part.y === next.y)) return 5000;
    return Math.abs(next.x - apple.x) + Math.abs(next.y - apple.y);
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    context.strokeStyle = "#1e293b"; context.lineWidth = 1;
    for (let x = 0; x <= 800; x += CELL) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 560); context.stroke(); }
    for (let y = 0; y <= 560; y += CELL) { context.beginPath(); context.moveTo(0, y); context.lineTo(800, y); context.stroke(); }
    if (this.apple) { context.fillStyle = "#fb7185"; context.beginPath(); context.arc(this.apple.x * CELL + 10, this.apple.y * CELL + 10, 8, 0, Math.PI * 2); context.fill(); }
    this.snake.forEach((part, index) => { context.fillStyle = index === 0 ? "#22d3ee" : "#0e7490"; context.fillRect(part.x * CELL + 2, part.y * CELL + 2, CELL - 4, CELL - 4); });
    drawText(context, this.side === "apples" ? "Click anywhere to place the next apple" : "Arrow keys / WASD to steer", 16, 28, 14, "#cbd5e1");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The snake grows a little faster each apple." }; }
}
