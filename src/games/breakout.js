import { clamp, circleHitsRect, drawText } from "../engine.js";

export class BreakoutGame {
  constructor() {
    this.id = "breakout";
    this.title = "Breakout";
    this.description = "Normal play: move the bottom paddle with the mouse. Setup play: drag the bricks while the computer returns the ball.";
    this.side = "bottom";
    this.score = 0;
  }
  sideLabel() { return this.side === "bottom" ? "You control the bottom paddle" : "You set up the blocks"; }
  setSide(side) { this.side = side; }
  reset() {
    this.score = 0;
    this.human = { x: 350, y: 520, width: 112, height: 16, speed: 460 };
    this.machine = { x: 350, y: 24, width: 112, height: 16 };
    this.ball = { x: 400, y: 280, vx: 180, vy: 210, radius: 8 };
    this.bricks = [];
    for (let row = 0; row < 5; row += 1) for (let column = 0; column < 10; column += 1) this.bricks.push({ x: 48 + column * 70, y: 115 + row * 25, width: 62, height: 18, hits: 1 });
    this.dragIndex = null;
  }
  moveHuman(dt, input) {
    if (this.side === "blocks") return;
    if (this.side === "bottom" && input.pointer.x > 0) this.human.x = input.pointer.x - this.human.width / 2;
    else {
      const direction = (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0);
      this.human.x += direction * this.human.speed * dt;
    }
    this.human.x = clamp(this.human.x, 8, 800 - this.human.width - 8);
  }
  updateBlocks(input) {
    if (!input.pointer.down) { this.dragIndex = null; return; }
    if (input.pointer.clicked) this.dragIndex = this.bricks.findIndex((brick) => input.pointer.x >= brick.x && input.pointer.x <= brick.x + brick.width && input.pointer.y >= brick.y && input.pointer.y <= brick.y + brick.height);
    if (this.dragIndex !== null && this.dragIndex >= 0) {
      const brick = this.bricks[this.dragIndex];
      brick.x = clamp(Math.round((input.pointer.x - brick.width / 2 - 48) / 70) * 70 + 48, 8, 800 - brick.width - 8);
      brick.y = clamp(Math.round((input.pointer.y - brick.height / 2 - 115) / 25) * 25 + 115, 60, 250);
    }
  }
  update(dt, input) {
    this.updateBlocks(input);
    this.moveHuman(dt, input);
    const aiPaddle = this.side === "blocks" ? this.human : this.machine;
    aiPaddle.x = clamp(aiPaddle.x + clamp(this.ball.x - aiPaddle.x, -1, 1) * 300 * dt, 8, 800 - aiPaddle.width - 8);
    this.machine.x = clamp(this.machine.x + clamp(this.ball.x - this.machine.x, -1, 1) * 300 * dt, 8, 800 - this.machine.width - 8);
    const previousY = this.ball.y;
    this.ball.x += this.ball.vx * dt; this.ball.y += this.ball.vy * dt;
    if (this.ball.x < this.ball.radius || this.ball.x > 800 - this.ball.radius) this.ball.vx *= -1;
    for (const paddle of [this.human, this.machine]) {
      const horizontal = this.ball.x + this.ball.radius > paddle.x && this.ball.x - this.ball.radius < paddle.x + paddle.width;
      const reachedBottom = paddle.y > 280 && this.ball.vy > 0 && previousY <= paddle.y - this.ball.radius && this.ball.y + this.ball.radius >= paddle.y;
      const reachedTop = paddle.y < 280 && this.ball.vy < 0 && previousY >= paddle.y + paddle.height + this.ball.radius && this.ball.y - this.ball.radius <= paddle.y + paddle.height;
      if (horizontal && (reachedBottom || reachedTop)) this.bounceFromPaddle(paddle);
    }
    for (const brick of this.bricks) {
      if (brick.hits && circleHitsRect(this.ball, brick)) { brick.hits = 0; this.ball.vy *= -1; this.score += 10; break; }
    }
    if (this.ball.y > 545 || this.ball.y < 15) this.resetBall();
  }
  bounceFromPaddle(paddle) {
    this.ball.vy *= -1.02;
    this.ball.vx += clamp((this.ball.x - (paddle.x + paddle.width / 2)) * 4, -180, 180);
    this.ball.y = paddle.y < 280 ? paddle.y + paddle.height + this.ball.radius + 1 : paddle.y - this.ball.radius - 1;
  }
  resetBall() {
    this.ball = { x: 400, y: 280, vx: 180, vy: 210, radius: 8 };
    this.score = Math.max(0, this.score - 5);
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    this.bricks.forEach((brick) => { if (brick.hits) { context.fillStyle = "#38bdf8"; context.fillRect(brick.x, brick.y, brick.width, brick.height); } });
    context.fillStyle = "#fbbf24"; context.fillRect(this.machine.x, this.machine.y, this.machine.width, this.machine.height);
    context.fillStyle = this.side === "blocks" ? "#fb7185" : "#fb7185"; context.fillRect(this.human.x, this.human.y, this.human.width, this.human.height);
    context.fillStyle = "#f8fafc"; context.beginPath(); context.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2); context.fill();
    drawText(context, this.side === "blocks" ? "Hold and drag a brick to move it · the computer plays" : "Move the mouse to control the bottom paddle", 16, 28, 14, "#cbd5e1");
    drawText(context, "The paddle is the wide bar at the bottom. The ball must not pass it.", 16, 542, 12, "#64748b");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "The ball uses continuous collision checks so the bottom paddle cannot be skipped." }; }
}
