import test from "node:test";
import assert from "node:assert/strict";
import { SnakeModel } from "../src/games/snake/model.js";
import { BreakoutModel } from "../src/games/breakout/model.js";
import { SplatModel } from "../src/games/splat/model.js";
import { AsteroidsModel } from "../src/games/asteroids/model.js";
import { MissileModel } from "../src/games/missile/model.js";
import { ImitationModel } from "../src/games/imitation/model.js";
import { StarfallModel } from "../src/games/starfall/model.js";
import { SnakeGame } from "../src/games/snake.js";
import { BreakoutGame } from "../src/games/breakout.js";
import { SplatGame } from "../src/games/splat.js";
import { AsteroidsGame } from "../src/games/asteroids.js";
import { MissileCommandGame } from "../src/games/missile.js";
import { ImitationGame } from "../src/games/imitation.js";
import { StarfallGame } from "../src/games/starfall.js";

const pointer = (values = {}) => ({ x: 0, y: 0, moved: false, clicked: false, down: false, ...values });
const input = (values = {}) => ({ keys: new Set(), pressed: new Set(), pointer: pointer(), ...values });

test("Snake: settings, movement, growth, and board collisions are deterministic", () => {
  const game = new SnakeModel();
  game.setSettings({ cols: 20, rows: 15, startingLength: 4, wrap: false });
  game.applyPendingSettings();
  game.reset();
  assert.equal(game.snake.length, 4);
  assert.equal(game.apple.x >= 0 && game.apple.x < 20, true);
  const start = game.snake[0];
  game.update(0.2, { direction: { x: -1, y: 0 }, steer: null, placeApple: null });
  assert.deepEqual(game.direction, { x: 1, y: 0 });
  assert.deepEqual(game.snake[0], { x: start.x + 1, y: start.y });
  const nextCell = { x: start.x + 2, y: start.y };
  game.apple = nextCell;
  game.update(0.2, { direction: null, steer: null, placeApple: null });
  assert.equal(game.snake.length, 5);
  assert.equal(game.score, 1);
  const wallGame = new SnakeModel();
  wallGame.setSettings({ cols: 5, rows: 5, startingLength: 3, wrap: false });
  wallGame.applyPendingSettings();
  wallGame.reset();
  wallGame.snake = [{ x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 }];
  wallGame.direction = { x: 1, y: 0 };
  wallGame.nextDirection = { x: 1, y: 0 };
  wallGame.update(0.2, { direction: null, steer: null, placeApple: null });
  assert.equal(wallGame.gameOver, true);
  assert.equal(wallGame.lossReason, "wall");
  const wrapped = new SnakeModel();
  wrapped.setSettings({ cols: 5, rows: 5, startingLength: 3, wrap: true });
  wrapped.applyPendingSettings();
  wrapped.reset();
  wrapped.snake = [{ x: 4, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 2 }];
  wrapped.direction = { x: 1, y: 0 };
  wrapped.nextDirection = { x: 1, y: 0 };
  wrapped.update(0.2, { direction: null, steer: null, placeApple: null });
  assert.equal(wrapped.gameOver, false);
  assert.deepEqual(wrapped.snake[0], { x: 0, y: 2 });
});

test("Breakout: paddle movement, brick effects, life loss, and win state work", () => {
  const game = new BreakoutModel();
  game.reset();
  game.human.x = 796 - game.human.width;
  game.update(0.016, { mode: "keyboard", keyDirection: 1, pointer: pointer() });
  assert.ok(game.human.x <= 800 - game.human.width - 8);
  const extraLifeBrick = game.bricks.find((brick) => brick.type === "extraLife");
  extraLifeBrick.phaseOffset = 0;
  extraLifeBrick.period = 1.6;
  extraLifeBrick.active = true;
  const ball = game.balls[0];
  ball.x = extraLifeBrick.x + extraLifeBrick.width / 2;
  ball.y = extraLifeBrick.y;
  ball.vx = 0;
  ball.vy = 1;
  const scoreBefore = game.score;
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(extraLifeBrick.hits, 0);
  assert.equal(game.score, scoreBefore + 25);
  const doubleBrick = game.bricks.find((brick) => brick.type === "double");
  doubleBrick.phaseOffset = 0;
  doubleBrick.period = 1.6;
  doubleBrick.active = true;
  const doubleBall = game.balls[0];
  doubleBall.x = doubleBrick.x + doubleBrick.width / 2;
  doubleBall.y = doubleBrick.y + 8;
  doubleBall.vx = 0;
  doubleBall.vy = 1;
  const ballCount = game.balls.length;
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.balls.length, ballCount + 1);
  for (const brick of game.bricks) brick.hits = 0;
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.won, true);
});

test("Breakout computer computes a centered target from the predicted ball", () => {
  const game = new BreakoutModel();
  game.setSide("blocks");
  game.reset();
  game.computerReaction = 0;
  game.computerLastVy = -1;
  game.computerTargetError = 0;
  game.balls[0] = game.newBall(400, 200, 0, 300);
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    game.update(1 / 60, { mode: "mouse", keyDirection: 0, pointer: pointer() });
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(game.computer.targetX, 400 - game.computer.width / 2);
});

test("Breakout inactive special bricks behave like normal bricks", () => {
  const game = new BreakoutModel();
  game.reset();
  const hazard = game.bricks.find((brick) => brick.type === "hazard");
  hazard.period = 1.6;
  hazard.phaseOffset = 1.5;
  game.specialClock = 0;
  const ball = game.balls[0];
  ball.x = hazard.x + hazard.width / 2;
  ball.y = hazard.y + 8;
  ball.vx = 0;
  ball.vy = 1;
  const scoreBefore = game.score;
  game.update(0.016, { mode: "mouse", keyDirection: 0, pointer: pointer() });
  assert.equal(hazard.hits, 0);
  assert.equal(game.score, scoreBefore + 10);
  assert.equal(game.lifeLost, undefined);
});

test("Breakout computer can make an off-center correction", () => {
  const game = new BreakoutModel();
  game.setSide("blocks");
  game.reset();
  game.computerReaction = 0;
  game.computerLastVy = -1;
  game.computerTargetError = 0;
  game.balls[0] = game.newBall(400, 200, 0, 300);
  const originalRandom = Math.random;
  Math.random = () => 0.4;
  try {
    game.update(1 / 60, { mode: "mouse", keyDirection: 0, pointer: pointer() });
  } finally {
    Math.random = originalRandom;
  }
  assert.ok(game.computer.targetX < 400 - game.computer.width / 2);
});

test("Breakout counts each ball that crosses the paddle plane as a miss", () => {
  const game = new BreakoutModel();
  game.reset();
  game.balls[0].y = 544;
  game.balls[0].vy = 100;
  game.update(0.02, { mode: "mouse", keyDirection: 0, pointer: pointer() });
  assert.equal(game.paddleMisses, 1);
});

test("Breakout versus mode gives each side a paddle, ball, and central bricks", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  assert.equal(game.balls.length, 2);
  assert.deepEqual(game.balls.map((ball) => ball.owner), ["human", "computer"]);
  assert.equal(game.human.y, 520);
  assert.equal(game.computer.y, 40);
  assert.ok(game.bricks.every((brick) => brick.x > 250 && brick.x < 550));
});

test("Breakout versus awards a brick to the paddle that last hit its ball", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const ball = game.balls[0];
  const brick = game.bricks[0];
  ball.x = brick.x + brick.width / 2;
  ball.y = brick.y + 10;
  ball.vx = 0;
  ball.vy = 1;
  ball.lastPaddle = "human";
  game.balls = [ball];
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(brick.hits, 0);
  assert.equal(brick.owner, "human");
  assert.equal(game.scores.human, 10);
});

test("Breakout versus ends with the highest score when the bricks are cleared", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  game.scores.human = 20;
  game.scores.computer = 10;
  for (const brick of game.bricks) brick.hits = 0;
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.won, true);
  assert.equal(game.winner, "human");
  const computerWin = new BreakoutModel();
  computerWin.setSide("versus");
  computerWin.reset();
  computerWin.scores.human = 10;
  computerWin.scores.computer = 20;
  for (const brick of computerWin.bricks) brick.hits = 0;
  computerWin.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(computerWin.gameOver, true);
  assert.equal(computerWin.winner, "computer");
});

test("Breakout versus charges a miss to the ball owner and ends at zero lives", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  game.lastLifeLossOwner = "human";
  assert.equal(game.handleLifeLoss().gameOver, false);
  assert.equal(game.playerLives.human, 2);
  game.lastLifeLossOwner = "human";
  game.handleLifeLoss();
  game.lastLifeLossOwner = "human";
  const result = game.handleLifeLoss();
  assert.equal(result.gameOver, true);
  assert.equal(game.winner, "computer");
});

test("Splat: automatic rightward motion, gaps, scoring, and collisions", () => {
  const game = new SplatModel();
  game.reset();
  assert.equal(game.columns.length, 30);
  assert.equal(game.nextColumn, game.columns[0]);
  const startX = game.player.x;
  game.update(0.1, { thrust: 0, placeColumnX: undefined });
  assert.ok(game.player.x > startX);
  const column = game.columns[0];
  game.player.x = column.x + column.width - 2;
  game.player.y = column.gapY + column.gapHeight / 2;
  game.player.vy = 0;
  game.update(0.016, { thrust: 0, placeColumnX: undefined });
  assert.equal(column.passed, true);
  assert.equal(game.score, 1);
  const collision = new SplatModel();
  collision.reset();
  const blockedColumn = collision.columns[0];
  collision.player.x = blockedColumn.x + blockedColumn.width - 2;
  collision.player.y = blockedColumn.gapY - 40;
  collision.player.vy = 0;
  collision.update(0.016, { thrust: 0, placeColumnX: undefined });
  assert.equal(collision.lifeLost, true);
});

test("Splat click and key input apply up/down thrust", () => {
  const game = new SplatGame();
  game.reset();
  const startVy = game.model.player.vy;
  game.update(0.1, input({ pressed: new Set(["ArrowUp"]) }));
  assert.ok(game.model.player.vy < startVy);
  const middleVy = game.model.player.vy;
  game.update(0.1, input({ pressed: new Set(["ArrowDown"]) }));
  assert.ok(game.model.player.vy > middleVy);
});

test("Splat computer can steer through a generated route", () => {
  const game = new SplatModel();
  game.setSide("layout");
  game.reset();
  for (let step = 0; step < 1200 && !game.lifeLost && !game.won; step += 1) game.update(1 / 60, { placeColumnX: undefined });
  assert.ok(game.score > 0 || game.lifeLost);
});

test("Asteroids: ship movement, firing, spawning, destruction, and ship loss", () => {
  const game = new AsteroidsModel();
  game.reset();
  const startX = game.ship.x;
  game.update(0.2, { turn: 0, thrust: 1, pointer: null, fire: false, spawnAsteroid: null });
  assert.ok(game.ship.x !== startX || game.ship.y !== 280);
  game.invulnerable = 1;
  const bulletCountBefore = game.bullets.length;
  game.update(0.1, { turn: 0, thrust: 0, pointer: null, fire: true, spawnAsteroid: null });
  assert.equal(game.bullets.length, bulletCountBefore + 1);
  game.asteroids = [{ x: 400, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [], tone: 0 }];
  game.ship.x = 400;
  game.ship.y = 280;
  game.ship.angle = 0;
  game.shotClock = 0;
  game.bullets = [];
  game.fire();
  game.bullets[0].x = 400;
  game.bullets[0].y = 280;
  game.update(0, { turn: 0, thrust: 0, pointer: null, fire: false, spawnAsteroid: null });
  assert.equal(game.score, 10);
  assert.equal(game.asteroids.length, 1);
  const danger = new AsteroidsModel();
  danger.setSide("rocks");
  danger.reset();
  danger.asteroids = [{ x: 400, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [], tone: 0 }];
  danger.ship.x = 400;
  danger.ship.y = 280;
  danger.shotClock = 1;
  danger.invulnerable = 0;
  danger.update(0, { attack: null, fire: false, spawnAsteroid: null });
  assert.equal(danger.lifeLost, true);
});

test("Missile Command: aiming, launching, interception, targeting, and base loss", () => {
  const game = new MissileModel();
  game.reset();
  game.target = { x: 200, y: 100 };
  game.interceptorClock = 0;
  game.update(0, { aim: pointer({ x: 250, y: 200 }), launch: true });
  assert.deepEqual(game.target, { x: 250, y: 200 });
  assert.equal(game.interceptors.length, 1);
  assert.equal(game.interceptors[0].targetX, 250);
  const interceptor = game.interceptors[0];
  const enemy = { x: 250, y: 200, targetX: 250, targetY: 510, speed: 90, color: "#fb7185", targetBase: game.bases[0], dead: false };
  game.enemyMissiles = [enemy];
  interceptor.x = 250;
  interceptor.y = 200;
  game.update(0, { aim: null, launch: false });
  assert.equal(game.score, 15);
  assert.equal(game.enemyMissiles.length, 0);
  const loss = new MissileModel();
  loss.reset();
  const targetBase = loss.bases[0];
  loss.enemyMissiles = [{ x: targetBase.x, y: targetBase.y - 5, targetX: targetBase.x, targetY: targetBase.y, speed: 90, color: "#fb7185", targetBase, dead: false }];
  loss.update(0, { aim: null, launch: false });
  assert.equal(targetBase.alive, false);
  const dead = new MissileModel();
  dead.reset();
  dead.bases[0].alive = false;
  dead.bases[1].alive = false;
  dead.bases[2].alive = false;
  dead.update(0, { aim: null, launch: false });
  assert.equal(dead.lifeLost, true);
});

test("Imitation: messages, peer handshake, score, trimming, and search countdown", () => {
  const game = new ImitationModel();
  game.setSide("human");
  game.reset();
  assert.equal(game.phase, "searching");
  assert.equal(game.chatLog[0].sender, "System");
  game.update(1);
  assert.equal(game.matchmaking, 1.5);
  game.receive({ type: "hello", from: "peer" });
  assert.equal(game.peerId, "peer");
  assert.equal(game.phase, "searching");
  game.sendMessage("  hello  ");
  assert.equal(game.chatLog.at(-1).text, "hello");
  game.receive({ type: "chat", from: "peer", text: "hi" });
  assert.equal(game.chatLog.at(-1).text, "hi");
  assert.equal(game.score, 5);
  assert.equal(game.sendMessage("   "), null);
  game.receive({ type: "chat", from: "peer", text: "x".repeat(300) });
  assert.ok(game.chatLog.length <= 18);
});

test("Starfall: movement, gem collection, star spawning, and collision loss", () => {
  const game = new StarfallModel();
  game.reset();
  const startX = game.runner.x;
  game.update(0.2, { keyDirection: 1, pointerX: 0, spawnStar: undefined });
  assert.ok(game.runner.x > startX);
  game.gems = [{ x: game.runner.x, y: game.runner.y, collected: false }];
  game.update(0.016, { keyDirection: 0, pointerX: 0, spawnStar: undefined });
  assert.equal(game.score, 50);
  assert.equal(game.gems[0].collected, true);
  game.stars = [{ x: game.runner.x, y: game.runner.y, vy: 100, radius: 10 }];
  game.update(0.016, { keyDirection: 0, pointerX: 0, spawnStar: undefined });
  assert.equal(game.lifeLost, true);
  const computer = new StarfallModel();
  computer.setSide("stars");
  computer.reset();
  computer.update(0.016, { keyDirection: 0, pointerX: 0, spawnStar: { x: 100, y: 0 } });
  assert.equal(computer.stars.length, 1);
  assert.equal(computer.stars[0].x, 100);
  for (let index = 0; index < 1000; index += 1) computer.update(0.016, { keyDirection: 0, pointerX: 0, spawnStar: undefined });
  assert.ok(computer.runner.x >= 20 && computer.runner.x <= 780);
});

test("all game facades reset, update, and expose public state", () => {
  const games = [new SnakeGame(), new BreakoutGame(), new SplatGame(), new AsteroidsGame(), new MissileCommandGame(), new ImitationGame(), new StarfallGame()];
  for (const game of games) {
    game.reset();
    game.update(0.016, input());
    const state = game.publicState();
    assert.equal(typeof state.title, "string");
    assert.equal(typeof state.description, "string");
    assert.equal(typeof state.side, "string");
    assert.equal(typeof state.status, "string");
  }
});
