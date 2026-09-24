import { clamp, circleHitsRect, drawText } from "../engine.js";

const BRICK_COLORS = { normal: "#38bdf8", extraLife: "#4ade80", double: "#f472b6", speed: "#fbbf24", shortBar: "#c084fc", longBar: "#fb923c", hazard: "#fb7185" };
const BRICK_LABELS = { extraLife: "+1 LIFE", double: "2 BALLS", speed: "SPEED", shortBar: "SHORT", longBar: "LONG", hazard: "DANGER" };

export class BreakoutGame {
  constructor() {
    this.id = "breakout";
    this.title = "Breakout";
    this.description = "Normal play: move the bottom paddle and keep the ball alive. Setup play: drag the blocks while the computer controls the paddle.";
    this.side = "bottom";
    this.score = 0;
  }
  sideLabel() { return this.side === "bottom" ? "You control the bottom paddle" : "You move the blocks"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.human = { x: 350, targetX: 350, y: 520, width: 112, height: 16, speed: 460 };
    this.computer = { x: 350, targetX: 350, y: 520, width: 112, height: 16 };
    this.balls = [this.newBall(400, 280, 180, 210)];
    this.bricks = [];
    const special = { 3: "extraLife", 8: "shortBar", 17: "double", 22: "speed", 28: "longBar", 38: "hazard" };
    for (let row = 0; row < 5; row += 1) for (let column = 0; column < 10; column += 1) {
      const index = row * 10 + column;
      this.bricks.push({ x: 48 + column * 70, y: 90 + row * 25, width: 62, height: 18, hits: 1, type: special[index] || "normal", active: true, phaseOffset: special[index] ? (index * 0.73) % 2.4 : 0, period: special[index] ? 1.6 + (index % 4) * 0.65 : 0 });
    }
    this.dragIndex = null;
    this.dragOffset = { x: 0, y: 0 };
    this.specialClock = 0;
    this.won = false;
  }
  resetAfterLife() {
    this.human = { x: 350, targetX: 350, y: 520, width: 112, height: 16, speed: 460 };
    this.computer = { x: 350, targetX: 350, y: 520, width: 112, height: 16 };
    this.balls = [this.newBall(400, 280, 180, 210)];
    this.dragIndex = null;
    this.won = false;
  }
  newBall(x, y, vx, vy) { return { x, y, vx, vy, radius: 8, dead: false }; }
  handleReadyInput(input) { this.updateBlocks(input); }
  activePaddle() { return this.side === "bottom" ? this.human : this.computer; }
  moveHuman(dt, input) {
    if (this.side === "blocks") {
      const leadBall = this.balls[0];
      if (leadBall) {
        const timeToPaddle = leadBall.vy > 0 ? Math.max(0, (this.computer.y - leadBall.y) / leadBall.vy) : 0.08;
        this.computer.targetX = clamp(leadBall.x + leadBall.vx * timeToPaddle, 8, 800 - this.computer.width - 8);
      }
      this.computer.x = moveToward(this.computer.x, this.computer.targetX, 900 * dt);
      return;
    }
    const keyDirection = (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0);
    const mouseTarget = input.pointer.x - this.human.width / 2;
    if (input.mode === "keyboard" || keyDirection) this.human.targetX = this.human.x + keyDirection * this.human.speed * dt;
    else {
      const pointerOverBar = input.pointer.x >= this.human.x - 4 && input.pointer.x <= this.human.x + this.human.width + 4;
      if (pointerOverBar) this.human.targetX = this.human.x;
      else if (input.pointer.moved && Math.abs(mouseTarget - this.human.x) > 8) this.human.targetX = mouseTarget;
    }
    this.human.targetX = clamp(this.human.targetX, 8, 800 - this.human.width - 8);
    this.human.x = moveToward(this.human.x, this.human.targetX, 720 * dt);
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
    this.specialClock += dt;
    for (const brick of this.bricks) {
      if (brick.type === "normal") brick.active = true;
      else brick.active = ((this.specialClock + brick.phaseOffset) % brick.period) < brick.period * 0.58;
    }
    for (const ball of this.balls) {
      if (ball.dead) continue;
      const previousY = ball.y;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx = Math.abs(ball.vx); }
      if (ball.x > 800 - ball.radius) { ball.x = 800 - ball.radius; ball.vx = -Math.abs(ball.vx); }
      if (ball.y < ball.radius) { ball.y = ball.radius; ball.vy = Math.abs(ball.vy); }
      const horizontal = ball.x + ball.radius > paddle.x && ball.x - ball.radius < paddle.x + paddle.width;
      if (horizontal && ball.vy > 0 && previousY <= paddle.y - ball.radius && ball.y + ball.radius >= paddle.y) this.bounceFromPaddle(ball, paddle);
      for (const brick of this.bricks) {
        if (!brick.hits || (brick.type !== "normal" && !brick.active) || !circleHitsRect(ball, brick)) continue;
        brick.hits = 0;
        this.hitBrick(ball, brick);
        break;
      }
      if (ball.y > 545) ball.dead = true;
    }
    this.balls = this.balls.filter((ball) => !ball.dead);
    if (!this.balls.length) this.lifeLost = true;
    if (this.bricks.every((brick) => !brick.hits)) this.won = true;
  }
  bounceFromPaddle(ball, paddle) {
    ball.vy *= -1.02;
    ball.vx += clamp((ball.x - (paddle.x + paddle.width / 2)) * 4, -200, 200);
    ball.y = paddle.y - ball.radius - 1;
    this.score += 1;
  }
  hitBrick(ball, brick) {
    ball.vy *= -1;
    this.score += brick.type === "normal" ? 10 : 25;
    if (brick.type === "extraLife") this.engine?.addLife?.();
    if (brick.type === "speed") for (const other of this.balls) { other.vx *= 1.12; other.vy *= 1.12; }
    if (brick.type === "double" && this.balls.length < 3) this.balls.push(this.newBall(ball.x, ball.y, -ball.vx * 0.82, ball.vy * 0.82));
    if (brick.type === "shortBar") this.activePaddle().width = Math.max(64, this.activePaddle().width - 24);
    if (brick.type === "longBar") this.activePaddle().width = Math.min(170, this.activePaddle().width + 32);
    if (brick.type === "hazard") this.lifeLost = true;
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    context.strokeStyle = "#64748b"; context.lineWidth = 3; context.strokeRect(2, 2, 796, 556);
    this.bricks.forEach((brick) => {
      if (!brick.hits) return;
      context.save();
      const active = brick.type === "normal" || brick.active;
      context.globalAlpha = active ? 1 : 0.45;
      context.fillStyle = active ? (this.dragIndex === this.bricks.indexOf(brick) ? "#fbbf24" : BRICK_COLORS[brick.type]) : "#38bdf8";
      context.fillRect(brick.x, brick.y, brick.width, brick.height);
      if (brick.type !== "normal" && active) drawText(context, BRICK_LABELS[brick.type], brick.x + brick.width / 2, brick.y + 13, 7, "#07111f", "center");
      context.restore();
    });
    const paddle = this.activePaddle();
    context.fillStyle = this.side === "bottom" ? "#fb7185" : "#fbbf24"; context.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    this.balls.forEach((ball) => { context.fillStyle = "#f8fafc"; context.beginPath(); context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2); context.fill(); });
    drawText(context, this.side === "bottom" ? "Move the mouse or use A/D to control the bottom paddle" : "Hold and drag any block · the red computer paddle returns the ball", 16, 28, 14, "#cbd5e1");
    drawText(context, "Green +1 life · Pink 2 balls · Yellow speed · Purple short bar · Orange long bar · Red danger", 16, 542, 12, "#cbd5e1");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: "Clear every brick to win. Special bricks change the round." }; }
}

function moveToward(current, target, maxDelta) {
  const distance = target - current;
  if (Math.abs(distance) <= maxDelta) return target;
  return current + Math.sign(distance) * maxDelta;
}

export { BRICK_LABELS };
