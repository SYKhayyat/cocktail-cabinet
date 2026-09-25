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
import { ImitationController, CHANNEL_NAME } from "../src/games/imitation/controller.js";
import { StarfallGame } from "../src/games/starfall.js";
import { StarfallController } from "../src/games/starfall/controller.js";

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
  assert.equal(game.lifeLost, false);
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
  assert.equal(game.human.y, 500);
  assert.equal(game.computer.y, 100);
  assert.equal(game.bricks.length, 25);
  assert.ok(game.bricks.every((brick) => brick.x >= 250 && brick.x <= 550 && brick.width === 54));
  assert.equal(game.bricks[0].y, 252);
  assert.equal(game.bricks.at(-1).y, 364);
});

test("Breakout versus mirrors top-paddle collision for a rising computer ball", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const ball = game.balls.find((candidate) => candidate.owner === "computer");
  ball.x = game.computer.x + game.computer.width / 2;
  ball.y = 112;
  ball.vx = 0;
  ball.vy = -200;
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.ok(ball.vy > 0);
  assert.equal(ball.y, 125);
});

test("Breakout versus computer targets the most urgent rising ball", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const humanBall = game.balls.find((ball) => ball.owner === "human");
  const computerBall = game.balls.find((ball) => ball.owner === "computer");
  humanBall.x = 600;
  humanBall.y = 180;
  humanBall.vx = 0;
  humanBall.vy = -200;
  computerBall.x = 200;
  computerBall.y = 450;
  computerBall.vx = 0;
  computerBall.vy = 200;
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.computer.targetX, 600 - game.computer.width / 2);
});

test("Breakout versus lets either ball collide with either paddle", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const humanBall = game.balls.find((ball) => ball.owner === "human");
  humanBall.x = game.computer.x + game.computer.width / 2;
  humanBall.y = 112;
  humanBall.vx = 0;
  humanBall.vy = -200;
  game.balls = [humanBall];
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(humanBall.lastPaddle, "computer");
  assert.ok(humanBall.vy > 0);

  const computerBall = new BreakoutModel().newBall(350, 492, 0, 200, "computer");
  game.reset();
  game.balls = [computerBall];
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(computerBall.lastPaddle, "human");
  assert.ok(computerBall.vy < 0);
});

test("Breakout versus charges a top exit to the ball owner", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const ball = game.balls.find((candidate) => candidate.owner === "computer");
  const humanBall = game.balls.find((candidate) => candidate.owner === "human");
  ball.y = -9;
  ball.vy = -200;
  game.update(0.02, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.lifeLost, true);
  assert.equal(game.handleLifeLoss().gameOver, false);
  assert.equal(game.playerLives.computer, 2);
  game.resetAfterLife();
  assert.ok(game.balls.includes(humanBall));
  const replacement = game.balls.find((candidate) => candidate.owner === "computer");
  assert.ok(replacement);
  assert.equal(replacement.y, 160);
});

test("Breakout versus restores two balls after simultaneous exits", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  for (const ball of game.balls) {
    ball.x = 400;
    ball.y = 545;
    ball.vx = 0;
    ball.vy = 300;
  }
  game.update(0.02, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.balls.length, 0);
  assert.equal(game.handleLifeLoss().gameOver, false);
  game.resetAfterLife();
  assert.equal(game.balls.length, 2);
  assert.deepEqual(new Set(game.balls.map((ball) => ball.owner)), new Set(["human", "computer"]));
  assert.equal(game.pendingLifeLossOwners.length, 0);
});

test("Breakout versus extra life updates the scoring player", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const brick = game.bricks.find((candidate) => candidate.type === "extraLife");
  brick.phaseOffset = 0;
  brick.period = 1.6;
  brick.active = true;
  const ball = game.balls.find((candidate) => candidate.owner === "human");
  ball.x = brick.x + brick.width / 2;
  ball.y = brick.y + 10;
  ball.vx = 0;
  ball.vy = 1;
  game.balls = [ball];
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.playerLives.human, 4);
  assert.equal(game.playerLives.computer, 3);
});

test("Breakout versus respawn preserves power-up balls", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const fallen = game.balls.find((ball) => ball.owner === "human");
  const computerBall = game.balls.find((ball) => ball.owner === "computer");
  const humanExtra = game.newBall(300, 450, 0, 0, "human");
  const computerExtra = game.newBall(500, 160, 0, 0, "computer");
  game.balls.push(humanExtra, computerExtra);
  fallen.x = 400;
  fallen.y = 545;
  fallen.vx = 0;
  fallen.vy = 300;
  game.update(0.02, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  game.handleLifeLoss();
  game.resetAfterLife();
  assert.equal(game.balls.length, 4);
  assert.ok(game.balls.includes(computerBall));
  assert.ok(game.balls.includes(humanExtra));
  assert.ok(game.balls.includes(computerExtra));
});

test("Breakout versus reports a tied score as a tie", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  game.scores = { human: 10, computer: 10 };
  for (const brick of game.bricks) brick.hits = 0;
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.gameOver, true);
  assert.equal(game.winner, null);
  assert.match(game.publicState().status, /tie/i);
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

test("Breakout versus replaces only the fallen owner's ball", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const humanBall = game.balls.find((ball) => ball.owner === "human");
  const computerBall = game.balls.find((ball) => ball.owner === "computer");
  humanBall.y = 545;
  humanBall.vy = 300;
  game.update(0.02, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.lifeLost, true);
  assert.equal(game.handleLifeLoss().gameOver, false);
  game.resetAfterLife();
  assert.equal(game.balls.length, 2);
  assert.ok(game.balls.includes(computerBall));
  assert.ok(game.balls.some((ball) => ball.owner === "human"));
});

test("Splat defaults to the human-controlled run", () => {
  const game = new SplatGame();
  game.reset();
  assert.equal(game.side, "climber");
  assert.equal(game.model.computerPlayer, null);
  const startX = game.model.player.x;
  game.update(0.1, input());
  assert.ok(game.model.player.x > startX);
  const columnCount = game.model.columns.length;
  game.handleReadyInput({ pointer: pointer({ x: 500, y: 200, released: true, dragDistance: 0 }) });
  assert.equal(game.model.columns.length, columnCount);
});

test("Splat: automatic rightward motion, gaps, scoring, and collisions", () => {
  const game = new SplatModel();
  game.reset();
  assert.equal(game.columns.length, 50);
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
  assert.equal(game.furthestColumns, 1);
  const collision = new SplatModel();
  collision.reset();
  const blockedColumn = collision.columns[0];
  collision.player.x = blockedColumn.x + blockedColumn.width - 2;
  collision.player.y = blockedColumn.gapY - 40;
  collision.player.vy = 0;
  collision.update(0.016, { thrust: 0, placeColumnX: undefined });
  assert.equal(collision.lifeLost, true);
});

test("Splat settings apply configurable column spacing", () => {
  const game = new SplatGame();
  game.setSettings({ columnSpacing: 200 });
  game.applyPendingSettings();
  game.reset();
  assert.equal(game.model.columns[1].x - game.model.columns[0].x, 200);
  assert.equal(game.model.columnSpacing, 200);
});

test("Splat keeps furthest columns through life loss and clears them on new game", () => {
  const game = new SplatModel();
  game.reset();
  const column = game.columns[0];
  game.player.x = column.x + column.width - 2;
  game.player.y = column.gapY + column.gapHeight / 2;
  game.player.vy = 0;
  game.update(0.016, { thrust: 0, placeColumnX: undefined });
  const furthest = game.furthestColumns;
  assert.equal(furthest, 1);
  game.reset(true);
  assert.equal(game.furthestColumns, furthest);
  game.reset();
  assert.equal(game.furthestColumns, 0);
});

test("Splat held up input reverses downward motion and click-up adds a bounce", () => {
  const game = new SplatGame();
  game.reset();
  game.model.player.vy = 260;
  game.update(0.016, input({ keys: new Set(["ArrowUp"]) }));
  assert.ok(game.model.player.vy < 0);
  game.model.player.vy = -260;
  game.update(0.1, input({ keys: new Set(["ArrowUp"]) }));
  assert.equal(game.model.player.vy, -260);
  game.model.player.vy = -300;
  const beforeBounceY = game.model.player.y;
  game.update(0.016, input({ pointer: pointer({ clicked: true, y: 100 }) }));
  assert.equal(game.model.player.vy, 0);
  assert.ok(game.model.player.y < beforeBounceY);
  const afterBounceY = game.model.player.y;
  game.update(0.016, input());
  assert.ok(game.model.player.y > afterBounceY);
  game.model.player.vy = -260;
  game.update(0.016, input({ keys: new Set(["ArrowDown"]) }));
  assert.ok(game.model.player.vy > 0);
});

test("Splat quick key tap bounces without continued rise", () => {
  const game = new SplatGame();
  game.reset();
  const beforeTapY = game.model.player.y;
  game.update(0.016, input({ keys: new Set(["ArrowUp"]), pressed: new Set(["ArrowUp"]) }));
  assert.equal(game.model.player.vy, 0);
  assert.ok(game.model.player.y < beforeTapY);
  const afterTapY = game.model.player.y;
  game.update(0.016, input());
  assert.ok(game.model.player.y > afterTapY);
});

test("Splat releasing held drift stops the upward velocity", () => {
  const game = new SplatGame();
  game.reset();
  game.update(0.016, input({ keys: new Set(["ArrowUp"]) }));
  assert.equal(game.model.player.vy, -260);
  const heldY = game.model.player.y;
  game.update(0.016, input());
  assert.equal(game.model.player.vy, 0);
  assert.equal(game.model.player.y, heldY);
  game.update(0.016, input());
  assert.ok(game.model.player.y > heldY);
});

test("Splat builder accepts tools before the game starts", () => {
  const game = new SplatGame();
  game.setSide("builder");
  game.reset();
  const initialCount = game.model.columns.length;
  game.handleReadyInput({ pointer: pointer({ x: 500, y: 200, released: true, dragDistance: 0 }) });
  assert.equal(game.model.columns.length, initialCount + 1);
});

test("Splat builder adds columns, draws gaps, and drags columns", () => {
  const game = new SplatModel();
  game.setSide("builder");
  game.reset();
  const initialCount = game.columns.length;
  game.update(1 / 60, { pointer: pointer({ x: 500, y: 200, released: true, dragDistance: 0 }) });
  assert.equal(game.columns.length, initialCount + 1);
  const added = game.columns.find((column) => column.x === 500);
  game.setTool("gap");
  game.update(1 / 60, { pointer: pointer({ x: added.x, y: 260, down: true, dragStartX: added.x, dragStartY: 200 }) });
  game.update(1 / 60, { pointer: pointer({ x: added.x, y: 350, released: true, dragStartX: added.x, dragStartY: 200 }) });
  assert.equal(added.gapY, 200);
  assert.equal(added.gapHeight, 150);
  game.setTool("column");
  const oldX = added.x;
  game.update(1 / 60, { pointer: pointer({ x: oldX + 40, y: 100, down: true, dragStartX: oldX, dragStartY: 100, dragDistance: 40 }) });
  game.update(1 / 60, { pointer: pointer({ x: oldX + 40, y: 100, released: true, dragStartX: oldX, dragStartY: 100, dragDistance: 40 }) });
  assert.equal(added.x, oldX + 40);
  game.player.x = 900;
  game.update(1 / 60, {});
  assert.equal(game.cameraX, game.player.x - 110);
});

test("Splat New Game preserves authored columns and gaps", () => {
  const game = new SplatGame();
  game.setSide("builder");
  game.reset();
  const initialCount = game.model.columns.length;
  game.handlePausedInput({ pointer: pointer({ x: 500, y: 200, released: true, dragDistance: 0 }) });
  game.setTool("gap");
  game.handlePausedInput({ pointer: pointer({ x: 500, y: 260, down: true, dragStartX: 500, dragStartY: 200 }) });
  game.handlePausedInput({ pointer: pointer({ x: 500, y: 350, released: true, dragStartX: 500, dragStartY: 200 }) });
  game.reset(false, true);
  assert.equal(game.model.columns.length, initialCount + 1);
  const preserved = game.model.columns.find((column) => column.x === 500);
  assert.equal(preserved.gapY, 200);
  assert.equal(preserved.gapHeight, 150);
});

test("Splat non-race life loss respawns without deleting authored columns", () => {
  const game = new SplatModel();
  game.setSide("builder");
  game.reset();
  const columnCount = game.columns.length;
  game.player.x = 400;
  game.player.columnsPassed = 3;
  game.lostPlayers.push(game.player);
  const result = game.handleLifeLoss();
  assert.equal(result.gameOver, false);
  game.resetAfterLife();
  assert.equal(game.player.x, 70);
  assert.equal(game.player.columnsPassed, 0);
  assert.equal(game.columns.length, columnCount);
});

test("Splat gap edits stay inside the board", () => {
  const game = new SplatModel();
  game.setSide("builder");
  game.reset();
  game.setTool("gap");
  const column = game.columns[0];
  game.updateBuilderInput({ pointer: pointer({ x: column.x, y: 500, down: true, dragStartX: column.x, dragStartY: 500 }) });
  game.updateBuilderInput({ pointer: pointer({ x: column.x, y: 400, released: true, dragStartX: column.x, dragStartY: 500 }) });
  assert.ok(column.gapY + column.gapHeight <= 560);
});

test("Splat builder tools work while paused", () => {
  const game = new SplatGame();
  game.setSide("builder");
  game.reset();
  const initialCount = game.model.columns.length;
  game.handlePausedInput({ pointer: pointer({ x: 500, y: 200, released: true, dragDistance: 0 }) });
  assert.equal(game.model.columns.length, initialCount + 1);
  const added = game.model.columns.find((column) => column.x === 500);
  game.setTool("gap");
  game.handlePausedInput({ pointer: pointer({ x: 500, y: 260, down: true, dragStartX: 500, dragStartY: 200 }) });
  game.handlePausedInput({ pointer: pointer({ x: 500, y: 350, released: true, dragStartX: 500, dragStartY: 200 }) });
  assert.equal(added.gapY, 200);
  assert.equal(added.gapHeight, 150);
});

test("Splat race creates one human and one computer ball", () => {
  const game = new SplatModel();
  game.setSide("race");
  game.reset();
  assert.ok(game.player);
  assert.ok(game.computerPlayer);
  assert.equal(game.player.columnsPassed, 0);
  assert.equal(game.computerPlayer.columnsPassed, 0);
});

test("Splat race returns only the dead ball to the beginning", () => {
  const game = new SplatModel();
  game.setSide("race");
  game.reset();
  const human = game.player;
  const computer = game.computerPlayer;
  human.x = 900;
  human.columnsPassed = 7;
  computer.x = 300;
  computer.columnsPassed = 3;
  game.lostPlayers.push(human);
  const result = game.handleLifeLoss();
  assert.equal(result.gameOver, false);
  game.resetAfterLife();
  assert.equal(human.x, 70);
  assert.equal(human.columnsPassed, 0);
  assert.equal(computer.x, 300);
  assert.equal(computer.columnsPassed, 3);
  assert.equal(game.raceLives.human, 2);
  assert.equal(game.raceLives.computer, 3);
});

test("Splat race computer has reaction and targeting error", () => {
  const game = new SplatModel();
  game.setSide("race");
  game.reset();
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    game.moveComputer(game.computerPlayer, 1 / 60);
  } finally {
    Math.random = originalRandom;
  }
  assert.ok(game.computerPlayer.aiReaction > 0);
  assert.notEqual(game.computerPlayer.aiError, 0);
});

test("Splat builder computer has reaction and targeting error", () => {
  const game = new SplatModel();
  game.setSide("builder");
  game.reset();
  game.moveComputer(game.player, 1 / 60);
  assert.ok(game.player.aiReaction > 0);
  assert.notEqual(game.player.aiError, 0);
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
  assert.equal(game.asteroids.length, 2);
  assert.ok(game.asteroids.every((asteroid) => asteroid.generation === 1));
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

test("Asteroids spawn pressure toward the ship", () => {
  const game = new AsteroidsModel();
  game.reset();
  assert.ok(game.asteroids.every((asteroid) => asteroid.vx * (game.ship.x - asteroid.x) + asteroid.vy * (game.ship.y - asteroid.y) > 0));
});

test("Asteroids fracture only once and shots increase asteroid speed", () => {
  const game = new AsteroidsModel();
  game.reset();
  const asteroid = game.asteroids[0];
  game.asteroids = [asteroid];
  game.ship.angle = 0;
  game.fire();
  game.bullets[0].x = asteroid.x;
  game.bullets[0].y = asteroid.y;
  game.update(0, { fire: false, spawnAsteroid: null });
  assert.equal(game.asteroids.length, 2);
  const piece = game.asteroids[0];
  game.bullets = [{ x: piece.x, y: piece.y, vx: 0, vy: 0, life: 1 }];
  game.update(0, { fire: false, spawnAsteroid: null });
  assert.equal(game.asteroids.length, 1);
  const speedBefore = game.asteroidSpeed;
  game.fire();
  assert.ok(game.asteroidSpeed > speedBefore);
});

test("Asteroids mouse movement swivels and click or hold fires", () => {
  const game = new AsteroidsGame();
  game.reset();
  const startAngle = game.model.ship.angle;
  const startX = game.model.ship.x;
  const startY = game.model.ship.y;
  game.update(0.016, input({ pointer: pointer({ x: 700, y: 100, moved: true, clicked: true }) }));
  assert.notEqual(game.model.ship.angle, startAngle);
  assert.equal(game.model.ship.x, startX);
  assert.equal(game.model.ship.y, startY);
  assert.equal(game.model.bullets.length, 1);
  const bullet = game.model.bullets[0];
  assert.ok(Math.abs(bullet.x - bullet.vx * 0.016 - (game.model.ship.x + Math.cos(game.model.ship.angle) * game.model.ship.radius)) < 0.0001);
  assert.ok(Math.abs(bullet.y - bullet.vy * 0.016 - (game.model.ship.y + Math.sin(game.model.ship.angle) * game.model.ship.radius)) < 0.0001);
  const holdX = game.model.ship.x;
  game.model.shotClock = 0;
  game.update(0.016, input({ pointer: pointer({ x: 700, y: 100, down: true }) }));
  assert.equal(game.model.bullets.length, 2);
  assert.notEqual(game.model.ship.x, holdX);
  const thrustX = game.model.ship.x;
  game.update(0.016, input({ keys: new Set(["ArrowUp"]), pointer: pointer({ x: 700, y: 100, moved: true }) }));
  assert.notEqual(game.model.ship.x, thrustX);
});

test("Asteroids non-versus modes do not expose computer score or lives", () => {
  const game = new AsteroidsGame();
  game.reset();
  assert.equal(game.playerLives, null);
});

test("Asteroids rocks mode starts with only user-supplied rocks", () => {
  const game = new AsteroidsModel();
  game.setSide("rocks");
  game.reset();
  assert.equal(game.asteroids.length, 0);
});

test("Asteroids controller does not turn drag starts into normal rocks", () => {
  const game = new AsteroidsGame();
  game.setSide("rocks");
  game.reset();
  game.update(1 / 60, input({ pointer: pointer({ x: 100, y: 100, down: true, clicked: true, dragDistance: 20, dragDeltaX: 20, dragDeltaY: 0 }) }));
  assert.equal(game.model.asteroids.length, 1);
  game.update(1 / 60, input({ pointer: pointer({ x: 120, y: 100, released: true, dragDistance: 20, dragDeltaX: 20, dragDeltaY: 0 }) }));
  assert.equal(game.model.asteroids.length, 1);
});

test("Asteroids computer waits and holds position without rocks", () => {
  const game = new AsteroidsModel();
  game.setSide("rocks");
  game.reset();
  game.computerShotClock = 0;
  const startX = game.ship.x;
  const startY = game.ship.y;
  game.update(1, { fire: false, spawnAsteroid: null });
  assert.equal(game.bullets.length, 0);
  assert.equal(game.ship.x, startX);
  assert.equal(game.ship.y, startY);
  assert.equal(game.ship.aiTarget, null);
});

test("Asteroids drag trajectory persists and click placement is randomized", () => {
  const game = new AsteroidsModel();
  game.setSide("rocks");
  game.reset();
  game.asteroids = [];
  game.computerShotClock = 99;
  game.update(1 / 60, { pointer: { x: 100, y: 100, down: true, released: false, dragDistance: 20, dragDeltaX: 10, dragDeltaY: 20 } });
  assert.equal(game.asteroids.length, 1);
  game.update(1 / 60, { pointer: { x: 120, y: 120, down: false, released: true, dragDistance: 20, dragDeltaX: 0, dragDeltaY: 0 } });
  assert.equal(game.asteroids.length, 1);
  assert.ok(game.asteroids[0].vx > 0);
  assert.ok(game.asteroids[0].vy > 0);
});

test("Asteroids versus gives both pilots scores and lives", () => {
  const game = new AsteroidsModel();
  game.setSide("versus");
  game.reset();
  game.computerShotClock = 0;
  game.update(0, { pointer: null, fire: false });
  assert.ok(game.computerShotClock >= 1.1);
  const computerBullet = game.bullets[0];
  assert.equal(computerBullet.x, game.computerShip.x + Math.cos(game.computerShip.angle) * game.computerShip.radius);
  assert.equal(computerBullet.y, game.computerShip.y + Math.sin(game.computerShip.angle) * game.computerShip.radius);
  assert.equal(Math.atan2(computerBullet.vy, computerBullet.vx), game.computerShip.angle);
  game.bullets = [];
  const target = { x: 700, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [], tone: 0, generation: 0 };
  game.asteroids = [target];
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.computerShip.aiTarget, target);
  game.bullets = [{ x: game.computerShip.x, y: game.computerShip.y, vx: 0, vy: 0, life: 1, owner: "human" }];
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.playerLives.computer, 2);
  assert.equal(game.scores.human, 0);
  game.bullets = [{ x: game.ship.x, y: game.ship.y, vx: 0, vy: 0, life: 1, owner: "computer" }];
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.playerLives.human, 3);
  assert.equal(game.scores.computer, 0);
  assert.equal(game.lifeLost, false);
  game.ship.x = game.computerShip.x;
  game.ship.y = game.computerShip.y;
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.playerLives.human, 3);
  assert.equal(game.scores.computer, 0);
  assert.equal(game.lifeLost, false);
  assert.ok(game.shipCollisionCooldown > 0);
  assert.ok(Math.hypot(game.computerShip.x - game.ship.x, game.computerShip.y - game.ship.y) >= game.ship.radius + game.computerShip.radius);
  game.lifeLost = false;
  game.playerLives.computer = 0;
  const result = game.handleLifeLoss();
  assert.equal(result.gameOver, true);
  assert.equal(game.winner, "human");
  assert.equal(game.won, true);
});

test("Missile Command varies enemy targets across a salvo", () => {
  const game = new MissileModel();
  game.reset();
  for (let index = 0; index < 10; index += 1) game.launchEnemy();
  const targets = game.enemyMissiles.filter((missile) => !missile.aircraft).map((missile) => missile.targetX);
  assert.ok(targets.length >= 5);
  assert.ok(new Set(targets).size > 1);
});

test("Missile Command misses continue off-screen without a fireball", () => {
  const game = new MissileModel();
  game.reset();
  game.target = { x: 250, y: 200 };
  game.launchInterceptor();
  game.interceptors[0].x = game.target.x;
  game.interceptors[0].y = game.target.y;
  game.update(0.016, { aim: null, launch: false });
  assert.equal(game.fireballs.length, 0);
  const missedX = game.interceptors[0].x;
  game.update(1, { aim: null, launch: false });
  assert.notEqual(game.interceptors[0].x, missedX);
});

test("Missile Command attacker only launches user missiles", () => {
  const game = new MissileModel();
  game.setSide("attacker");
  game.reset();
  game.update(1, { attack: null });
  assert.equal(game.enemyMissiles.length, 0);
});

test("Missile Command attacker missiles can destroy a battery", () => {
  const game = new MissileModel();
  game.setSide("attacker");
  game.reset();
  const battery = game.bases[0];
  game.enemyMissiles = [{ x: battery.x, y: battery.y - 5, targetX: battery.x, targetY: battery.y, speed: 90, color: "#fb7185", targetObject: battery, kind: "battery", dead: false, isSplit: false }];
  game.update(0, { attack: null });
  assert.equal(battery.alive, false);
  assert.equal(game.lifeLost, false);
});

test("Missile Command attacker supports direct clicks and drag trajectories", () => {
  const direct = new MissileModel();
  direct.setSide("attacker");
  direct.reset();
  direct.update(0, { attack: { x: 70, y: 400, clicked: true } });
  assert.equal(direct.enemyMissiles[0].targetObject, direct.cities[0]);
  const dragged = new MissileModel();
  dragged.setSide("attacker");
  dragged.reset();
  dragged.update(0, { attack: { x: 160, y: 180, released: true, dragDistance: 40, dragStartX: 120, dragStartY: 140, dragDeltaX: 40, dragDeltaY: 40 } });
  assert.equal(dragged.enemyMissiles[0].freeFlight, true);
  assert.equal(dragged.enemyMissiles[0].x, 120);
  assert.equal(dragged.enemyMissiles[0].y, 140);
  assert.ok(dragged.enemyMissiles[0].vx > 0);
  assert.ok(dragged.enemyMissiles[0].vy > 0);
  const controlled = new MissileCommandGame();
  controlled.setSide("attacker");
  controlled.reset();
  controlled.update(0, input({ pointer: pointer({ x: 70, y: 400, down: true, clicked: true }) }));
  assert.equal(controlled.model.enemyMissiles.length, 0);
  controlled.update(0, input({ pointer: pointer({ x: 70, y: 400, released: true, clicked: true }) }));
  assert.equal(controlled.model.enemyMissiles.length, 1);
});

test("Missile Command computer interceptors expire at their target", () => {
  const game = new MissileModel();
  game.setSide("attacker");
  game.reset();
  game.interceptors = [{ x: 100, y: 100, targetX: 100, targetY: 100, speed: 245, machine: true }];
  game.update(0, { attack: null });
  assert.equal(game.interceptors.length, 0);
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
  const enemy = { x: 250, y: 230, targetX: 250, targetY: 510, speed: 90, color: "#fb7185", targetBase: game.bases[0], dead: false };
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
  assert.equal(dead.lifeLost, false);
});

test("Missile Command uses arrow-selected batteries and click-to-launch", () => {
  const game = new MissileCommandGame();
  game.reset();
  game.update(0, input({ pressed: new Set(["ArrowRight"]), pointer: pointer({ x: 250, y: 180, clicked: true }) }));
  assert.equal(game.model.selectedBattery, 2);
  assert.deepEqual(game.model.target, { x: 250, y: 180 });
  assert.equal(game.model.interceptors.length, 1);
  assert.equal(game.model.bases[2].missiles, 9);
  const before = game.model.interceptors.length;
  game.update(0, input({ pressed: new Set([" "]) }));
  assert.equal(game.model.interceptors.length, before);
});

test("Missile Command ends when all cities are lost without reserves", () => {
  const game = new MissileModel();
  game.reset();
  game.cities.forEach((city) => { city.alive = false; });
  game.update(0, { aim: null, launch: false });
  assert.equal(game.gameOver, true);
});

test("Imitation: messages, peer handshake, score, trimming, and search countdown", () => {
  const game = new ImitationModel();
  game.setSide("human");
  assert.match(game.sideLabel(), /tab or window/);
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

test("Imitation controllers acknowledge each other across two pages", async () => {
  const OriginalBroadcastChannel = globalThis.BroadcastChannel;
  const channels = new Set();
  class TestBroadcastChannel {
    constructor(name) { this.name = name; channels.add(this); }
    postMessage(data) {
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name) queueMicrotask(() => channel.onmessage?.({ data }));
      }
    }
    close() { channels.delete(this); }
  }
  globalThis.BroadcastChannel = TestBroadcastChannel;
  try {
    const first = new ImitationController(new ImitationModel());
    const second = new ImitationController(new ImitationModel());
    first.model.setSide("human");
    second.model.setSide("human");
    first.reset();
    second.reset();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.model.peerId, second.model.matchId);
    assert.equal(second.model.peerId, first.model.matchId);
    assert.equal(first.channel.name, CHANNEL_NAME);
  } finally {
    globalThis.BroadcastChannel = OriginalBroadcastChannel;
  }
});

test("Imitation exposes five provider-neutral modes", () => {
  const game = new ImitationModel();
  for (const side of ["ai", "human", "guess", "provide", "write"]) {
    game.setSide(side);
    game.reset();
    assert.equal(game.side, side);
    assert.ok(game.chatLog[0].sender === "System");
  }
  game.setSide("ai");
  game.reset();
  game.sendMessage("hello");
  assert.equal(game.chatLog.at(-1).sender, "System");
  game.setSide("guess");
  game.reset();
  game.sendMessage("hello");
  assert.equal(game.chatLog.at(-1).sender, "You");
  game.setSide("write");
  game.reset();
  game.sendMessage("A sample sentence to classify.");
  assert.equal(game.chatLog.at(-1).sender, "System");
});

test("Imitation Guess only pairs with a provider tab", () => {
  const game = new ImitationModel();
  game.setSide("guess");
  game.reset();
  game.receive({ type: "hello", from: "human-tab", mode: "human" });
  assert.equal(game.peerId, null);
  game.receive({ type: "hello", from: "provider-tab", mode: "provide" });
  assert.equal(game.peerId, "provider-tab");
  const provider = new ImitationModel();
  provider.setSide("provide");
  provider.reset();
  provider.receive({ type: "hello", from: "guess-tab", mode: "guess" });
  assert.equal(provider.peerId, "guess-tab");
});

test("Imitation Guess waits for a peer before using the AI fallback", () => {
  const game = new ImitationModel();
  game.setSide("guess");
  game.reset();
  game.peerId = "peer";
  game.update(5);
  assert.equal(game.phase, "guess-waiting");
  game.mystery = { source: "ai", text: "A mystery" };
  game.phase = "guess";
  game.chooseGuess("ai");
  assert.equal(game.phase, "result");
  assert.deepEqual(game.guessResult, { choice: "ai", correct: true });
  assert.deepEqual(game.guessStats, { right: 1, wrong: 0 });
  game.restartGuess();
  assert.equal(game.phase, "guess-peer");
  assert.equal(game.mystery, null);
  assert.deepEqual(game.guessStats, { right: 0, wrong: 0 });
  assert.deepEqual(game.chatLog, []);
  game.sendMessage("next");
  assert.equal(game.phase, "guess-waiting");
});

test("Guess uses the local AI after a prompt receives no human response", async () => {
  const game = new ImitationModel();
  game.setSide("guess");
  game.reset();
  game.aiReady = true;
  game.requestAi = async () => "A natural short reply.";
  game.sendMessage("hello");
  game.update(5);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(game.phase, "guess");
  assert.deepEqual(game.mystery, { source: "ai", text: "A natural short reply." });
});

test("Starfall: movement, gem collection, star spawning, and collision loss", () => {
  const game = new StarfallModel();
  game.reset();
  const startX = game.runner.x;
  game.update(0.2, { mode: "keyboard", keyDirection: 1, pointerX: 0, spawnStar: undefined });
  assert.ok(game.runner.x > startX);
   const gemStartY = game.gems[0].y;
   assert.ok(game.gems.every((gem) => Number.isFinite(gem.vx) && Number.isFinite(gem.vy)));
   game.update(0.5, { mode: "keyboard", keyDirection: 0, pointerX: 0, spawnStar: undefined });
  assert.ok(game.gems[0].y > gemStartY);
  const spreadGems = new StarfallModel();
  spreadGems.reset();
  spreadGems.spawnClock = 999;
  for (let index = 0; index < 180; index += 1) spreadGems.update(0.016, input());
  for (let first = 0; first < spreadGems.gems.length; first += 1) for (let second = first + 1; second < spreadGems.gems.length; second += 1) {
    assert.ok(Math.abs(spreadGems.gems[first].x - spreadGems.gems[second].x) >= 90 || Math.abs(spreadGems.gems[first].y - spreadGems.gems[second].y) >= 45);
  }
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
  computer.stars = [];
  const dragged = new StarfallController(computer);
  dragged.update(0.016, input({ mode: "mouse", pointer: pointer({ x: 240, y: 0, released: true, dragDistance: 24 }) }));
  assert.equal(computer.stars.at(-1).x, 240);
  const mouseRunner = new StarfallModel();
  mouseRunner.reset();
  const mouseController = new StarfallController(mouseRunner);
  let previousMouseX = mouseRunner.runner.x;
  for (let index = 0; index < 20; index += 1) {
    mouseController.update(0.016, input({ mode: "mouse", pointer: pointer({ x: 700 }) }));
    assert.ok(mouseRunner.runner.x > previousMouseX);
    previousMouseX = mouseRunner.runner.x;
  }
  const doubleClick = new StarfallModel();
  doubleClick.setSide("stars");
  doubleClick.reset();
  const doubleClickController = new StarfallController(doubleClick);
  doubleClickController.update(0.016, input({ mode: "mouse", pointer: pointer({ x: 240, released: true }) }));
  assert.equal(doubleClick.stars.length, 1);
  doubleClickController.update(0.016, input({ mode: "mouse", pointer: pointer({ x: 240, doubleClicked: true, released: true }) }));
  doubleClickController.update(0.016, input({ mode: "mouse", pointer: pointer({ x: 240, doubleClicked: true, released: true }) }));
  assert.equal(doubleClick.stars.length, 0);
  assert.equal(doubleClick.gems.length, 1);
  const userLaunchMode = new StarfallModel();
  userLaunchMode.setSide("stars");
  userLaunchMode.reset();
  for (let index = 0; index < 60; index += 1) userLaunchMode.update(0.016, input());
  assert.equal(userLaunchMode.gems.length, 0);
  const droppedUserGem = new StarfallModel();
  droppedUserGem.setSide("stars");
  droppedUserGem.reset();
  droppedUserGem.update(0.016, { spawnGem: { x: 300 } });
  for (let index = 0; index < 200; index += 1) droppedUserGem.update(0.016, input());
  assert.equal(droppedUserGem.gems.length, 0);
  const angled = new StarfallModel();
  angled.setSide("stars");
  angled.reset();
  const angledController = new StarfallController(angled);
  angledController.update(0.016, input({ mode: "mouse", pointer: pointer({ x: 300, released: true, dragDistance: 80, dragDeltaX: 60, dragDeltaY: -60 }) }));
  assert.ok(angled.stars[0].vx > 0);
  const held = new StarfallModel();
  held.setSide("stars");
  held.reset();
  const heldController = new StarfallController(held);
  for (let index = 0; index < 30; index += 1) heldController.update(0.016, input({ mode: "mouse", pointer: pointer({ x: 300, down: true }) }));
  heldController.update(0.016, input({ mode: "mouse", pointer: pointer({ x: 300, released: true }) }));
  assert.equal(held.gems.length, 1);
  assert.equal(held.stars.length, 0);
  const stableComputer = new StarfallModel();
  stableComputer.setSide("stars");
  stableComputer.reset();
  const idleX = stableComputer.runner.x;
  stableComputer.update(0.016, input());
  assert.equal(stableComputer.runner.x, idleX);
  const seekingComputer = new StarfallModel();
  seekingComputer.setSide("stars");
  seekingComputer.reset();
  seekingComputer.gems = [{ x: 700, y: 400, vx: 0, vy: 0, collected: false }];
  seekingComputer.update(0.016, input());
  assert.ok(seekingComputer.aiTargetX > 400);
  const twoGemComputer = new StarfallModel();
  twoGemComputer.setSide("stars");
  twoGemComputer.reset();
  twoGemComputer.gems = [{ x: 150, y: 400, vx: 0, vy: 0, collected: false }, { x: 700, y: 400, vx: 0, vy: 0, collected: false }];
  twoGemComputer.update(0.016, input());
  const chosenTarget = twoGemComputer.aiTargetX;
  let targetChanges = 0;
  let previousTarget = chosenTarget;
  for (let index = 0; index < 120; index += 1) {
    twoGemComputer.update(0.016, input());
    if (twoGemComputer.aiTargetX !== previousTarget) { targetChanges += 1; previousTarget = twoGemComputer.aiTargetX; }
  }
  assert.ok(twoGemComputer.runner.x < 400);
  assert.ok(targetChanges <= 1);
  stableComputer.stars = [{ x: 440, y: 20, vy: 0, radius: 10 }];
  stableComputer.update(0.016, input());
  const stableTarget = stableComputer.aiTargetX;
  for (let index = 0; index < 20; index += 1) stableComputer.update(0.016, input());
  assert.equal(stableComputer.aiTargetX, stableTarget);
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
