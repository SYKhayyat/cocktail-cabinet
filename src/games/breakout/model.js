import { clamp, circleHitsRect } from "../../engine.js";

export const BRICK_LABELS = { extraLife: "+1 LIFE", double: "2 BALLS", speed: "SPEED", shortBar: "SHORT", longBar: "LONG", hazard: "DANGER" };
const BRICK_TYPES = ["normal", "extraLife", "shortBar", "double", "speed", "longBar", "hazard"];
const COMPUTER_REACTION_MIN = 0.1;
const COMPUTER_REACTION_MAX = 0.18;
const COMPUTER_ERROR_CHANCE = 0.5;
const COMPUTER_ERROR_RANGE = 180;
const COMPUTER_MISTAKE_CHANCE = 0.3;
const COMPUTER_MISTAKE_DELAY_MIN = 0.3;
const COMPUTER_MISTAKE_DELAY_MAX = 0.5;
const COMPUTER_SPEED = 600;

export class BreakoutModel {
  constructor() {
    this.id = "breakout";
    this.title = "Breakout";
    this.description = "Normal play: move the bottom paddle and keep the ball alive. Setup play: drag the blocks while the computer controls the paddle. Versus play: two paddles and two balls fight over the central bricks.";
    this.side = "bottom";
    this.score = 0;
    this.layout = null;
  }
  sideLabel() { return this.side === "bottom" ? "You control the bottom paddle" : this.side === "versus" ? "Central brick duel" : "You move the blocks"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.scores = { human: 0, computer: 0 };
    const startingLives = this.engine?.maxLives ?? 3;
    this.playerLives = { human: startingLives, computer: startingLives };
    this.lastLifeLossOwner = null;
    this.winner = null;
    this.versusRoundOver = false;
    if (this.side === "versus") {
      this.human = { x: 350, targetX: 350, y: 520, width: 112, height: 16, speed: 460 };
      this.computer = { x: 350, targetX: 350, y: 40, width: 112, height: 16 };
      this.balls = [this.newBall(350, 450, 180, -200, "human"), this.newBall(450, 110, -180, 200, "computer")];
      this.createVersusLayout();
    } else {
      this.human = { x: 350, targetX: 350, y: 520, width: 112, height: 16, speed: 460 };
      this.computer = { x: 350, targetX: 350, y: 520, width: 112, height: 16 };
      this.balls = [this.newBall(400, 280, 180, 210)];
      if (this.layout) this.bricks = this.layout.map((brick) => ({ ...brick, hits: 1, active: true }));
      else this.createLayout();
    }
    this.computerReaction = 0.08;
    this.computerLastVy = 0;
    this.computerTargetError = 0;
    this.dragIndex = null;
    this.dragOffset = { x: 0, y: 0 };
    this.pressStart = { x: 0, y: 0 };
    this.dragMoved = false;
    this.specialClock = 0;
    this.paddleHits = 0;
    this.paddleMisses = 0;
    this.won = false;
  }
  resetAfterLife() {
    if (this.side === "versus") {
      this.human = { x: 350, targetX: 350, y: 520, width: 112, height: 16, speed: 460 };
      this.computer = { x: 350, targetX: 350, y: 40, width: 112, height: 16 };
      this.balls = [this.newBall(350, 450, 180, -200, "human"), this.newBall(450, 110, -180, 200, "computer")];
    } else {
      this.human = { x: 350, targetX: 350, y: 520, width: 112, height: 16, speed: 460 };
      this.computer = { x: 350, targetX: 350, y: 520, width: 112, height: 16 };
      this.balls = [this.newBall(400, 280, 180, 210)];
    }
    this.computerReaction = 0.08;
    this.computerLastVy = 0;
    this.computerTargetError = 0;
    this.dragIndex = null;
    this.won = false;
  }
  createLayout() {
    this.bricks = [];
    const special = { 3: "extraLife", 8: "shortBar", 17: "double", 22: "speed", 28: "longBar", 38: "hazard" };
    for (let row = 0; row < 5; row += 1) for (let column = 0; column < 10; column += 1) {
      const index = row * 10 + column;
      this.bricks.push({ x: 48 + column * 70, y: 90 + row * 25, width: 62, height: 18, hits: 1, type: special[index] || "normal", active: true, phaseOffset: special[index] ? (index * 0.73) % 2.4 : 0, period: special[index] ? 1.6 + (index % 4) * 0.65 : 0 });
    }
    this.saveLayout();
  }
  createVersusLayout() {
    this.bricks = [];
    const special = { 3: "extraLife", 7: "shortBar", 10: "double", 14: "speed", 18: "longBar" };
    for (let row = 0; row < 5; row += 1) for (let column = 0; column < 4; column += 1) {
      const index = row * 4 + column;
      this.bricks.push({ x: 302 + column * 50, y: 140 + row * 28, width: 44, height: 20, hits: 1, type: special[index] || "normal", active: true, phaseOffset: special[index] ? (index * 0.73) % 2.4 : 0, period: special[index] ? 1.6 + (index % 4) * 0.65 : 0, owner: null });
    }
  }
  newBall(x, y, vx, vy, owner = null) { return { x, y, vx, vy, radius: 8, owner, lastPaddle: owner, dead: false }; }
  activePaddle() { return this.side === "bottom" ? this.human : this.computer; }
  moveVersusPaddles(dt, input) {
    const keyDirection = input.keyDirection || 0;
    const pointerTarget = input.pointer.x - this.human.width / 2;
    this.human.targetX = input.mode === "keyboard" || keyDirection ? this.human.x + keyDirection * this.human.speed * dt : input.pointer.moved ? pointerTarget : this.human.x;
    this.human.targetX = clamp(this.human.targetX, 8, 792 - this.human.width);
    this.human.x = moveToward(this.human.x, this.human.targetX, 720 * dt);
    const computerBall = this.balls.find((ball) => ball.owner === "computer");
    if (computerBall) {
      this.computer.targetX = clamp(computerBall.x - this.computer.width / 2, 8, 792 - this.computer.width);
      this.computer.x = moveToward(this.computer.x, this.computer.targetX, 480 * dt);
    }
  }
  paddleForBall(ball) { return this.side === "versus" ? (ball.owner === "computer" ? this.computer : this.human) : this.activePaddle(); }
  moveHuman(dt, input) {
    if (this.side === "versus") {
      this.moveVersusPaddles(dt, input);
      return;
    }
    if (this.side === "blocks") {
      const leadBall = this.balls[0];
      this.computerReaction -= dt;
      if (leadBall) {
        const incoming = leadBall.vy > 0;
        if (incoming && this.computerLastVy <= 0) {
          const error = (Math.random() - 0.5) * COMPUTER_ERROR_RANGE;
          this.computerTargetError = Math.random() < COMPUTER_ERROR_CHANCE ? error : error * 0.25;
          if (Math.random() < COMPUTER_MISTAKE_CHANCE) this.computerReaction = COMPUTER_MISTAKE_DELAY_MIN + Math.random() * (COMPUTER_MISTAKE_DELAY_MAX - COMPUTER_MISTAKE_DELAY_MIN);
        }
        if (!incoming) this.computer.targetX = this.computer.x;
        else if (this.computerReaction <= 0) {
          const timeToPaddle = Math.max(0, (this.computer.y - leadBall.y) / leadBall.vy);
          this.computer.targetX = clamp(predictBallX(leadBall, timeToPaddle) - this.computer.width / 2 + this.computerTargetError, 8, 800 - this.computer.width - 8);
          this.computerReaction = COMPUTER_REACTION_MIN + Math.random() * (COMPUTER_REACTION_MAX - COMPUTER_REACTION_MIN);
        }
        this.computerLastVy = leadBall.vy;
      }
      this.computer.x = moveToward(this.computer.x, this.computer.targetX, COMPUTER_SPEED * dt);
      return;
    }
    const keyDirection = input.keyDirection || 0;
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
  saveLayout() { this.layout = this.bricks.map(({ x, y, width, height, type, phaseOffset, period }) => ({ x, y, width, height, type, phaseOffset, period })); }
  updateBlocks(input) {
    if (this.side !== "blocks" || !input.pointer) return;
    if (!input.pointer.down) {
      if (this.dragIndex !== null && this.dragIndex >= 0 && !this.dragMoved) this.cycleBrickType(this.bricks[this.dragIndex]);
      this.dragIndex = null;
      this.dragMoved = false;
      return;
    }
    if (input.pointer.clicked) {
      this.dragIndex = this.bricks.findIndex((brick) => input.pointer.x >= brick.x && input.pointer.x <= brick.x + brick.width && input.pointer.y >= brick.y && input.pointer.y <= brick.y + brick.height);
      const brick = this.bricks[this.dragIndex];
      this.dragOffset = brick ? { x: input.pointer.x - brick.x, y: input.pointer.y - brick.y } : { x: 0, y: 0 };
      this.pressStart = { x: input.pointer.x, y: input.pointer.y };
      this.dragMoved = false;
    }
    if (this.dragIndex !== null && this.dragIndex >= 0) {
      if (Math.hypot(input.pointer.x - this.pressStart.x, input.pointer.y - this.pressStart.y) > 6) this.dragMoved = true;
      if (this.dragMoved) {
        const brick = this.bricks[this.dragIndex];
        brick.x = clamp(input.pointer.x - this.dragOffset.x, 8, 800 - brick.width - 8);
        brick.y = clamp(input.pointer.y - this.dragOffset.y, 55, 400);
        this.saveLayout();
      }
    }
  }
  cycleBrickType(brick) {
    const current = BRICK_TYPES.indexOf(brick.type);
    const next = BRICK_TYPES[(current + 1) % BRICK_TYPES.length];
    brick.type = next;
    brick.active = true;
    brick.period = next === "normal" ? 0 : 1.6 + (BRICK_TYPES.indexOf(next) % 4) * 0.65;
    brick.phaseOffset = (BRICK_TYPES.indexOf(next) * 0.73) % 2.4;
    this.saveLayout();
  }
  update(dt, input) {
    this.updateBlocks(input);
    this.moveHuman(dt, input);
    this.specialClock += dt;
    for (const brick of this.bricks) {
      if (brick.type === "normal") brick.active = true;
      else brick.active = ((this.specialClock + brick.phaseOffset) % brick.period) < brick.period * 0.58;
    }
    for (const ball of this.balls) {
      if (ball.dead) continue;
      const paddle = this.paddleForBall(ball);
      const previousY = ball.y;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx = Math.abs(ball.vx); }
      if (ball.x > 800 - ball.radius) { ball.x = 800 - ball.radius; ball.vx = -Math.abs(ball.vx); }
      if (ball.y < ball.radius) { ball.y = ball.radius; ball.vy = Math.abs(ball.vy); }
      const horizontal = ball.x + ball.radius > paddle.x && ball.x - ball.radius < paddle.x + paddle.width;
      if (horizontal && ball.vy > 0 && ball.y + ball.radius >= paddle.y && previousY - ball.radius < paddle.y + paddle.height) this.bounceFromPaddle(ball, paddle);
      for (const brick of this.bricks) {
        if (!brick.hits || !circleHitsRect(ball, brick)) continue;
        brick.hits = 0;
        this.hitBrick(ball, brick);
        break;
      }
      if (ball.y > 545) {
        ball.dead = true;
        this.paddleMisses += 1;
        this.lastLifeLossOwner = this.side === "versus" ? (ball.owner || "human") : null;
      }
    }
    this.balls = this.balls.filter((ball) => !ball.dead);
    if (!this.balls.length) this.lifeLost = true;
    if (this.bricks.every((brick) => !brick.hits)) {
      if (this.side === "versus") this.finishVersus();
      else this.won = true;
    }
  }
  addScore(owner, amount) {
    if (this.side === "versus" && owner) {
      this.scores[owner] += amount;
      this.score = this.scores.human;
    } else this.score += amount;
  }
  bounceFromPaddle(ball, paddle) {
    this.paddleHits += 1;
    const owner = this.side === "versus" ? (paddle === this.human ? "human" : "computer") : null;
    if (owner) ball.lastPaddle = owner;
    ball.vy *= -1.02;
    ball.vx += clamp((ball.x - (paddle.x + paddle.width / 2)) * 4, -200, 200);
    ball.y = paddle.y < 300 ? paddle.y + paddle.height + ball.radius + 1 : paddle.y - ball.radius - 1;
    this.addScore(owner, 1);
  }
  hitBrick(ball, brick) {
    const specialActive = brick.type !== "normal" && brick.active;
    const owner = this.side === "versus" ? (ball.lastPaddle || ball.owner) : null;
    const ownerPaddle = this.side === "versus" ? (owner === "computer" ? this.computer : this.human) : this.activePaddle();
    if (owner) brick.owner = owner;
    ball.vy *= -1;
    this.addScore(owner, specialActive ? 25 : 10);
    if (!specialActive) return;
    if (brick.type === "extraLife" && owner !== "computer") this.engine?.addLife?.();
    if (brick.type === "speed") for (const other of this.balls) { other.vx *= 1.12; other.vy *= 1.12; }
    if (brick.type === "double" && this.balls.length < 4) this.balls.push(this.newBall(ball.x, ball.y, -ball.vx * 0.82, ball.vy * 0.82, owner));
    if (brick.type === "shortBar") ownerPaddle.width = Math.max(64, ownerPaddle.width - 24);
    if (brick.type === "longBar") ownerPaddle.width = Math.min(170, ownerPaddle.width + 32);
    if (brick.type === "hazard") {
      this.lastLifeLossOwner = owner || (this.side === "versus" ? ball.owner : null);
      this.lifeLost = true;
    }
  }
  finishVersus() {
    this.versusRoundOver = true;
    if (this.scores.human > this.scores.computer) {
      this.winner = "human";
      this.won = true;
    } else if (this.scores.computer > this.scores.human) {
      this.winner = "computer";
      this.gameOver = true;
    } else {
      this.winner = null;
      this.gameOver = true;
    }
  }
  handleLifeLoss() {
    if (this.versusRoundOver) return { gameOver: true, message: this.winner ? `${this.winner === "human" ? "You win" : "Computer wins"} the duel.` : "The duel ended in a tie." };
    if (this.side !== "versus") return null;
    const owner = this.lastLifeLossOwner || "human";
    this.playerLives[owner] = Math.max(0, this.playerLives[owner] - 1);
    this.lastLifeLossOwner = null;
    if (this.playerLives[owner] === 0) {
      this.gameOver = true;
      this.winner = owner === "human" ? "computer" : "human";
      return { gameOver: true, message: `${owner === "human" ? "You" : "Computer"} lost all lives — ${this.winner === "human" ? "you win" : "computer wins"}!` };
    }
    return { gameOver: false, message: `${owner === "human" ? "You" : "Computer"} lost a life.` };
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "versus" && this.winner ? `${this.winner === "human" ? "You win" : "Computer wins"} — highest score takes the duel.` : "Clear every brick to win. Special bricks change the round." }; }
}

function predictBallX(ball, seconds) {
  let x = ball.x;
  let velocity = ball.vx;
  let remaining = Math.max(0, seconds);
  while (remaining > 0) {
    const edge = velocity < 0 ? ball.radius : 800 - ball.radius;
    const distance = Math.abs((edge - x) / velocity);
    if (distance >= remaining) return x + velocity * remaining;
    x = edge;
    remaining -= distance;
    velocity *= -1;
  }
  return x;
}

function moveToward(current, target, maxDelta) {
  const distance = target - current;
  if (Math.abs(distance) <= maxDelta) return target;
  return current + Math.sign(distance) * maxDelta;
}
