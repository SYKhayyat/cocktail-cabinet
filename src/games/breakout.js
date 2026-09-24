import { clamp, circleHitsRect, drawText } from "../engine.js";

export class BreakoutGame {
  constructor() {
    this.id = "breakout";
    this.title = "Breakout";
    this.description = "A duel of paddles. Pick the human paddle; the machine tracks the ball and returns it.";
    this.side = "bottom";
    this.score = 0;
  }
  sideLabel() { return this.side === "bottom" ? "You control the bottom paddle" : "You control the top paddle"; }
  setSide(side) { this.side = side; }
  reset() {
    this.score = 0;
    this.human = { x: 350, y: this.side === "bottom" ? 520 : 24, width: 100, height: 12, speed: 420 };
    this.machine = { x: 350, y: this.side === "bottom" ? 24 : 520, width: 100, height: 12 };
    this.ball = { x: 400, y: 280, vx: 180, vy: 210, radius: 8 };
    this.bricks = [];
    for (let row = 0; row < 5; row += 1) for (let column = 0; column < 10; column += 1) this.bricks.push({ x: 48 + column * 70, y: 115 + row * 25, width: 62, height: 18, hits: 1 });
  }
  moveHuman(dt, input) {
    const direction = (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0);
    this.human.x = clamp(this.human.x + direction * this.human.speed * dt, 8, 800 - this.human.width - 8);
  }
  update(dt, input) {
    this.moveHuman(dt, input);
    this.machine.x = clamp(this.machine.x + clamp(this.ball.x - this.machine.x, -1, 1) * 280 * dt, 8, 800 - this.machine.width - 8);
    this.ball.x += this.ball.vx * dt; this.ball.y += this.ball.vy * dt;
    if (this.ball.x < this.ball.radius || this.ball.x > 800 - this.ball.radius) this.ball.vx *= -1;
    if (this.ball.y < this.ball.radius || this.ball.y > 560 - this.ball.radius) this.ball.vy *= -1;
    const paddles = [this.human, this.machine];
    for (const paddle of paddles) {
      if (circleHitsRect(this.ball, paddle) && ((paddle.y < 280 && this.ball.vy > 0) || (paddle.y > 280 && this.ball.vy < 0))) {
        this.ball.vy *= -1.02; this.ball.vx += clamp((this.ball.x - (paddle.x + paddle.width / 2)) * 4, -180, 180);
      }
    }
    for (const brick of this.bricks) {
      if (brick.hits && circleHitsRect(this.ball, brick)) {
        brick.hits = 0; this.ball.vy *= -1; this.score += 10; break;
      }
    }
    if (this.ball.y > 545) { this.ball = { x: 400, y: 280, vx: 180, vy: 210, radius: 8 }; this.score = Math.max(0, this.score - 5); }
    if (this.ball.y < 15) { this.ball = { x: 400, y: 280, vx: 180, vy: 210, radius: 8 }; this.score = Math.max(0, this.score - 5); }
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    this.bricks.forEach((brick) => { if (brick.hits) { context.fillStyle = "#38bdf8"; context.fillRect(brick.x, brick.y, brick.width, brick.height); } });
    context.fillStyle = "#fbbf24"; context.fillRect(this.machine.x, this.machine.y, this.machine.width, this.machine.height);
    context.fillStyle = "#fb7185"; context.fillRect(this.human.x, this.human.y, this.human.width, this.human.height);
    context.fillStyle = "#f8fafc"; context.beginPath(); context.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2); context.fill();
    drawText(context, "Clear the wall before the ball gets home.", 16, 28, 14, "#cbd5e1");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The machine tracks the ball, but never teleports." }; }
}
