import { clamp, circleHitsRect, drawText } from "../engine.js";

export class BreakoutGame {
  constructor() {
    this.id = "breakout";
    this.title = "Breakout";
    this.description = "Normal play: move the bottom paddle and keep the bouncing ball alive. Setup play: drag the blocks while the computer controls the paddle.";
    this.side = "bottom";
    this.score = 0;
  }
  sideLabel() { return this.side === "bottom" ? "You control the bottom paddle" : "You move the blocks"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.human = { x: 350, y: 520, width: 112, height: 16, speed: 460 };
    this.computer = { x: 350, y: 520, width: 112, height: 16, speed: 0 };
    this.ball = { x: 400, y: 280, vx: 180, vy: 210, radius: 8 };
    this.bricks = [];
    for (let row = 0; row < 5; row += 1) for (let column = 0; column < 10; column += 1) this.bricks.push({ x: 48 + column * 70, y: 90 + row * 25, width: 62, height: 18, hits: 1 });
    this.dragIndex = null;
    this.dragOffset = { x: 0, y: 0 };
  }
  activePaddle() { return this.side === "bottom" ? this.human : this.computer; }
  moveHuman(dt, input) {
    if (this.side === "blocks") {
      const predictedX = clamp(this.ball.x + this.ball.vx * 0.18, 8, 800 - this.computer.width - 8);
      this.computer.x += clamp(predictedX - this.computer.x, -1, 1) * 430 * dt;
      return;
    }
    const keyDirection = (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0);
    if (keyDirection) this.human.x += keyDirection * this.human.speed * dt;
    else if (input.pointer.x > 0) this.human.x = input.pointer.x - this.human.width / 2;
    this.human.x = clamp(this.human.x, 8, 800 - this.human.width - 8);
  }
  updateBlocks(input) {
    if (!input.pointer.down) { this.dragIndex = null; return; }
    if (input.pointer.clicked) {
      this.dragIndex = this.bricks.findIndex((brick) => input.pointer.x >= brick.x && input.pointer.x <= brick.x + brick.width && input.pointer.y >= brick.y && input.pointer.y <= brick.y + brick.height);
      const brick = this.bricks[this.dragIndex];
      this.dragOffset = brick ? { x: input.pointer.x - brick.x, y: input.pointer.y - brick.y } : { x: 0, y: 0 };
    }
    if (this.dragIndex !== null && this.dragIndex >= 0) {
      const brick = this.bricks[this.dragIndex];
      brick.x = clamp(input.pointer.x - this.dragOffset.x, 8, 800 - brick.width - 8);
      brick.y = clamp(input.pointer.y - this.dragOffset.y, 55, 250);
    }
  }
  update(dt, input) {
    this.updateBlocks(input);
    this.moveHuman(dt, input);
    const paddle = this.activePaddle();
    const previousY = this.ball.y;
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    if (this.ball.x < this.ball.radius || this.ball.x > 800 - this.ball.radius) this.ball.vx *= -1;
    if (this.ball.y < this.ball.radius) { this.ball.y = this.ball.radius; this.ball.vy *= -1; }
    const horizontal = this.ball.x + this.ball.radius > paddle.x && this.ball.x - this.ball.radius < paddle.x + paddle.width;
    if (horizontal && this.ball.vy > 0 && previousY <= paddle.y - this.ball.radius && this.ball.y + this.ball.radius >= paddle.y) {
      this.ball.vy *= -1.02;
      this.ball.vx += clamp((this.ball.x - (paddle.x + paddle.width / 2)) * 4, -200, 200);
      this.ball.y = paddle.y - this.ball.radius - 1;
      this.score += 1;
    }
    for (const brick of this.bricks) if (brick.hits && circleHitsRect(this.ball, brick)) { brick.hits = 0; this.ball.vy *= -1; this.score += 10; break; }
    if (this.ball.y > 545) { this.lifeLost = true; this.ball = { x: 400, y: 280, vx: 180, vy: 210, radius: 8 }; }
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    this.bricks.forEach((brick) => { if (brick.hits) { context.fillStyle = this.dragIndex === this.bricks.indexOf(brick) ? "#fbbf24" : "#38bdf8"; context.fillRect(brick.x, brick.y, brick.width, brick.height); } });
    const paddle = this.activePaddle();
    context.fillStyle = this.side === "bottom" ? "#fb7185" : "#fbbf24"; context.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    context.fillStyle = "#f8fafc"; context.beginPath(); context.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2); context.fill();
    drawText(context, this.side === "bottom" ? "Move the mouse or use A/D to control the bottom paddle" : "Hold and drag any block · the red computer paddle returns the ball", 16, 28, 14, "#cbd5e1");
    drawText(context, this.side === "bottom" ? "The ball bounces off the blocks and walls. Do not let it cross the bottom." : "Arrange the blocks, then let the computer play. There is no top paddle.", 16, 542, 12, "#64748b");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The computer predicts the ball in setup mode; it does not teleport or skip collisions." }; }
}
