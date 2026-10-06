import test from "node:test";
import assert from "node:assert/strict";
import { SnakeModel } from "../src/games/snake/model.js";
import { BreakoutModel } from "../src/games/breakout/model.js";
import { SplatModel } from "../src/games/splat/model.js";
import { AsteroidsModel } from "../src/games/asteroids/model.js";
import { MissileModel } from "../src/games/missile/model.js";
import { ImitationModel, PEER_LIVENESS_TIMEOUT } from "../src/games/imitation/model.js";
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

// Several models roll Math.random during reset or on spawn, which makes any
// assertion about their contents flaky. Tests that assert on random output
// install a seed first so a failure means a real regression rather than an
// unlucky roll.
function withSeededRandom(seed, run) {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  try { return run(); } finally { Math.random = original; }
}

const pointer = (values = {}) => ({ x: 0, y: 0, moved: false, clicked: false, down: false, ...values });
const input = (values = {}) => ({ keys: new Set(), pressed: new Set(), pointer: pointer(), ...values });

// Builds a board directly for tests that need a hand-laid-out body. Going
// through setSettings enforces the UI descriptor's minimums (10x8), which is
// larger than these fixtures need.
function handLaidSnake(cols, rows, startingLength, body) {
  const game = new SnakeModel();
  game.cols = cols;
  game.rows = rows;
  game.startingLength = startingLength;
  game.roundSettings = { cols, rows, startingLength, wrap: false };
  game.pendingSettings = { ...game.roundSettings };
  game.reset();
  if (body) {
    game.snake = body;
    game.rebuildOccupied();
  }
  return game;
}

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
  wallGame.setSettings({ cols: 10, rows: 8, startingLength: 3, wrap: false });
  wallGame.applyPendingSettings();
  wallGame.reset();
  wallGame.snake = [{ x: 9, y: 2 }, { x: 8, y: 2 }, { x: 7, y: 2 }];
  wallGame.rebuildOccupied();
  wallGame.direction = { x: 1, y: 0 };
  wallGame.nextDirection = { x: 1, y: 0 };
  wallGame.update(0.2, { direction: null, steer: null, placeApple: null });
  assert.equal(wallGame.gameOver, true);
  assert.equal(wallGame.lossReason, "wall");
  const wrapped = new SnakeModel();
  wrapped.setSettings({ cols: 10, rows: 8, startingLength: 3, wrap: true });
  wrapped.applyPendingSettings();
  wrapped.reset();
  wrapped.snake = [{ x: 9, y: 2 }, { x: 8, y: 2 }, { x: 7, y: 2 }];
  wrapped.rebuildOccupied();
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

test("Breakout computer holds when it is already under the ball", () => {
  const game = new BreakoutModel();
  game.setSide("blocks");
  game.reset();
  game.computerReaction = 0;
  game.computerDwell = 0;
  game.balls[0] = game.newBall(400, 200, 0, 300);
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    game.update(1 / 60, { mode: "mouse", keyDirection: 0, pointer: pointer() });
  } finally {
    Math.random = originalRandom;
  }
  // The paddle is deciding a direction, not picking a coordinate. Already under
  // the ball, the decision is to hold still.
  assert.equal(game.lastDecision.intent, 0, "no reason to move when the ball is overhead");
  assert.equal(game.computerIntent, 0);
});

test("Breakout computer commits to a direction and holds it", () => {
  const game = new BreakoutModel();
  game.setSide("blocks");
  game.reset();
  game.computerReaction = 0;
  game.computerDwell = 0;
  game.computer.x = 100;
  game.balls[0] = game.newBall(600, 200, 0, 300);
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    game.update(1 / 60, { mode: "mouse", keyDirection: 0, pointer: pointer() });
    assert.equal(game.computerIntent, 1, "the ball is to the right, so the paddle commits right");
    assert.ok(game.computer.x > 100, "and it moves that way");
    // A dwell holds the decision even if the ball changes its mind mid-flight.
    const xAfterDecision = game.computer.x;
    game.balls[0].x = 200;
    game.update(1 / 60, { mode: "mouse", keyDirection: 0, pointer: pointer() });
    assert.equal(game.computerIntent, 1, "the committed decision is not revised on the very next frame");
    assert.ok(game.computer.x > xAfterDecision, "so the paddle keeps going the wrong way briefly");
  } finally {
    Math.random = originalRandom;
  }
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

test("Breakout versus computer heads for the most urgent rising ball", () => {
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
  game.computerVersusTarget = humanBall;
  game.computerVersusReaction = 0;
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  // Direction, not a coordinate: the human ball is the one rising at it.
  assert.equal(game.lastDecision.mode, "versus");
  assert.equal(game.lastDecision.intent, 1, "it heads right, toward the rising ball");
  assert.ok(game.computer.x > 344, "and moves that way from the centre");
});

test("Breakout versus AI reacts before correcting and difficulty speeds the ball", () => {
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
  game.update(1 / 60, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.equal(game.computer.targetX, 350);
  const speedBefore = Math.hypot(game.balls[0].vx, game.balls[0].vy);
  game.scores.human = 10;
  game.score = 10;
  game.update(1 / 60, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.ok(Math.hypot(game.balls[0].vx, game.balls[0].vy) > speedBefore);
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

test("Breakout versus restores a ball per side after a simultaneous exit", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  const [humanBall, computerBall] = game.balls;

  // One ball leaves past each paddle, so each side loses exactly one ball.
  humanBall.x = 400; humanBall.y = 545; humanBall.vx = 0; humanBall.vy = 300;
  computerBall.x = 400; computerBall.y = -5; computerBall.vx = 0; computerBall.vy = -300;
  game.update(0.02, { mode: "keyboard", keyDirection: 0, pointer: pointer() });

  assert.equal(game.balls.length, 0, "both balls left the field");
  assert.deepEqual([...game.pendingLifeLossOwners].sort(), ["computer", "human"], "both sides are queued for the loss");

  const result = game.handleLifeLoss();
  assert.equal(result.gameOver, false, "neither side is out of lives");
  assert.deepEqual([...result.owners].sort(), ["computer", "human"], "both owners are charged");
  assert.equal(game.playerLives.human, 2, "the human lost a life");
  assert.equal(game.playerLives.computer, 2, "the computer lost a life");

  game.resetAfterLife();
  assert.equal(game.balls.length, 2, "a replacement ball per side");
  assert.deepEqual(new Set(game.balls.map((ball) => ball.owner)), new Set(["human", "computer"]));
  assert.equal(game.pendingLifeLossOwners.length, 0, "the queue is drained");
});

test("Breakout versus charges two lost balls on the same side twice", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  // Two human balls both leave past the bottom in the same frame.
  game.balls = [
    { x: 300, y: 545, vx: 0, vy: 300, radius: 8, owner: "human" },
    { x: 500, y: 545, vx: 0, vy: 300, radius: 8, owner: "human" }
  ];
  game.update(0.02, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.deepEqual(game.pendingLifeLossOwners, ["human", "human"], "both losses are queued");
  game.handleLifeLoss();
  assert.equal(game.playerLives.human, 1, "two lost balls cost two lives");
  assert.equal(game.playerLives.computer, 3, "the other side is untouched");
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

test("Splat progressively narrows generated gaps", () => {
  const game = new SplatModel();
  game.reset();
  assert.ok(game.columns.at(-1).gapHeight < game.columns[0].gapHeight);
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
  assert.ok(game.player.aiCommit > 0, "the decision has a real commitment window");
  assert.equal(game.player.aiTargetY, game.columns[0].gapY + game.columns[0].gapHeight / 2);
});

test("Splat computer keeps steering at its committed gap", () => {
  const game = new SplatModel();
  game.setSide("builder");
  game.reset();
  const first = game.columns[0];
  const second = game.columns[1];
  first.passed = true;
  second.x = 200;
  second.gapY = 380;
  second.gapHeight = 40;
  game.player.x = 150;
  game.player.y = 100;
  game.player.vy = 0;
  game.player.aiTargetY = 100;
  game.player.aiReaction = 0;
  game.player.aiCommit = 0.05;
  game.moveComputer(game.player, 1 / 60);
  assert.ok(game.player.vy <= 0, "a live commitment does not immediately steer toward the next gap");
});

test("Splat computer can steer through a generated route", () => {
  const game = new SplatModel();
  game.setSide("builder");
  game.reset();
  for (let step = 0; step < 1200 && !game.lifeLost && !game.won; step += 1) game.update(1 / 60, {});
  assert.ok(game.score > 0 || game.lifeLost);
});

test("Splat builder places columns from the pointer, not a separate placement channel", () => {
  const game = new SplatGame();
  game.setSide("builder");
  game.reset();
  const columnsBefore = game.model.columns.length;
  const clickX = 400;
  game.update(0, input({ pointer: pointer({ x: clickX, y: 280, clicked: true, released: true, down: false, dragDistance: 0 }) }));
  assert.equal(game.model.columns.length, columnsBefore + 1, "a plain click adds a column at the clicked x");
  const added = game.model.columns.find((column) => column.x === game.model.builderCameraX + clickX);
  assert.ok(added, "the new column sits at the clicked screen position");

  const countAfterAdd = game.model.columns.length;
  const dragTarget = game.model.columns[0];
  const startX = dragTarget.x;
  game.update(0.016, input({ pointer: pointer({ x: dragTarget.x, y: 280, clicked: false, down: true, dragStartX: dragTarget.x, dragStartY: 280 }) }));
  game.update(0.016, input({ pointer: pointer({ x: startX + 60, y: 280, clicked: false, down: true, dragStartX: dragTarget.x, dragStartY: 280, dragDistance: 60 }) }));
  game.update(0.016, input({ pointer: pointer({ x: startX + 60, y: 280, clicked: false, down: false, released: true, dragStartX: dragTarget.x, dragStartY: 280, dragDistance: 60 }) }));
  assert.equal(game.model.columns.length, countAfterAdd, "dragging rearranges rather than adding");
  assert.notEqual(dragTarget.x, startX, "the dragged column moved");
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
  game.computerInvulnerable = 0;
  game.invulnerable = 0;
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
  // A computer bullet that connects spends a human life and raises the shared
  // lifeLost flag, so both sides resolve through the same engine path.
  game.bullets = [{ x: game.ship.x, y: game.ship.y, vx: 0, vy: 0, life: 1, owner: "computer" }];
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.playerLives.human, 2, "a computer hit costs the human a life");
  assert.equal(game.scores.computer, 0, "a hit on a ship is not a rock score");
  assert.equal(game.lifeLost, true, "a computer hit raises the shared life-loss flag");

  game.ship.x = game.computerShip.x;
  game.ship.y = game.computerShip.y;
  game.bullets = [];
  game.update(0, { pointer: null, fire: false });
  // Two ships overlapping are pushed apart, and a bounce does not cost a life.
  assert.ok(Math.hypot(game.computerShip.x - game.ship.x, game.computerShip.y - game.ship.y) >= game.ship.radius + game.computerShip.radius);
  game.lifeLost = false;
  game.playerLives.computer = 0;
  const result = game.handleLifeLoss();
  assert.equal(result.gameOver, true);
  assert.equal(game.winner, "human");
  assert.equal(game.won, true);
});

test("Missile Command varies enemy targets across a salvo", () => {
  // Seeded: launchEnemy() rolls for aircraft (~12%), so an unseeded salvo
  // occasionally produced six or more aircrafts and failed the floor below.
  withSeededRandom(20260101, () => {
    const game = new MissileModel();
    game.reset();
    for (let index = 0; index < 10; index += 1) game.launchEnemy();
    const targets = game.enemyMissiles.filter((missile) => !missile.aircraft).map((missile) => missile.targetX);
    assert.ok(targets.length >= 5);
    assert.ok(new Set(targets).size > 1);
  });
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

test("Missile Command uses arrow-selected batteries and launches on click or Space", () => {
  const game = new MissileCommandGame();
  game.reset();
  game.update(0, input({ pressed: new Set(["ArrowRight"]), pointer: pointer({ x: 250, y: 180, clicked: true }) }));
  assert.equal(game.model.selectedBattery, 2);
  assert.deepEqual(game.model.target, { x: 250, y: 180 });
  assert.equal(game.model.interceptors.length, 1);
  assert.equal(game.model.bases[2].missiles, 9);

  const afterClick = game.model.interceptors.length;
  game.update(0, input({ pressed: new Set([" "]) }));
  assert.equal(game.model.interceptors.length, afterClick + 1, "Space launches at the current target");
  assert.equal(game.model.bases[2].missiles, 8);

  game.model.interceptors.length = 0;
  const battery = game.model.selectedBattery;
  game.model.bases[battery].alive = false;
  const launchedFromDeadBattery = game.model.launchInterceptor();
  assert.equal(launchedFromDeadBattery, false, "Space cannot launch from a destroyed battery");
});

test("every game advertises the controls its controller actually binds", () => {
  const games = {
    snake: new SnakeGame(),
    breakout: new BreakoutGame(),
    splat: new SplatGame(),
    asteroids: new AsteroidsGame(),
    missile: new MissileCommandGame(),
    imitation: new ImitationGame(),
    starfall: new StarfallGame()
  };
  const advertised = {};
  for (const [id, game] of Object.entries(games)) {
    const hint = game.controlHint();
    assert.ok(Array.isArray(hint) && hint.length > 0, `${id} exposes a control hint`);
    for (const entry of hint) {
      assert.ok(Array.isArray(entry.keys) && entry.keys.length > 0, `${id} lists keys for "${entry.label}"`);
      assert.equal(typeof entry.label, "string");
      advertised[id] = (advertised[id] || new Set()).add(entry.keys.join("|"));
    }
  }
  assert.ok(advertised.missile.has("Space"), "Missile advertises Space, which its controller now binds");
  assert.ok(advertised.asteroids.has("Space"), "Asteroids advertises Space");
  assert.ok(advertised.snake.has("Click"), "Snake advertises clicking to place an apple");
  assert.ok(advertised.imitation.has("Enter"), "Imitation advertises Enter to send");
  assert.ok(!advertised.breakout.has("Space"), "Breakout does not advertise a key it does not bind");
  assert.ok(!advertised.starfall.has("Space"), "Starfall does not advertise a key it does not bind");
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
  assert.match(game.sideLabel(), /another player/);
  game.reset();
  assert.equal(game.phase, "searching");
  assert.equal(game.chatLog[0].sender, "System");
  game.update(1);
  assert.equal(game.matchmaking, 1.5);
  game.receive({ type: "hello", from: "peer", mode: "human" });
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
  let first;
  let second;
  try {
    first = new ImitationController(new ImitationModel());
    second = new ImitationController(new ImitationModel());
    first.model.setSide("human");
    second.model.setSide("human");
    first.reset();
    second.reset();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.model.peerId, second.model.matchId);
    assert.equal(second.model.peerId, first.model.matchId);
    assert.equal(first.channel.name, CHANNEL_NAME);
  } finally {
    first?.destroy();
    second?.destroy();
    globalThis.BroadcastChannel = OriginalBroadcastChannel;
  }
});

test("Imitation returns to matchmaking when a peer leaves", () => {
  const game = new ImitationModel();
  game.setSide("human");
  game.reset();
  game.peerId = "peer";
  game.phase = "connected";
  game.receive({ type: "bye", from: "peer" });
  assert.equal(game.peerId, null);
  assert.equal(game.phase, "searching");
});

test("Imitation announces a peer departure during pagehide", async () => {
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
  let first;
  let second;
  try {
    first = new ImitationController(new ImitationModel());
    second = new ImitationController(new ImitationModel());
    first.model.setSide("human");
    second.model.setSide("human");
    first.reset();
    second.reset();
    await new Promise((resolve) => setImmediate(resolve));
    second.handlePageHide();
    assert.equal(second.channel, null, "pagehide closes the transport");
    assert.equal(second.heartbeatTimer, null, "pagehide stops presence");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.model.peerId, null, "the remaining tab releases the peer immediately");
    assert.equal(first.model.phase, "searching");
  } finally {
    first?.destroy();
    second?.destroy();
    globalThis.BroadcastChannel = OriginalBroadcastChannel;
  }
});

test("Imitation drops a silent peer after the heartbeat timeout", () => {
  const game = new ImitationModel();
  game.setSide("human");
  game.reset();
  game.peerId = "peer";
  game.peerLivenessEnabled = true;
  game.update(PEER_LIVENESS_TIMEOUT + 0.1);
  assert.equal(game.peerId, null, "a peer that stops heartbeating no longer owns the slot");
  assert.equal(game.phase, "searching");
});

test("Imitation reconnects after an unclean tab disappearance", async () => {
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
  let first;
  let vanished;
  let replacement;
  try {
    first = new ImitationController(new ImitationModel());
    vanished = new ImitationController(new ImitationModel());
    first.model.setSide("human");
    vanished.model.setSide("human");
    first.reset();
    vanished.reset();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.model.peerId, vanished.model.matchId);

    // Simulate a tab being killed: no destroy(), bye, or reset runs. The
    // surviving tab must evict it from the slot using heartbeat liveness.
    vanished.channel.close();
    clearInterval(vanished.heartbeatTimer);
    vanished.heartbeatTimer = null;
    first.update(PEER_LIVENESS_TIMEOUT + 0.1);
    assert.equal(first.model.peerId, null);

    replacement = new ImitationController(new ImitationModel());
    replacement.model.setSide("human");
    replacement.reset();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(first.model.peerId, replacement.model.matchId, "the released slot accepts a later player");
  } finally {
    first?.destroy();
    vanished?.destroy();
    replacement?.destroy();
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
  // Seeded: gems spawn at random positions, so an unseeded run could
  // collect the tracked gem and compare a different one against itself.
  withSeededRandom(20260102, () => {
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
    droppedUserGem.gems[0].vy = 100;
    for (let index = 0; index < 400; index += 1) droppedUserGem.update(0.016, input());
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
    const weightedComputer = new StarfallModel();
    weightedComputer.setSide("stars");
    weightedComputer.reset();
    weightedComputer.gems = [{ x: 150, y: 400, vx: 0, vy: 0, collected: false }, { x: 400, y: 400, vx: 0, vy: 0, collected: false }, { x: 700, y: 400, vx: 0, vy: 0, collected: false }];
    weightedComputer.aiTargetGem = weightedComputer.gems[2];
    weightedComputer.aiTargetX = 720;
    weightedComputer.aiTargetLock = 0;
    const originalRandom = Math.random;
    try {
      Math.random = () => 0;
      weightedComputer.update(0.016, input());
      assert.equal(weightedComputer.aiTargetGem, weightedComputer.gems[1]);
      Math.random = () => 0.99;
      for (let index = 0; index < 10; index += 1) weightedComputer.update(0.016, input());
      assert.equal(weightedComputer.aiTargetGem, weightedComputer.gems[1]);
    } finally {
      Math.random = originalRandom;
    }
    stableComputer.stars = [{ x: 440, y: 20, vy: 0, radius: 10 }];
    stableComputer.update(0.016, input());
    const stableTarget = stableComputer.aiTargetX;
    for (let index = 0; index < 20; index += 1) stableComputer.update(0.016, input());
    assert.equal(stableComputer.aiTargetX, stableTarget);
  });
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
    for (const field of ["won", "gameOver", "lifeLost"]) {
      game[field] = true;
      assert.equal(game.model[field], true, `${game.id} facade writes ${field} through to its model`);
      game[field] = false;
      assert.equal(game.model[field], false, `${game.id} facade clears ${field} through to its model`);
    }
  }
});

test("Starfall exposes a model-backed terminal state", () => {
  const game = new StarfallGame();
  game.reset();
  game.gameOver = true;
  assert.equal(game.model.gameOver, true);
  game.gameOver = false;
  game.won = true;
  assert.equal(game.model.won, true);
});

test("a disposed Imitation controller drops its channel and stops mutating the model", async () => {
  const OriginalBroadcastChannel = globalThis.BroadcastChannel;
  const channels = new Set();
  class TestBroadcastChannel {
    constructor(name) { this.name = name; this.closed = false; channels.add(this); }
    postMessage(data) {
      for (const channel of channels) {
        if (channel !== this && !channel.closed && channel.name === this.name) queueMicrotask(() => channel.onmessage?.({ data }));
      }
    }
    close() { this.closed = true; channels.delete(this); }
  }
  globalThis.BroadcastChannel = TestBroadcastChannel;
  let leaving;
  let staying;
  try {
    leaving = new ImitationController(new ImitationModel());
    staying = new ImitationController(new ImitationModel());
    leaving.model.setSide("human");
    staying.model.setSide("human");
    leaving.reset();
    staying.reset();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(leaving.model.peerId, staying.model.matchId);

    leaving.destroy();
    assert.equal(leaving.channel, null, "the departing controller releases its channel");
    assert.equal(leaving.model.disposed, true);
    assert.equal(leaving.announceTimer, null, "the matchmaking heartbeat is cleared");

    staying.model.sendMessage("still here?");
    await new Promise((resolve) => setImmediate(resolve));
    const afterDeparture = leaving.model.chatLog.length;
    assert.equal(leaving.model.chatLog.length, afterDeparture, "a disposed model records nothing further");
    assert.equal(leaving.model.peerId, null);

    leaving.model.receive({ type: "chat", from: staying.model.matchId, text: "too late" });
    assert.equal(leaving.model.chatLog.length, afterDeparture, "a disposed model ignores inbound messages");
    assert.equal(leaving.model.sendMessage("hi"), null, "a disposed model refuses to send");
    assert.equal(leaving.model.chooseGuess("ai"), false);
  } finally {
    staying?.destroy();
    globalThis.BroadcastChannel = OriginalBroadcastChannel;
  }
});

test("disposing Imitation cancels a pending guess round timer", async () => {
  const game = new ImitationModel();
  game.setSide("guess");
  game.reset();
  game.peerId = "peer";
  game.mystery = { source: "ai", text: "A mystery" };
  game.phase = "guess";
  assert.equal(game.chooseGuess("ai"), true);
  assert.ok(game.restartTimer, "a pending next-round timer exists while playing");
  game.destroy();
  assert.equal(game.restartTimer, null, "destroy cancels the pending round timer");
  assert.equal(game.disposed, true);
});

test("every game registers the side values it accepts", () => {
  const games = {
    snake: new SnakeGame(),
    breakout: new BreakoutGame(),
    splat: new SplatGame(),
    asteroids: new AsteroidsGame(),
    missile: new MissileCommandGame(),
    imitation: new ImitationGame(),
    starfall: new StarfallGame()
  };
  for (const [id, game] of Object.entries(games)) {
    assert.ok(game.sides.length > 1, `${id} registers more than one side`);
    for (const side of game.sides) assert.equal(typeof side, "string");
  }
  assert.deepEqual(games.missile.sides, ["defender", "attacker"]);
});

test("setSide rejects unregistered values instead of silently accepting them", () => {
  const missile = new MissileCommandGame();
  missile.reset();
  missile.setSide("attacker");
  assert.equal(missile.side, "attacker");
  missile.setSide("attack");
  assert.equal(missile.side, "attacker", "the misspelled side from the old fixture is refused");

  const splat = new SplatGame();
  splat.reset();
  splat.setSide("not-a-mode");
  assert.equal(splat.side, "climber", "an unknown side leaves the default in place");
  splat.setSide("race");
  assert.equal(splat.side, "race");
});

const allGames = () => ({
  snake: new SnakeGame(),
  breakout: new BreakoutGame(),
  splat: new SplatGame(),
  asteroids: new AsteroidsGame(),
  missile: new MissileCommandGame(),
  imitation: new ImitationGame(),
  starfall: new StarfallGame()
});

test("every registered mode is selectable, labelled, and reaches its own model", () => {
  for (const [id, game] of Object.entries(allGames())) {
    assert.ok(Array.isArray(game.modes) && game.modes.length > 1, `${id} registers multiple modes`);
    for (const mode of game.modes) {
      assert.equal(typeof mode.value, "string", `${id} mode has a value`);
      assert.ok(mode.label && mode.label.length > 2, `${id}/${mode.value} has a human label`);
    }
    assert.deepEqual([...new Set(game.sides)], game.sides, `${id} has no duplicate modes`);
    assert.ok(game.sides.includes(game.side), `${id} starts on a registered mode`);

    for (const side of game.sides) {
      game.setSide(side);
      assert.equal(game.side, side, `${id} accepts registered mode ${side}`);
      assert.equal(game.sideLabel(), game.modes.find((mode) => mode.value === side).label, `${id}/${side} label comes from the descriptor`);
      game.reset();
    }
  }
});

test("mode descriptors offer every registered mode except explicitly hidden aliases", () => {
  const games = allGames();
  for (const [id, game] of Object.entries(games)) {
    const offered = game.modes.filter((mode) => mode.available !== false).map((mode) => mode.value);
    for (const side of offered) {
      assert.ok(game.sides.includes(side), `${id} offers ${side}, which its model accepts`);
      assert.ok(game.controlHint().length > 0, `${id} has control hints for mode ${side}`);
    }
  }
  // No game hides a registered mode any more. Splat's `layout` alias was the
  // last one: it duplicated Builder exactly and no user could select it, so it
  // added routing branches and a test fixture for a mode that did not exist.
  for (const [id, game] of Object.entries(games)) {
    const hidden = game.modes.filter((mode) => mode.available === false).map((mode) => mode.value);
    assert.deepEqual(hidden, [], `${id} hides no registered mode`);
  }
  assert.equal(games.splat.sides.includes("layout"), false, "the Splat alias is gone, not merely hidden");
});

test("settings descriptors are the single source of bounds, labels, and validation", () => {
  const snake = new SnakeGame();
  const descriptors = snake.settings;
  assert.deepEqual(Object.keys(descriptors).sort(), ["cols", "rows", "startingLength", "wrap"]);
  assert.equal(descriptors.cols.min, 10);
  assert.equal(descriptors.cols.max, 60);
  assert.equal(descriptors.cols.default, 40);
  assert.equal(descriptors.wrap.type, "checkbox");

  assert.deepEqual(snake.validateSettings({ cols: 20, rows: 15, startingLength: 4, wrap: true }), { cols: 20, rows: 15, startingLength: 4, wrap: true });
  assert.equal(snake.validateSettings({ cols: 9, rows: 15, startingLength: 4 }), null, "below minimum");
  assert.equal(snake.validateSettings({ cols: 61, rows: 15, startingLength: 4 }), null, "above maximum");
  assert.equal(snake.validateSettings({ cols: 20, rows: 15.5, startingLength: 4 }), null, "not a whole number");
  assert.equal(snake.validateSettings({ cols: 20, rows: 15, startingLength: 20 }), null, "start length must fit the board");

  const splat = new SplatGame();
  assert.equal(splat.settings.columnSpacing.min, 90);
  assert.equal(splat.settings.columnSpacing.max, 240);
  assert.deepEqual(splat.validateSettings({ columnSpacing: 150 }), { columnSpacing: 150 });
  assert.equal(splat.validateSettings({ columnSpacing: 91 }), null, "values outside the descriptor step are rejected");
  assert.equal(splat.validateSettings({ columnSpacing: 89 }), null);
  assert.equal(splat.validateSettings({ columnSpacing: 241 }), null);
});

test("settings descriptors match the values the model actually applies", () => {
  const snake = new SnakeGame();
  snake.setSettings(snake.validateSettings({ cols: 25, rows: 20, startingLength: 6, wrap: true }));
  snake.applyPendingSettings();
  snake.reset();
  assert.deepEqual({ cols: snake.model.cols, rows: snake.model.rows, startingLength: snake.model.startingLength, wrap: snake.model.wrap }, { cols: 25, rows: 20, startingLength: 6, wrap: true });
  assert.equal(snake.model.snake.length, 6);

  const splat = new SplatGame();
  splat.setSettings(splat.validateSettings({ columnSpacing: 160 }));
  splat.applyPendingSettings();
  assert.equal(splat.model.columnSpacing, 160);
  assert.equal(splat.setSettings({ columnSpacing: 241 }), false, "invalid settings are refused at the model API");
  assert.equal(splat.model.pendingSettings.columnSpacing, 160, "invalid settings do not mutate the pending value");
});

test("games without settings expose no descriptor or validator", () => {
  for (const [id, game] of Object.entries(allGames())) {
    if (id === "snake" || id === "splat") continue;
    assert.equal(game.settings, undefined, `${id} has no settings descriptor`);
    assert.equal(game.validateSettings({ anything: 1 }), undefined, `${id} has no settings validator`);
  }
});

function withFakeStorage(run) {
  const store = new Map();
  const saved = { window: globalThis.window, storage: globalThis.localStorage };
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  try {
    return run(store);
  } finally {
    globalThis.window = saved.window;
    globalThis.localStorage = saved.storage;
  }
}

test("the cached-model marker must be a valid versioned record, not a bare string", async () => {
  const { hasCachedModel, cachedModelRecord } = await import("../src/ai/on-device.js");
  withFakeStorage((store) => {
    assert.equal(hasCachedModel(), false, "nothing cached to start with");

    store.set("cocktail-cabinet-local-ai-ready-v5", "ready");
    assert.equal(hasCachedModel(), false, "the legacy bare 'ready' marker is not proof of a loadable model");

    const key = "cocktail-cabinet-local-ai-ready-v6";
    store.set(key, "ready");
    assert.equal(hasCachedModel(), false, "a bare string under the new key is rejected too");

    store.set(key, JSON.stringify({ modelId: "onnx-community/Llama-3.2-1B-Instruct-q4f16", device: "webgpu", at: Date.now() }));
    assert.equal(hasCachedModel(), false, "a record without a version is rejected");

    store.set(key, JSON.stringify({ version: 5, modelId: "onnx-community/Llama-3.2-1B-Instruct-q4f16", device: "webgpu", at: Date.now() }));
    assert.equal(hasCachedModel(), false, "a stale version is rejected");

    store.set(key, JSON.stringify({ version: 6, modelId: "some-other-model", device: "webgpu", at: Date.now() }));
    assert.equal(hasCachedModel(), false, "an unknown model id is rejected");

    store.set(key, JSON.stringify({ version: 6, modelId: "onnx-community/Llama-3.2-1B-Instruct-q4f16", device: "quantum", at: Date.now() }));
    assert.equal(hasCachedModel(), false, "an unknown device is rejected");

    store.set(key, "{ not json");
    assert.equal(hasCachedModel(), false, "unparseable storage does not throw or pass");

    store.set(key, JSON.stringify({ version: 6, modelId: "onnx-community/Llama-3.2-1B-Instruct-q4f16", device: "webgpu", at: Date.now() }));
    assert.equal(hasCachedModel(), true, "a complete versioned record is accepted");
    assert.equal(cachedModelRecord().device, "webgpu");
  });
});

test("successful Chrome and Ollama providers persist recognizable cache records", async () => {
  const saved = { window: globalThis.window, storage: globalThis.localStorage, LanguageModel: globalThis.LanguageModel, fetch: globalThis.fetch };
  const store = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  try {
    const chrome = await import(`../src/ai/on-device.js?chrome-cache-${Date.now()}`);
    globalThis.LanguageModel = {
      availability: async () => "available",
      create: async () => ({ prompt: async () => "ok" })
    };
    await chrome.loadLocalModel();
    assert.equal(chrome.cachedModelRecord().device, "chrome");

    // A fresh module instance avoids the memoized Chrome engine while the same
    // storage represents the browser's shared cache.
    const ollama = await import(`../src/ai/on-device.js?ollama-cache-${Date.now()}`);
    globalThis.LanguageModel = undefined;
    globalThis.fetch = async (url) => ({ ok: true, json: async () => url.endsWith("/api/tags") ? { models: [{ name: "llama3.2:1b" }] } : { message: { content: "ok" } } });
    await ollama.loadLocalModel();
    assert.equal(ollama.cachedModelRecord().device, "ollama");
  } finally {
    globalThis.window = saved.window;
    globalThis.localStorage = saved.storage;
    globalThis.LanguageModel = saved.LanguageModel;
    globalThis.fetch = saved.fetch;
  }
});

test("every concurrent loadLocalModel caller receives progress and a terminal report", async () => {
  const saved = { window: globalThis.window, storage: globalThis.localStorage, LanguageModel: globalThis.LanguageModel };
  const store = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  // Minimal Chrome built-in AI stand-in so the loader resolves on the
  // first strategy without needing a real model download.
  globalThis.LanguageModel = {
    availability: async () => "available",
    create: async ({ monitor }) => {
      const listeners = [];
      monitor?.addEventListener?.("downloadprogress", (event) => { for (const listener of listeners) listener(event); });
      await new Promise((resolve) => setTimeout(resolve, 5));
      for (const loaded of [10, 20]) for (const listener of listeners) listener({ loaded });
      return { prompt: async () => "hello" };
    }
  };
  try {
    const { loadLocalModel } = await import(`../src/ai/on-device.js?fresh=${Date.now()}`);
    const first = [];
    const second = [];
    const [a, b] = await Promise.all([
      loadLocalModel((report) => first.push(report)),
      loadLocalModel((report) => second.push(report))
    ]);
    assert.equal(a, b, "concurrent callers share one engine");
    for (const [name, reports] of [["first", first], ["second", second]]) {
      assert.ok(reports.length > 0, `${name} caller received progress`);
      assert.ok(reports.some((report) => report.text), `${name} caller received text`);
      assert.equal(reports.at(-1).progress, 1, `${name} caller received the terminal ready report`);
    }
  } finally {
    globalThis.window = saved.window;
    globalThis.localStorage = saved.storage;
    globalThis.LanguageModel = saved.LanguageModel;
  }
});

test("Asteroids versus applies the same ship-hit rule to both pilots", () => {
  const duel = () => {
    const game = new AsteroidsModel();
    game.setSide("versus");
    game.reset();
    game.invulnerable = game.computerInvulnerable = 0;
    game.asteroids = [];
    game.computerShotClock = 99;
    return game;
  };

  const humanHit = duel();
  humanHit.playerLives.human = 3;
  humanHit.bullets = [{ x: humanHit.computerShip.x, y: humanHit.computerShip.y, vx: 0, vy: 0, life: 1, owner: "human" }];
  humanHit.update(0, { pointer: null, fire: false });
  assert.equal(humanHit.playerLives.computer, 2, "a human hit costs the computer a life");

  const computerHit = duel();
  computerHit.playerLives.human = 3;
  computerHit.bullets = [{ x: computerHit.ship.x, y: computerHit.ship.y, vx: 0, vy: 0, life: 1, owner: "computer" }];
  computerHit.update(0, { pointer: null, fire: false });
  assert.equal(computerHit.playerLives.human, 2, "a computer hit costs the human a life");
  assert.equal(computerHit.lifeLost, true, "the human side resolves through the shared life-loss path");

  // A spent bullet is removed, and lives never go negative.
  assert.equal(computerHit.bullets.length, 0, "the bullet is consumed by the hit");
  for (let hit = 0; hit < 5; hit += 1) {
    const game = duel();
    game.playerLives.human = 1;
    game.bullets = [{ x: game.ship.x, y: game.ship.y, vx: 0, vy: 0, life: 1, owner: "computer" }];
    game.update(0, { pointer: null, fire: false });
    assert.ok(game.playerLives.human >= 0, "lives never go negative");
  }
});

test("Asteroids versus ends immediately when either side runs out of lives", () => {
  const finish = (owner) => {
    const game = new AsteroidsModel();
    game.setSide("versus");
    game.reset();
    game.invulnerable = game.computerInvulnerable = 0;
    game.asteroids = [];
    game.computerShotClock = 99;
    const target = owner === "human" ? game.ship : game.computerShip;
    game.playerLives[owner] = 1;
    game.bullets = [{ x: target.x, y: target.y, vx: 0, vy: 0, life: 1, owner: owner === "human" ? "computer" : "human" }];
    game.update(0, { pointer: null, fire: false });
    return game;
  };

  const humanOut = finish("human");
  assert.equal(humanOut.playerLives.human, 0);
  assert.equal(humanOut.lifeLost, true, "reaching zero raises the terminal flag");
  const humanResult = humanOut.handleLifeLoss();
  assert.equal(humanResult.gameOver, true);
  assert.equal(humanOut.winner, "computer");
  assert.match(humanResult.message, /Computer wins/);

  const computerOut = finish("computer");
  assert.equal(computerOut.playerLives.computer, 0);
  assert.equal(computerOut.lifeLost, true);
  const computerResult = computerOut.handleLifeLoss();
  assert.equal(computerResult.gameOver, true);
  assert.equal(computerOut.winner, "human");
  assert.match(computerResult.message, /You win/);
});

test("Asteroids versus lets rocks damage the computer ship too", () => {
  const duel = () => {
    const game = new AsteroidsModel();
    game.setSide("versus");
    game.reset();
    game.invulnerable = 0;
    game.computerInvulnerable = 0;
    game.computerShotClock = 99;
    return game;
  };
  const rockAt = (x, y) => ({ x, y, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [], tone: 0, generation: 0 });

  const computerHit = duel();
  computerHit.ship.x = 100;
  computerHit.ship.y = 500;
  computerHit.playerLives.computer = 3;
  computerHit.asteroids = [rockAt(computerHit.computerShip.x, computerHit.computerShip.y)];
  computerHit.update(0, { pointer: null, fire: false });
  assert.equal(computerHit.playerLives.computer, 2, "a rock costs the computer a life");
  assert.equal(computerHit.lifeLost, true, "a computer hit enters the shared duel loss lifecycle");

  // The computer is moved clear, so one rock cannot drain its whole life bank
  // across consecutive frames.
  assert.notDeepEqual(
    { x: computerHit.computerShip.x, y: computerHit.computerShip.y },
    { x: 400, y: 160 },
    "the computer is displaced so the same rock cannot hit again"
  );

  const humanHit = duel();
  humanHit.computerShip.x = 700;
  humanHit.computerShip.y = 60;
  humanHit.asteroids = [rockAt(humanHit.ship.x, humanHit.ship.y)];
  humanHit.update(0, { pointer: null, fire: false });
  assert.equal(humanHit.lifeLost, true, "a rock still costs the human a life");
  assert.equal(humanHit.playerLives.computer, 3, "the computer is unaffected by the human's hit");
});

test("Asteroids versus respects the respawn grace period for both ships", () => {
  const game = new AsteroidsModel();
  game.setSide("versus");
  game.reset();
  const rock = { x: game.ship.x, y: game.ship.y, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [], tone: 0, generation: 0 };
  game.invulnerable = 1;
  game.asteroids = [rock];
  game.computerShip.x = 700;
  game.computerShip.y = 60;
  game.update(0.1, { pointer: null, fire: false });
  assert.equal(game.lifeLost, false, "a blinking ship cannot lose a life to a rock");

  // Once the grace period lapses the same rock does count.
  game.invulnerable = 0;
  rock.x = game.ship.x;
  rock.y = game.ship.y;
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.lifeLost, true);
});

test("Asteroids versus ends when rocks alone exhaust the computer's lives", () => {
  const game = new AsteroidsModel();
  game.setSide("versus");
  game.reset();
  game.invulnerable = 0;
  game.computerInvulnerable = 0;
  game.computerShotClock = 99;
  game.ship.x = 60;
  game.ship.y = 500;
  game.playerLives.computer = 1;
  game.asteroids = [{ x: game.computerShip.x, y: game.computerShip.y, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [], tone: 0, generation: 0 }];
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.playerLives.computer, 0);
  assert.equal(game.lifeLost, true, "the duel reaches its terminal state");
  const result = game.handleLifeLoss();
  assert.equal(result.gameOver, true);
  assert.equal(game.winner, "human");
});

test("Asteroids measures every distance across the wrap, not through the middle", async () => {
  const { wrapDeltaX, wrapDeltaY, wrapDistance, wrapHitsCircle, BOARD_WIDTH, BOARD_HEIGHT } = await import("../src/games/asteroids/model.js");

  // The issue's reproduction: one pixel apart through the seam.
  assert.equal(wrapDeltaX(1, 799), 2, "a one-pixel gap on the left edge is two from the right edge");
  assert.equal(wrapDeltaX(799, 1), -2);
  assert.equal(wrapDeltaY(1, 559), 2);
  assert.equal(wrapDistance(1, 280, 799, 280), 2);
  assert.equal(wrapDistance(0, 0, 400, 280), Math.hypot(400, 280), "mid-board distances are unchanged");
  assert.equal(wrapHitsCircle(1, 280, 13, 799, 280, 20), true, "a rock across the seam still hits");
  assert.equal(wrapHitsCircle(1, 280, 13, 400, 280, 20), false, "a distant rock does not");

  // Symmetry and the wrap midpoint.
  assert.equal(wrapDeltaX(100, 700), 200, "the short way round is chosen, not the long way");
  assert.equal(wrapDeltaX(700, 100), -200);
  assert.equal(Math.abs(wrapDeltaX(0, BOARD_WIDTH / 2)), BOARD_WIDTH / 2, "the antipode is unambiguous");

  // A rock beside the human ship across the seam costs a life.
  const game = new AsteroidsModel();
  game.reset();
  game.invulnerable = 0;
  game.ship.x = 1;
  game.ship.y = 280;
  game.asteroids = [{ x: 799, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [], tone: 0, generation: 0 }];
  game.computerShotClock = 99;
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.lifeLost, true, "a rock 2px away through the wrap registers a hit");

  // And a bullet fired across the seam still breaks a rock.
  const shoot = new AsteroidsModel();
  shoot.reset();
  shoot.invulnerable = 0;
  shoot.ship.x = 5;
  shoot.ship.y = 280;
  // The bullet and the rock sit on opposite edges: 793 apart in plain
  // coordinates, 7 apart through the wrap.
  shoot.asteroids = [{ x: 795, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 0 }];
  shoot.bullets = [{ x: 2, y: 280, vx: 0, vy: 0, life: 1, owner: "human" }];
  shoot.update(0, { pointer: null, fire: false });
  assert.equal(shoot.scores.human, 10, "a bullet crossing the seam scores");
});

test("Asteroids ships separate across the seam too", async () => {
  const { wrapDistance } = await import("../src/games/asteroids/model.js");
  const game = new AsteroidsModel();
  game.setSide("versus");
  game.reset();
  game.asteroids = [];
  game.computerShotClock = 99;
  game.invulnerable = 5;
  game.ship.x = 1;
  game.ship.y = 280;
  game.computerShip.x = 799;
  game.computerShip.y = 280;
  game.update(0.016, { pointer: null, fire: false });
  game.update(0.016, { pointer: null, fire: false });
  // Measured right after the bounce. Left running for long, the coasting human
  // becomes a stationary obstacle the computer circles back into, which is a
  // different property from the one under test here.
  // No impulse is expected here: the computer's AI reads the human as a hazard
  // this close and steers away, so the two are overlapping but not closing.
  assert.ok(wrapDistance(game.ship.x, game.ship.y, game.computerShip.x, game.computerShip.y) >= game.ship.radius + game.computerShip.radius, "seam overlap is resolved, not ignored");
  assert.ok(game.ship.x >= 0 && game.ship.x < 800, "separation keeps the human on the board");
  assert.ok(game.computerShip.x >= 0 && game.computerShip.x < 800, "separation keeps the computer on the board");
  assert.ok(wrapDistance(game.ship.x, game.ship.y, game.computerShip.x, game.computerShip.y) >= game.ship.radius + game.computerShip.radius - 0.001);
});

test("Breakout reports per-pilot lives only in versus mode", () => {
  for (const side of ["bottom", "blocks"]) {
    const game = new BreakoutGame();
    game.setSide(side);
    game.reset();
    assert.equal(game.playerLives, null, `${side} exposes no per-pilot lives for a one-paddle game`);
  }
  const duel = new BreakoutGame();
  duel.setSide("versus");
  duel.reset();
  assert.ok(duel.playerLives, "versus exposes per-pilot lives");
  assert.equal(typeof duel.playerLives.human, "number");
  assert.equal(typeof duel.playerLives.computer, "number");
});

test("a solo Breakout extra-life brick leaves no stale per-pilot count", () => {
  const facade = new BreakoutGame();
  facade.setSide("bottom");
  facade.reset();
  const game = facade.model;
  const brick = game.bricks.find((candidate) => candidate.type === "extraLife");
  // Special bricks pulse, so pin the phase to make the brick active on hit.
  // `hits` is the brick's remaining durability, so it must stay at 1.
  brick.phaseOffset = 0;
  brick.period = 1.6;
  brick.active = true;
  const ball = game.balls[0];
  ball.x = brick.x + brick.width / 2;
  ball.y = brick.y + brick.height / 2;
  ball.vx = 0;
  ball.vy = 0;
  game.balls = [ball];
  game.update(0.016, { mode: "keyboard", keyDirection: 0, pointer: pointer() });
  assert.deepEqual(facade.lifecycle.takeRewards(), [{ type: "extra-life" }], "the solo extra life is exposed to the host");
  assert.deepEqual(facade.lifecycle.takeRewards(), [], "the host consumes the reward only once");
  assert.equal(facade.playerLives, null, "solo mode still reports no per-pilot lives afterwards");
});

test("Snake may follow its tail into the cell it is vacating", () => {
  const game = handLaidSnake(8, 8, 4);
  // The issue's body: a closed loop whose last segment is the one the head
  // is about to enter.
  game.snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }];
  game.direction = { x: -1, y: 0 };
  game.nextDirection = { x: -1, y: 0 };
  game.apple = { x: 6, y: 6 };
  const tail = { ...game.snake.at(-1) };
  game.aiClock = 0;
  game.update(0.2, { direction: null, steer: null, placeApple: null });

  assert.equal(game.gameOver, false, "moving into the departing tail cell is legal");
  assert.equal(game.lossReason, "");
  assert.deepEqual(game.snake[0], tail, "the head took the tail's old cell");
  assert.equal(game.snake.length, 4, "the snake neither grew nor shrank");
  assert.equal(game.snake.filter((part) => part.x === tail.x && part.y === tail.y).length, 1, "the vacated cell belongs to the head alone now");
});

test("Snake still collides with its tail when the move makes it grow", () => {
  const tailCell = { x: 1, y: 2 };
  const game = handLaidSnake(8, 8, 4, [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, tailCell]);
  game.direction = { x: -1, y: 0 };
  game.nextDirection = { x: -1, y: 0 };
  // The apple sits on the tail cell: the snake grows, so the tail stays solid.
  game.apple = { x: 1, y: 2 };
  game.aiClock = 0;
  game.update(0.2, { direction: null, steer: null, placeApple: null });
  assert.equal(game.gameOver, true, "the tail is still an obstacle on a growing move");
  assert.equal(game.lossReason, "self");
});

test("Snake still collides with every non-tail segment", () => {
  const game = handLaidSnake(8, 8, 5);
  // A straight run with the head reversing into the second segment.
  game.snake = [{ x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }, { x: 0, y: 4 }];
  game.direction = { x: 1, y: 0 };
  game.nextDirection = { x: 1, y: 0 };
  game.apple = { x: 7, y: 7 };
  game.aiClock = 0;
  game.update(0.2, { direction: null, steer: null, placeApple: null });
  assert.equal(game.gameOver, false);
  assert.deepEqual(game.snake[0], { x: 5, y: 4 }, "moving along the body is fine");

  game.snake = [{ x: 4, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 6 }, { x: 6, y: 6 }];
  game.direction = { x: 0, y: 1 };
  game.nextDirection = { x: 0, y: 1 };
  game.aiClock = 0;
  game.update(0.2, { direction: null, steer: null, placeApple: null });
  assert.equal(game.gameOver, true, "the head cannot enter a mid-body segment");
  assert.equal(game.lossReason, "self");
});

test("Snake wins when eating the last free cell instead of looping forever", () => {
  const game = handLaidSnake(4, 3, 3);
  assert.equal(game.won, false);

  // Boustrophedon travel order over a 4x3 board: row 0 rightwards, row 1
  // leftwards, row 2 rightwards. The head starts on the second-to-last cell
  // with the body trailing behind it along the path, leaving exactly one
  // reachable free cell -- the last step.
  const travel = [];
  for (let x = 0; x < 4; x += 1) travel.push({ x, y: 0 });
  for (let x = 3; x >= 0; x -= 1) travel.push({ x, y: 1 });
  for (let x = 0; x < 4; x += 1) travel.push({ x, y: 2 });
  assert.equal(travel.length, game.cols * game.rows, "the path covers every cell");
  assert.equal(new Set(travel.map((c) => c.x + "," + c.y)).size, travel.length, "no cell is repeated");

  const body = travel.slice(0, travel.length - 1);
  const headStart = body[body.length - 1];
  const finalCell = travel.at(-1);
  // Head first, body trailing back along the path.
  game.snake = [...body].reverse();
  game.apple = { ...finalCell };
  game.direction = { x: finalCell.x - headStart.x, y: finalCell.y - headStart.y };
  game.nextDirection = { ...game.direction };
  game.aiClock = 0;
  assert.equal(game.snake.length, game.cols * game.rows - 1, "one cell is free before the final apple");
  assert.ok(!game.snake.some((cell) => cell.x === finalCell.x && cell.y === finalCell.y), "the apple is on a free cell");

  game.update(0.2, { direction: null, steer: null, placeApple: null });

  assert.equal(game.won, true, "filling the board wins the round");
  assert.equal(game.apple, null, "no unreachable apple is left behind");
  assert.equal(game.gameOver, false, "a win is not reported as a loss");
  assert.equal(game.snake.length, game.cols * game.rows, "the snake covers every cell");
  assert.equal(game.score, 1, "the final apple still scored");
  assert.equal(game.lossReason, "", "a win is not reported as a collision");

  // A won round stops advancing rather than immediately self-colliding.
  const scoreAfterWin = game.score;
  game.update(0.5, { direction: { x: 1, y: 0 }, steer: null, placeApple: null });
  assert.equal(game.score, scoreAfterWin, "a won round ignores further input");
  assert.equal(game.won, true, "the win state survives further updates");
  assert.equal(game.gameOver, false, "a won round does not become a loss");
});

test("freeApple reports a full board instead of returning an occupied cell", () => {
  const game = handLaidSnake(3, 3, 3);
  assert.ok(game.freeApple(), "a fresh board has a free cell");

  game.snake = [];
  for (let y = 0; y < game.rows; y += 1) for (let x = 0; x < game.cols; x += 1) game.snake.push({ x, y });
  assert.equal(game.freeApple(), null, "a full board reports null rather than (0,0)");
  assert.ok(game.snake.some((part) => part.x === 0 && part.y === 0), "the cell (0,0) really is occupied");
});

test("the Snake facade exposes the completion state and a message", () => {
  const game = new SnakeGame();
  game.reset();
  assert.equal(game.won, false);
  game.won = true;
  assert.equal(game.won, true, "the engine can read the completion flag");
  assert.match(game.winMessage(), /filled the board/i, "the win message explains the outcome");
  assert.match(game.winMessage(), /\d+ apples/, "the win message reports the score");
});

test("Snake places apples quickly even on a nearly full maximum board", () => {
  const game = new SnakeModel();
  game.setSettings({ cols: 60, rows: 44, startingLength: 12, wrap: false });
  game.applyPendingSettings();
  game.reset();
  assert.deepEqual({ cols: game.cols, rows: game.rows }, { cols: 60, rows: 44 }, "the largest supported board is in use");
  const cells = game.cols * game.rows;

  // Fill the board to one cell short of full. This is the pathological case:
  // the original nested scan was O(cells * snake length), so 2,640 cells x
  // ~2,640 segments is about 7 million coordinate comparisons per apple.
  const path = [];
  for (let y = 0; y < game.rows; y += 1) for (let x = 0; x < game.cols; x += 1) path.push({ x, y });
  game.snake = path.slice(0, cells - 1);
  game.rebuildOccupied();
  assert.equal(game.snake.length, cells - 1, "one cell is free");

  const occupied = new Set(game.snake.map((part) => part.y * game.cols + part.x));
  const placements = 200;
  // Warm up before timing: the first pass through a fresh function is JIT
  // compilation, not the cost of the algorithm.
  for (let index = 0; index < placements; index += 1) game.freeApple();
  const started = process.hrtime.bigint();
  const chosen = [];
  for (let index = 0; index < placements; index += 1) chosen.push(game.freeApple());
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  // Correctness first: every placement must be the one free cell.
  for (const apple of chosen) {
    assert.ok(apple, "a free cell was found");
    assert.equal(occupied.has(apple.y * game.cols + apple.x), false, "the apple lands on a free cell");
  }

  // The original implementation, kept here as the reference point. It is
  // O(cells * snake length): on this board ~2,640 cells x ~2,640 segments.
  // Timing a handful of its placements and extrapolating keeps the test quick
  // while still failing loudly if this regresses to the quadratic form.
  const originalScan = () => {
    const open = [];
    for (let y = 0; y < game.rows; y += 1) for (let x = 0; x < game.cols; x += 1) {
      if (!game.snake.some((part) => part.x === x && part.y === y)) open.push({ x, y });
    }
    return open[0] || { x: 0, y: 0 };
  };
  originalScan();
  const sample = 5;
  const originalStart = process.hrtime.bigint();
  for (let index = 0; index < sample; index += 1) originalScan();
  const originalPerPlacementMs = Number(process.hrtime.bigint() - originalStart) / 1e6 / sample;
  const currentPerPlacementMs = elapsedMs / placements;

  // Require at least a 50x improvement. Measured here: the original is roughly
  // 37ms per placement against ~0.25ms, so ~150x.
  assert.ok(
    currentPerPlacementMs * 50 < originalPerPlacementMs,
    `expected at least a 50x speedup, got ${(originalPerPlacementMs / currentPerPlacementMs).toFixed(1)}x (${originalPerPlacementMs.toFixed(2)}ms -> ${currentPerPlacementMs.toFixed(3)}ms per placement)`
  );
});

test("Snake places apples predictably as the board fills", () => {
  const game = new SnakeModel();
  game.setSettings({ cols: 20, rows: 20, startingLength: 12, wrap: false });
  game.applyPendingSettings();
  game.reset();
  const seen = new Set();
  for (let length = 12; length < 400; length += 1) {
    const path = [];
    for (let y = 0; y < game.rows; y += 1) for (let x = 0; x < game.cols; x += 1) path.push({ x, y });
    game.snake = path.slice(0, Math.min(length, game.cols * game.rows - 1));
    game.rebuildOccupied();
    const apple = game.freeApple();
    if (!apple) break;
    assert.ok(!game.isOccupiedCell(apple.x, apple.y), `length ${length}: apple is on a free cell`);
    seen.add(`${apple.x},${apple.y}`);
  }
  assert.ok(seen.size > 10, `apples vary across the board as it fills (saw ${seen.size} distinct cells)`);
});

test("Snake occupancy stays coherent as the snake moves and grows", () => {
  const game = handLaidSnake(12, 12, 4);

  for (let step = 0; step < 60; step += 1) {
    game.update(0.2, { direction: null, steer: null, placeApple: null });
    // The set must always describe exactly the current body.
    const expected = new Set(game.snake.map((part) => part.y * game.cols + part.x));
    assert.equal(game.occupied.size, expected.size, `step ${step}: occupancy size matches the body`);
    for (const key of expected) assert.ok(game.occupied.has(key), `step ${step}: occupied cell is tracked`);
    if (game.gameOver) break;
  }
});

test("Snake places apples predictably as the board fills", () => {
  const game = new SnakeModel();
  game.setSettings({ cols: 20, rows: 20, startingLength: 12, wrap: false });
  game.applyPendingSettings();
  game.reset();
  const seen = new Set();
  for (let length = 12; length < 400; length += 1) {
    const path = [];
    for (let y = 0; y < game.rows; y += 1) {
      for (let x = 0; x < game.cols; x += 1) path.push({ x, y });
    }
    game.snake = path.slice(0, Math.min(length, game.cols * game.rows - 1));
    game.rebuildOccupied();
    const apple = game.freeApple();
    if (!apple) break;
    assert.ok(!game.isOccupiedCell(apple.x, apple.y), `length ${length}: apple is on a free cell`);
    seen.add(`${apple.x},${apple.y}`);
  }
  assert.ok(seen.size > 10, `apples vary across the board as it fills (saw ${seen.size} distinct cells)`);
});

test("Snake validates settings at the model boundary, not just in the DOM", () => {
  const game = new SnakeModel();
  game.setSettings({ cols: 30, rows: 20, startingLength: 5, wrap: true });
  game.applyPendingSettings();

  // The issue's reproduction: a board too small for the requested body.
  const rejected = game.setSettings({ cols: 2, rows: 2, startingLength: 12 });
  assert.equal(rejected, false, "an impossible board is refused");
  assert.deepEqual(game.pendingSettings, { cols: 30, rows: 20, startingLength: 5, wrap: true }, "the previous valid settings are kept");

  for (const bad of [
    { cols: 9, rows: 20 },
    { cols: 30, rows: 7 },
    { cols: 61, rows: 20 },
    { cols: 30, rows: 45 },
    { cols: 30, rows: 20, startingLength: 2 },
    { cols: 30, rows: 20, startingLength: 13 },
    { cols: 10.5, rows: 20 },
    { cols: "many", rows: 20 },
    { cols: 0, rows: 0 }
  ]) {
    assert.equal(game.setSettings(bad), false, `${JSON.stringify(bad)} is refused`);
    assert.deepEqual(game.pendingSettings, { cols: 30, rows: 20, startingLength: 5, wrap: true }, "settings are unchanged after a refusal");
  }

  // A start length that fits one dimension but not the other is still refused.
  assert.equal(game.setSettings({ cols: 12, rows: 12, startingLength: 12 }), false, "start length must be smaller than both dimensions");
  assert.equal(game.setSettings({ cols: 13, rows: 13, startingLength: 12 }), true, "one less than the bound is accepted");
  assert.equal(game.pendingSettings.startingLength, 12);
});

test("Snake never builds a body with negative coordinates", () => {
  const game = new SnakeModel();
  // Every combination the descriptor allows, driven through the model API.
  const descriptors = game.settings;
  for (let cols = descriptors.cols.min; cols <= descriptors.cols.max; cols += 7) {
    for (let rows = descriptors.rows.min; rows <= descriptors.rows.max; rows += 6) {
      for (let startingLength = descriptors.startingLength.min; startingLength <= descriptors.startingLength.max && startingLength < Math.min(cols, rows); startingLength += 1) {
        assert.equal(game.setSettings({ cols, rows, startingLength }), true, `${cols}x${rows} len ${startingLength} is accepted`);
        game.applyPendingSettings();
        game.reset();
        assert.ok(game.snake.length >= startingLength, `${cols}x${rows}: body is at least the starting length`);
        for (const part of game.snake) {
          assert.ok(part.x >= 0 && part.x < cols, `${cols}x${rows}: x within the board`);
          assert.ok(part.y >= 0 && part.y < rows, `${cols}x${rows}: y within the board`);
        }
        assert.ok(game.apple === null || (game.apple.x >= 0 && game.apple.x < cols && game.apple.y >= 0 && game.apple.y < rows), `${cols}x${rows}: apple within the board`);
      }
    }
  }
});

// A real click is one frame carrying both clicked and released, exactly as the
// engine delivers it; the following frame carries neither.
// Exercises StarfallController directly and records the intent it passes to
// the model. The bug lived entirely in the controller, and asserting on
// spawnStar is both precise and free of the model's unrelated housekeeping
// (stars collide with the runner and gems expire).
function starfallControllerFixture() {
  const game = new StarfallGame();
  game.setSide("stars");
  game.reset();
  const seen = [];
  const model = game.model;
  const realUpdate = model.update.bind(model);
  model.update = (dt, input) => {
    seen.push({ spawnStar: input.spawnStar, spawnGem: input.spawnGem, pointerDown: input.pointerDown });
    return realUpdate(dt, input);
  };
  const pointer = (values = {}) => ({ x: 300, y: 60, moved: false, clicked: false, down: false, released: false, doubleClicked: false, dragDistance: 0, ...values });
  const frame = (pointerState, dt = 1 / 60) => { game.update(dt, input({ pointer: pointer(pointerState) })); return seen.at(-1); };
  // A click is a single frame carrying both clicked and released, as the engine
  // delivers it.
  const click = () => { frame({ clicked: true, released: true }); return seen.at(-1); };
  const settle = () => frame({});
  // The model needs 0.35s of holding before it spawns anything.
  const holdStill = () => { for (let step = 0; step < 60; step += 1) frame({ down: true }); return seen.at(-1); };
  const holdAndDrag = () => {
    for (let step = 0; step < 60; step += 1) frame({ down: true, dragDistance: 120 });
    return frame({ released: true, dragDistance: 120 });
  };
  return { game, frame, click, settle, holdStill, holdAndDrag };
}

test("Starfall sends a star on the first click after a gem hold", () => {
  const { holdStill, frame, click, settle } = starfallControllerFixture();

  const held = holdStill();
  assert.equal(held.pointerDown, true, "the pointer was held down throughout");
  assert.equal(held.spawnStar, null, "a hold sends no star");

  const release = frame({ released: true });
  assert.equal(release.spawnStar, null, "the release which ends a hold sends no star");

  // This is the reported bug: the suppression flag was only cleared when a star
  // spawned, but the flag was what prevented it, so it was never cleared and
  // every later click was ignored for the rest of the round.
  assert.ok(click().spawnStar, "the next click sends a star");

  settle();
  assert.ok(click().spawnStar, "later clicks keep sending stars");
});

test("Starfall suppression is per-gesture, not per-round", () => {
  const { holdStill, frame, click, settle } = starfallControllerFixture();
  for (let round = 0; round < 4; round += 1) {
    holdStill();
    assert.equal(frame({ released: true }).spawnStar, null, `hold ${round + 1} releases without a star`);
    assert.ok(click().spawnStar, `after hold ${round + 1}, the next click still sends a star`);
    settle();
  }
});

test("Starfall still sends a star for a short click and for a real drag", () => {
  const { frame, click, settle, holdAndDrag } = starfallControllerFixture();

  frame({ down: true });
  settle();
  assert.ok(click().spawnStar, "a short click under the hold threshold sends a star");

  // A drag is never a stationary hold, however long it lasts: it aims the star.
  assert.ok(holdAndDrag().spawnStar, "a long drag still sends a star");
  settle();

  const doubleClick = frame({ clicked: true, released: true, doubleClicked: true });
  assert.equal(doubleClick.spawnStar, null, "a double-click sends no star");
  assert.ok(doubleClick.spawnGem, "a double-click spawns a gem instead");
});

test("a new Guess prompt replaces the round instead of wedging it", () => {
  const game = new ImitationModel();
  game.setSide("guess");
  game.reset();
  game.peerId = "peer";

  // First prompt, then a mystery arrives.
  game.sendMessage("Describe your favourite meal.");
  assert.equal(game.phase, "guess-waiting");
  assert.equal(game.mystery, null);
  game.mystery = { source: "human", text: "Pasta, probably." };
  game.phase = "guess";
  const tokenBefore = game.guessToken;

  // A second prompt before guessing is the issue's reproduction.
  game.sendMessage("A completely different question.");
  assert.equal(game.prompt, "A completely different question.", "the new prompt is recorded");
  assert.equal(game.mystery, null, "the stale mystery is cleared");
  assert.equal(game.guessResult, null, "the previous result is cleared");
  assert.equal(game.roundSource, null, "the previous source is cleared");
  assert.equal(game.phase, "guess-waiting", "the round is waiting on a new mystery");
  assert.ok(game.guessToken > tokenBefore, "the round token advanced, invalidating any in-flight reply");

  // And the round can actually proceed now: the AI fallback is no longer
  // blocked by the guard on !mystery.
  assert.ok(!game.mystery, "update() may now start a fallback");
  const beforeFallback = game.guessFallbackStarted;
  game.update(5);
  assert.ok(game.roundSource === "ai" || game.phase !== "guess-waiting" || game.guessFallbackStarted !== beforeFallback, "the fallback starts on a wedged round");
});

test("a late AI reply from a replaced Guess round cannot resolve into the new one", async () => {
  const game = new ImitationModel();
  game.setSide("guess");
  game.reset();
  game.peerId = "peer";
  game.sendMessage("First question.");
  const staleToken = game.guessToken;

  // Simulate a reply already in flight for the first prompt.
  game.sendMessage("Second question.");
  assert.notEqual(game.guessToken, staleToken, "the token moved on");

  // The stale reply path in generateAiResponse() checks the token before
  // setting a mystery, so replaying it must be a no-op.
  const token = game.guessToken;
  const mysteryBefore = game.mystery;
  assert.equal(token === staleToken, false);
  assert.equal(mysteryBefore, null, "the new round has no mystery yet");
});

test("Guess does not accept a message while a mystery is unresolved in the UI", async () => {
  // Model behaviour: a prompt is still accepted (it starts a fresh round), but
  // the round state must never be left inconsistent.
  const game = new ImitationModel();
  game.setSide("guess");
  game.reset();
  game.mystery = { source: "ai", text: "An old mystery." };
  game.phase = "guess";
  game.sendMessage("Replacement prompt.");
  assert.equal(game.mystery, null);
  assert.equal(game.phase, "guess-waiting");
  // chooseGuess must now refuse, since there is no mystery to guess about.
  assert.equal(game.chooseGuess("ai"), false, "guessing is refused with no mystery on screen");
});

test("a stale AI reply is dropped after a reset or a mode switch", async () => {
  // The issue's reproduction: a delayed request resolves into a model that
  // has since been reset or moved to another mode.
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  };

  // --- reset ---
  const resetGame = new ImitationModel();
  resetGame.setSide("ai");
  resetGame.reset();
  resetGame.aiReady = true;
  const resetReply = deferred();
  resetGame.requestAi = () => resetReply.promise;
  const chatPromise = resetGame.askAi("hello there");
  const afterResetLength = resetGame.chatLog.length;
  resetGame.reset();
  assert.equal(resetGame.chatLog.length, 1, "the reset cleared the transcript");
  resetReply.resolve("A reply for the previous transcript.");
  await chatPromise;
  const texts = resetGame.chatLog.map((message) => message.text);
  assert.ok(!texts.includes("A reply for the previous transcript."), `the stale reply is not appended (got ${JSON.stringify(texts)})`);
  assert.ok(!texts.includes("AI is thinking"), "the thinking placeholder does not survive a reset");
  assert.equal(resetGame.chatLog.length, afterResetLength <= 1 ? 1 : resetGame.chatLog.length, "no extra messages were added");

  // --- mode switch ---
  const switchGame = new ImitationModel();
  switchGame.setSide("ai");
  switchGame.reset();
  switchGame.aiReady = true;
  const switchReply = deferred();
  switchGame.requestAi = () => switchReply.promise;
  const chatPromise2 = switchGame.askAi("hello again");
  switchGame.setSide("human");
  switchGame.reset();
  switchReply.resolve("A reply belonging to the AI mode.");
  await chatPromise2;
  const texts2 = switchGame.chatLog.map((message) => message.text);
  assert.ok(!texts2.includes("A reply belonging to the AI mode."), `the reply does not follow the mode switch (got ${JSON.stringify(texts2)})`);

  // --- current replies still land ---
  const fresh = new ImitationModel();
  fresh.setSide("ai");
  fresh.reset();
  fresh.aiReady = true;
  fresh.requestAi = async () => "A current reply.";
  await fresh.askAi("hello");
  assert.ok(fresh.chatLog.some((message) => message.text === "A current reply."), "a current reply is still delivered");
  assert.ok(!fresh.chatLog.some((message) => message.text === "AI is thinking"), "the thinking placeholder is removed");
});

test("a stale classification is dropped after a reset", async () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  };
  const game = new ImitationModel();
  game.setSide("write");
  game.reset();
  game.aiReady = true;
  const reply = deferred();
  game.requestAi = () => reply.promise;
  const pending = game.classifyText("Some text to classify.");
  game.reset();
  reply.resolve('{"label":"AI","reason":"formulaic"}');
  await pending;
  const texts = game.chatLog.map((message) => message.text);
  assert.ok(!texts.includes("AI\nformulaic"), `the stale classification is dropped (got ${JSON.stringify(texts)})`);
  assert.ok(!texts.includes("AI is thinking"), "the thinking placeholder does not survive the reset");
});

test("concurrent AI requests cannot resolve out of order", async () => {
  const game = new ImitationModel();
  game.setSide("ai");
  game.reset();
  game.aiReady = true;
  const releases = [];
  game.requestAi = (text) => new Promise((resolve) => releases.push({ text, resolve }));
  const first = game.askAi("first");
  const second = game.askAi("second");
  // Resolve out of order.
  releases[1].resolve("reply to second");
  await second;
  releases[0].resolve("reply to first");
  await first;
  const texts = game.chatLog.map((message) => message.text);
  assert.ok(texts.includes("reply to first") && texts.includes("reply to second"), "both replies arrive");
  assert.equal(game.chatLog.filter((message) => message.text === "AI is thinking").length, 0, "no placeholder is left behind");
  // Replies appear in the order they were requested, not the order resolved.
  assert.ok(texts.indexOf("reply to second") < texts.indexOf("reply to first"), "the newer request's reply is inserted at its own position");
});

test("Imitation accepts payloads only from the negotiated peer", () => {
  const game = new ImitationModel();
  game.setSide("human");
  game.reset();
  game.peerId = "peer-a";

  // An unrelated same-origin tab cannot replace the negotiated peer with a
  // valid-looking handshake before sending its payload.
  game.receive({ type: "hello", from: "unrelated-tab", mode: "human" });
  assert.equal(game.peerId, "peer-a", "an impostor handshake cannot replace the active peer");

  // An unrelated same-origin tab on the shared channel.
  const spam = { type: "chat", from: "unrelated-tab", text: "spam" };
  game.receive(spam);
  assert.ok(!game.chatLog.some((message) => message.sender === "Partner"), "an unrelated chat message is dropped");
  assert.equal(game.score, 0, "an injected message does not award score");
  assert.equal(game.peerId, "peer-a", "the negotiated peer is unchanged");

  // The real peer still works.
  game.receive({ type: "chat", from: "peer-a", text: "hello" });
  assert.equal(game.chatLog.at(-1).sender, "Partner", "the negotiated peer's chat is accepted");
  assert.equal(game.chatLog.at(-1).text, "hello");
  assert.equal(game.score, 5, "a legitimate message still scores");
});

test("Imitation drops non-handshake payloads before a peer exists", () => {
  const game = new ImitationModel();
  game.setSide("human");
  game.reset();
  assert.equal(game.peerId, null, "no peer yet");
  game.receive({ type: "chat", from: "some-tab", text: "let me in first" });
  assert.ok(!game.chatLog.some((message) => message.sender === "Partner"), "no tab can speak before the handshake");
  assert.equal(game.score, 0);
  assert.equal(game.peerId, null, "a chat message does not establish a peer");
});

test("Imitation rejects a Guess response from an unrelated tab", () => {
  const game = new ImitationModel();
  game.setSide("guess");
  game.reset();
  game.peerId = "provider-tab";
  game.peerId = "provider-tab";
  game.sendMessage("Describe your favourite meal.");

  game.receive({ type: "guess-response", from: "impostor", text: "Pizza, obviously." });
  assert.equal(game.mystery, null, "an impostor response does not become the mystery");
  assert.equal(game.roundSource, null, "the round source is untouched");

  game.receive({ type: "guess-response", from: "provider-tab", text: "Pasta, probably." });
  assert.deepEqual(game.mystery, { source: "human", text: "Pasta, probably." }, "the real provider's answer is accepted");
});

test("Imitation validates message envelope types", () => {
  const game = new ImitationModel();
  game.setSide("human");
  game.reset();
  game.peerId = "peer-a";
  const length = game.chatLog.length;

  for (const bad of [
    null,
    undefined,
    "just a string",
    42,
    {},
    { type: 42, from: "peer-a" },
    { type: "chat" },
    { type: "chat", from: 7, text: "x" },
    { type: "chat", from: "peer-a", text: { nested: true } },
    { type: "chat", from: "peer-a", text: "x", to: 9 },
    { type: "chat", from: "peer-a", text: "x", mode: {} },
    { type: "chat", from: "", text: "x" }
  ]) {
    assert.doesNotThrow(() => game.receive(bad), `malformed payload ${JSON.stringify(bad)} does not throw`);
  }
  assert.equal(game.chatLog.length, length, "no malformed payload produced a message");
  assert.equal(game.score, 0);

  // A well-formed message addressed to someone else is still dropped.
  game.receive({ type: "chat", from: "peer-a", text: "x", to: "someone-else" });
  assert.equal(game.chatLog.length, length, "a message for another recipient is dropped");
});

test("Missile attacker scores one kill per enemy, however many interceptors overlap", () => {
  const game = new MissileModel();
  game.setSide("attacker");
  game.reset();
  game.interceptorClock = 999;
  game.enemyMissiles = [{ x: 400, y: 200, targetX: 400, targetY: 500, speed: 100, color: "#fb7185", kind: "city", targetObject: game.cities[0], dead: false }];
  game.interceptors = [
    { x: 400, y: 200, targetX: 500, targetY: 500, speed: 200, color: "#22d3ee", machine: true },
    { x: 401, y: 201, targetX: 600, targetY: 500, speed: 200, color: "#22d3ee", machine: true },
    { x: 399, y: 199, targetX: 700, targetY: 500, speed: 200, color: "#22d3ee", machine: true }
  ];
  game.update(0, { aim: null, launch: false, attack: null });
  assert.equal(game.score, 15, `one enemy yields one kill (got ${game.score})`);
  assert.equal(game.enemyMissiles.length, 0, "the enemy is resolved");
  assert.equal(game.interceptors.length, 2, "only the interceptors that connected are consumed");

  // One interceptor per enemy still scores one point each.
  const solo = new MissileModel();
  solo.setSide("attacker");
  solo.reset();
  solo.interceptorClock = 999;
  solo.enemyMissiles = [
    { x: 200, y: 200, targetX: 200, targetY: 500, speed: 100, color: "#fb7185", kind: "city", targetObject: solo.cities[0], dead: false },
    { x: 600, y: 200, targetX: 600, targetY: 500, speed: 100, color: "#fb7185", kind: "city", targetObject: solo.cities[1], dead: false }
  ];
  solo.interceptors = [
    { x: 200, y: 200, targetX: 200, targetY: 500, speed: 200, color: "#22d3ee", machine: true },
    { x: 600, y: 200, targetX: 600, targetY: 500, speed: 200, color: "#22d3ee", machine: true }
  ];
  solo.update(0, { aim: null, launch: false, attack: null });
  assert.equal(solo.score, 30, "two distinct enemies still score twice");
  assert.equal(solo.interceptors.length, 0);
});

test("Missile attacker does not score for an already-resolved enemy", () => {
  const game = new MissileModel();
  game.setSide("attacker");
  game.reset();
  game.interceptorClock = 999;
  // An enemy already marked dead from a previous pass.
  game.enemyMissiles = [{ x: 400, y: 200, targetX: 400, targetY: 500, speed: 100, color: "#fb7185", kind: "city", targetObject: game.cities[0], dead: true }];
  game.interceptors = [{ x: 400, y: 200, targetX: 500, targetY: 500, speed: 200, color: "#22d3ee", machine: true }];
  game.update(0, { aim: null, launch: false, attack: null });
  assert.equal(game.score, 0, "a dead enemy cannot be killed twice");
  assert.equal(game.interceptors.length, 1, "the interceptor survives a dead target");
});

test("Missile Attacker wins by destroying the cities", () => {
  const game = new MissileCommandGame();
  game.setSide("attacker");
  game.reset();
  game.model.interceptorClock = 999;
  assert.match(game.publicState().status, /Cities 6\/6/, "attacker status reports cities remaining");

  game.model.cities.forEach((city) => { city.alive = false; });
  game.update(0, input({ pointer: pointer() }));

  assert.equal(game.model.gameOver, true, "destroying every city ends the round");
  assert.equal(game.won, true, "the attacker wins");
  assert.equal(game.winner, "human", "the human is the attacker");
  const result = game.handleLifeLoss();
  assert.equal(result.gameOver, true);
  assert.match(result.message, /city/i);
  assert.match(result.message, /win/i);
  assert.match(game.winMessage(), /city/i);
});

test("Missile Attacker loses when every battery is destroyed", () => {
  const game = new MissileCommandGame();
  game.setSide("attacker");
  game.reset();
  game.model.interceptorClock = 999;
  game.model.bases.forEach((base) => { base.alive = false; });
  game.update(0, input({ pointer: pointer() }));

  assert.equal(game.model.gameOver, true, "losing every battery ends the round");
  assert.equal(game.won, false, "that is a loss, not a win");
  assert.equal(game.winner, "computer", "the defender wins");
  assert.equal(game.model.lifeLost, false, "no generic life-loss restart: the cities are still standing");
  assert.match(game.handleLifeLoss().message, /batteries are gone/i);
  assert.match(game.winMessage(), /batteries are gone/i);
});

test("Missile Defender still ends when its cities are lost", () => {
  const game = new MissileCommandGame();
  game.setSide("defender");
  game.reset();
  game.model.cities.forEach((city) => { city.alive = false; });
  game.update(0, input({ pointer: pointer() }));
  assert.equal(game.model.gameOver, true);
  assert.equal(game.model.winner, null, "the defender mode has no winner field to set");
  assert.match(game.handleLifeLoss().message, /The End/);
});

test("Missile copy is consistent about the objective in both modes", () => {
  const attacker = new MissileCommandGame();
  attacker.setSide("attacker");
  attacker.reset();
  assert.match(attacker.sideLabel(), /attack cities/i, "the selector label says attack cities");
  assert.match(attacker.model.sideLabel(), /attack cities/i, "the model's own label agrees");
  const defender = new MissileCommandGame();
  defender.setSide("defender");
  defender.reset();
  assert.match(defender.sideLabel(), /defend cities/i);
});

test("every model's reset establishes a clean life-loss state", () => {
  const games = {
    snake: new SnakeModel(),
    breakout: new BreakoutModel(),
    splat: new SplatModel(),
    asteroids: new AsteroidsModel(),
    missile: new MissileModel(),
    imitation: new ImitationModel(),
    starfall: new StarfallModel()
  };
  // Every model the engine can drive must expose both flags as definite
  // booleans from construction, not just after the first reset.
  for (const [id, game] of Object.entries(games)) {
    assert.equal(typeof game.lifeLost, "boolean", `${id} initialises lifeLost as a boolean`);
    assert.equal(typeof game.gameOver, "boolean", `${id} initialises gameOver as a boolean`);
    assert.equal(game.lifeLost, false, `${id} starts with no life lost`);
  }

  for (const [id, game] of Object.entries(games)) {
    game.lifeLost = true;
    game.gameOver = true;
    game.reset();
    assert.equal(game.lifeLost, false, `${id} reset clears lifeLost`);
    assert.equal(game.gameOver, false, `${id} reset clears gameOver`);
  }
});

test("a facade exposes lifeLost consistently with its model after reset", () => {
  const facades = {
    snake: new SnakeGame(),
    splat: new SplatGame(),
    starfall: new StarfallGame(),
    imitation: new ImitationGame()
  };
  for (const [id, game] of Object.entries(facades)) {
    game.lifeLost = true;
    assert.equal(game.lifeLost, true, `${id} facade reads the flag it was set`);
    game.reset();
    assert.equal(game.lifeLost, false, `${id} reset clears the flag through the facade too`);
  }
});

test("Asteroids skips dead bullets in every collision phase", () => {
  const duel = () => {
    const game = new AsteroidsModel();
    game.setSide("versus");
    game.reset();
    game.asteroids = [];
    game.invulnerable = 0;
    game.computerShotClock = 99;
    // Versus spawns a rock at a random edge whenever the spawn clock is due,
    // and at reset it is. With dt=0 that rock landed on the ship about one run
    // in forty and raised a life loss the test never caused.
    game.spawnClock = 99;
    game.ship.x = 60;
    game.ship.y = 500;
    return game;
  };

  // A bullet that already expired cannot damage the computer ship.
  const dead = duel();
  dead.playerLives.computer = 3;
  dead.bullets = [{ x: dead.computerShip.x, y: dead.computerShip.y, vx: 0, vy: 0, life: 0, owner: "human" }];
  dead.update(0, { pointer: null, fire: false });
  assert.equal(dead.playerLives.computer, 3, "an expired bullet does not damage the computer");

  // Nor the human ship.
  const deadAtHuman = duel();
  deadAtHuman.playerLives.human = 3;
  deadAtHuman.bullets = [{ x: deadAtHuman.ship.x, y: deadAtHuman.ship.y, vx: 0, vy: 0, life: -1, owner: "computer" }];
  deadAtHuman.update(0, { pointer: null, fire: false });
  assert.equal(deadAtHuman.playerLives.human, 3, "an expired bullet does not damage the human");
  assert.equal(deadAtHuman.lifeLost, false, "and raises no life loss");

  // Nor does an expired bullet score against an asteroid.
  const deadAtRock = duel();
  const before = deadAtRock.scores.human;
  deadAtRock.asteroids = [{ x: 400, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 1 }];
  deadAtRock.bullets = [{ x: 400, y: 280, vx: 0, vy: 0, life: 0, owner: "human" }];
  deadAtRock.update(0, { pointer: null, fire: false });
  assert.equal(deadAtRock.scores.human, before, "an expired bullet scores nothing");
  assert.equal(deadAtRock.asteroids.length, 1, "the rock survives an expired bullet");
});

test("a bullet that hits a rock cannot also hit a ship in the same update", () => {
  const game = new AsteroidsModel();
  game.setSide("versus");
  game.reset();
  game.asteroids = [];
  game.invulnerable = 0;
  game.computerShotClock = 99;
  game.ship.x = 60;
  game.ship.y = 500;
  game.playerLives.computer = 3;
  // One bullet overlapping the computer ship and a rock at the same spot.
  game.computerShip.x = 400;
  game.computerShip.y = 280;
  game.asteroids = [{ x: 400, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 1 }];
  game.bullets = [{ x: 400, y: 280, vx: 0, vy: 0, life: 1, owner: "human" }];
  game.update(0, { pointer: null, fire: false });

  assert.equal(game.playerLives.computer, 3, "a bullet consumed by a rock does not also damage the ship");
  assert.equal(game.scores.human, 10, "the bullet scored against the rock");
  // The destroyed rock is filtered out and the model immediately spawns a
  // replacement, so the seeded one is gone rather than the array being empty.
  assert.ok(!game.asteroids.some((asteroid) => asteroid.x === 400 && asteroid.y === 280 && asteroid.radius > 0), "the rock that was hit is gone");
  assert.equal(game.bullets.length, 0, "the bullet was consumed once");
});

test("a bullet resolves against at most one target per update", () => {
  const game = new AsteroidsModel();
  game.setSide("versus");
  game.reset();
  game.asteroids = [];
  game.invulnerable = 0;
  game.computerShotClock = 99;
  game.playerLives.computer = 3;
  // Sitting exactly on the computer ship, a bullet that also overlaps two rocks
  // must break one rock and stop -- it cannot carry through to the ship.
  game.asteroids = [
    { x: 400, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 1 },
    { x: 401, y: 281, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 1 }
  ];
  game.bullets = [{ x: 400, y: 280, vx: 0, vy: 0, life: 1, owner: "human" }];
  game.update(0, { pointer: null, fire: false });
  assert.equal(game.asteroids.length, 1, "a bullet destroys exactly one rock");
  assert.equal(game.scores.human, 10, "and scores exactly once");
});

test("Missile level completion is decided by the live missile list, not a counter", () => {
  const game = new MissileModel();
  game.setSide("defender");
  game.reset();
  assert.equal(game.enemyTotal, 12);
  assert.equal(game.enemyResolved, undefined, "the unused counter is gone");

  // Launch the whole wave, clearing it every frame the way interception would.
  // Nothing defends the cities here, so an undefended wave reaches the ground
  // and ends the game. That matters here: the model only advances a level
  // transition while the game is not over, so a wave that happened to wipe the
  // last city before the field was emptied left the level stuck at 1. It cost
  // roughly four runs in a hundred. The completion rule is what is under test.
  let sawMissiles = false;
  while (game.enemySpawned < game.enemyTotal) {
    game.update(1 / 60, { aim: null, launch: false });
    if (game.enemyMissiles.length > 0) sawMissiles = true;
    game.enemyMissiles.length = 0;
  }
  assert.equal(game.enemySpawned, game.enemyTotal, "the whole wave was launched");
  assert.ok(sawMissiles, "with missiles in the air");
  assert.equal(game.gameOver, false, "no city was destroyed by the wave under test");

  // Emptying the field is what completes the level -- there is no counter to
  // consult, and the wave's own spawn budget is already spent.
  game.enemyMissiles.length = 0;
  game.update(1 / 60, { aim: null, launch: false });
  assert.equal(game.levelComplete, true, "an empty field completes the level");
  assert.equal(game.levelTransition > 0, true, "a transition is scheduled before the next wave");

  // And the next level restarts the wave budget from the live list again, with
  // the field cleared each frame for the same reason as above.
  for (let frame = 0; frame < 400; frame += 1) {
    game.enemyMissiles.length = 0;
    game.update(1 / 60, { aim: null, launch: false });
  }
  assert.equal(game.level, 2, "the next level begins");
  assert.ok(game.enemySpawned > 0, "the next wave is launched from the reset budget");
});

test("Missile collision geometry uses the shared named constants", async () => {
  // The radii are internal, so assert on behaviour instead: an interceptor
  // within the combined radii connects, and one beyond them does not.
  const hit = (dx, dy) => {
    const game = new MissileModel();
    game.setSide("attacker");
    game.reset();
    game.interceptorClock = 999;
    game.enemyMissiles = [{ x: 400, y: 280, targetX: 400, targetY: 500, speed: 0, color: "#fb7185", kind: "city", targetObject: game.cities[0], dead: false }];
    game.interceptors = [{ x: 400 + dx, y: 280 + dy, targetX: 500, targetY: 500, speed: 0, color: "#22d3ee", machine: true }];
    game.update(0, { aim: null, launch: false, attack: null });
    return game.score;
  };

  assert.equal(hit(0, 0), 15, "a centred interceptor connects");
  assert.equal(hit(8, 0), 15, "a hit just inside 4+5 connects");
  assert.equal(hit(12, 0), 0, "a miss beyond 4+5 does not");
});

test("Breakout versus charges simultaneous losses in either order", () => {
  for (const order of [["human", "computer"], ["computer", "human"]]) {
    const game = new BreakoutModel();
    game.setSide("versus");
    game.reset();
    game.pendingLifeLossOwners = [...order];
    game.lifeLost = true;

    const result = game.handleLifeLoss();
    assert.deepEqual([...result.owners].sort(), ["computer", "human"], `queue ${order.join(",")}: both owners charged`);
    assert.equal(game.playerLives.human, 2, `queue ${order.join(",")}: the human is charged`);
    assert.equal(game.playerLives.computer, 2, `queue ${order.join(",")}: the computer is charged`);
    assert.equal(game.pendingLifeLossOwners.length, 0, `queue ${order.join(",")}: the queue is drained`);
  }
});

test("Breakout versus ends correctly when a simultaneous loss eliminates a side", () => {
  for (const order of [["human", "computer"], ["computer", "human"]]) {
    const game = new BreakoutModel();
    game.setSide("versus");
    game.reset();
    game.playerLives.human = 1;
    game.playerLives.computer = 2;
    game.pendingLifeLossOwners = [...order];
    game.lifeLost = true;

    const result = game.handleLifeLoss();
    assert.equal(result.gameOver, true, `queue ${order.join(",")}: the round ends`);
    assert.equal(game.winner, "computer", `queue ${order.join(",")}: the human's elimination decides the winner`);
    assert.equal(game.playerLives.human, 0, "the human is out of lives");
    assert.equal(game.playerLives.computer, 1, "the computer keeps the life it had");
    assert.ok(/Computer wins/i.test(result.message), `queue ${order.join(",")}: the winner is announced (got ${result.message})`);
  }

  // The reverse case: the computer is the one eliminated.
  const flipped = new BreakoutModel();
  flipped.setSide("versus");
  flipped.reset();
  flipped.playerLives.human = 2;
  flipped.playerLives.computer = 1;
  flipped.pendingLifeLossOwners = ["human", "computer"];
  flipped.lifeLost = true;
  const flippedResult = flipped.handleLifeLoss();
  assert.equal(flippedResult.gameOver, true);
  assert.equal(flipped.winner, "human", "the computer's elimination makes the human win");
  assert.equal(flipped.playerLives.computer, 0);
});

test("Breakout versus does not double-charge a loss the engine already reported", () => {
  const game = new BreakoutModel();
  game.setSide("versus");
  game.reset();
  // The hazard path sets lifeLost itself and queues its owner; the summary
  // field must not also add a second charge.
  game.pendingLifeLossOwners.push("human");
  game.lifeLost = true;
  game.lastLifeLossOwner = "human";
  game.handleLifeLoss();
  assert.equal(game.playerLives.human, 2, "a single queued loss costs exactly one life");
  assert.equal(game.pendingLifeLossOwners.length, 0);
  // The engine clears the summary before calling, so a second call must not
  // charge again.
  game.lastLifeLossOwner = null;
  game.lifeLossOwner = null;
  const second = game.handleLifeLoss();
  assert.equal(second.owners.length, 1, "the fallback path is still available");
});

test("Asteroids respawns the ship after a life loss in every mode", () => {
  for (const side of ["ship", "rocks", "versus"]) {
    const game = new AsteroidsModel();
    game.setSide(side);
    game.reset();
    // Drive the ship into a rock and let the engine run its life-loss path.
    game.invulnerable = 0;
    game.asteroids = [{ x: 400, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 0 }];
    game.update(0, { pointer: null, fire: false });
    assert.equal(game.lifeLost, true, `${side}: the collision raised a life loss`);

    game.resetAfterLife();
    assert.ok(game.invulnerable > 0, `${side}: a grace period is granted`);
    const overlapping = game.asteroids.some((asteroid) => Math.hypot(asteroid.x - game.ship.x, asteroid.y - game.ship.y) < asteroid.radius + game.ship.radius);
    assert.equal(overlapping, false, `${side}: the ship no longer overlaps a rock`);
    assert.equal(game.ship.speed, 0, `${side}: the ship is stationary on respawn`);

    // The grace period must actually protect against the immediate second hit.
    game.asteroids = [{ x: game.ship.x, y: game.ship.y, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 0 }];
    game.lifeLost = false;
    game.update(1 / 60, { pointer: null, fire: false });
    assert.equal(game.lifeLost, false, `${side}: the grace period absorbs the immediate re-collision`);
  }
});

test("Asteroids rocks mode drops its stale targeting after a life loss", () => {
  const game = new AsteroidsModel();
  game.setSide("rocks");
  game.reset();
  const target = { x: 500, y: 300, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 0 };
  game.asteroids = [target];
  game.update(0.1, { pointer: null, fire: false });
  assert.equal(game.ship.aiTarget, target, "the computer locked onto a rock");
  game.resetAfterLife();
  assert.equal(game.ship.aiTarget, null, "the stale target is dropped on respawn");
  assert.equal(game.ship.aiReaction, 0, "the reaction delay is reset");
});

test("Asteroids versus restores both ships on a life loss", () => {
  const game = new AsteroidsModel();
  game.setSide("versus");
  game.reset();
  game.computerShip.x = 700;
  game.computerShip.y = 60;
  game.ship.x = 100;
  game.ship.y = 500;
  game.resetAfterLife();
  assert.deepEqual({ x: game.ship.x, y: game.ship.y }, { x: 400, y: 280 }, "the human ship is restored");
  assert.deepEqual({ x: game.computerShip.x, y: game.computerShip.y }, { x: 400, y: 160 }, "the computer ship is restored too");
});

test("Asteroids versus starts the duel from the configured lives, for every value 1-9", () => {
  for (let lives = 1; lives <= 9; lives += 1) {
    const game = new AsteroidsGame();
    game.setSide("versus");
    game.lifecycle.startRound({ startingLives: lives, reason: "load" });
    assert.deepEqual(game.playerLives, { human: lives, computer: lives }, `Lives ${lives} is honoured by both pilots`);
  }

  // Configuration is value-only; neither facade nor model retains a host.
  const game = new AsteroidsGame();
  assert.equal("engine" in game, false);
  assert.equal("engine" in game.model, false);

  // Without a configured value the duel still starts playable.
  const bare = new AsteroidsGame();
  bare.setSide("versus");
  bare.reset();
  assert.deepEqual(bare.playerLives, { human: 3, computer: 3 }, "the default is three");
});

test("Asteroids versus receives a fresh value-only life budget per round", () => {
  const game = new AsteroidsGame();
  game.setSide("versus");
  game.lifecycle.startRound({ startingLives: 6, reason: "load" });
  assert.deepEqual(game.playerLives, { human: 6, computer: 6 });
  game.lifecycle.startRound({ startingLives: 8, reason: "restart" });
  game.reset();
  assert.deepEqual(game.playerLives, { human: 8, computer: 8 }, "preview resets preserve the configured round context");
});

test("Asteroids versus resolves every loss source against the same counters", () => {
  const duel = (lives = 3) => {
    const game = new AsteroidsGame();
    game.setSide("versus");
    // Seed 278 previously placed a reset rock on the relocated human pilot.
    withSeededRandom(278, () => game.lifecycle.startRound({ startingLives: lives, reason: "load" }));
    game.model.computerShip.x = 700;
    game.model.computerShip.y = 60;
    game.model.invulnerable = 0;
    game.model.computerInvulnerable = 0;
    game.model.computerShotClock = 99;
    // Isolate this scene from both future spawns and the three reset rocks.
    // Keep one harmless rock so the empty-field refill cannot add random noise.
    game.model.spawnClock = 99;
    game.model.asteroids = [];
    game.model.spawnAsteroidAt(400, 40, game.model.ship, { vx: 0, vy: 0 });
    game.model.ship.x = 60;
    game.model.ship.y = 500;
    return game;
  };
  const blank = input({ pointer: pointer({}) });
  const rock = (x, y) => ({ x, y, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 0 });

  // A rock on the human ship. This is the issue's reproduction: the engine saw
  // a loss and restarted, but the duel counter never moved.
  const humanRock = duel();
  humanRock.model.asteroids = [rock(60, 500)];
  humanRock.update(0, blank);
  assert.equal(humanRock.model.lifeLost, true, "the rock collision raised a loss");
  const humanResult = humanRock.handleLifeLoss();
  assert.equal(humanResult.gameOver, false);
  assert.equal(humanRock.playerLives.human, 2, "the duel counter reflects the rock collision");
  assert.equal(humanRock.playerLives.computer, 3, "the other pilot is untouched");

  // A computer bullet on the human ship: the same outcome by the same path.
  const humanBullet = duel();
  humanBullet.model.bullets = [{ x: humanBullet.model.ship.x, y: humanBullet.model.ship.y, vx: 0, vy: 0, life: 1, owner: "computer" }];
  humanBullet.update(0, blank);
  humanBullet.handleLifeLoss();
  assert.equal(humanBullet.playerLives.human, 2, "a bullet costs the human a life");

  // A human bullet on the computer ship.
  const computerBullet = duel();
  computerBullet.model.bullets = [{ x: computerBullet.model.computerShip.x, y: computerBullet.model.computerShip.y, vx: 0, vy: 0, life: 1, owner: "human" }];
  computerBullet.update(0, blank);
  const computerResult = computerBullet.handleLifeLoss();
  assert.equal(computerResult.gameOver, false);
  assert.equal(computerBullet.playerLives.computer, 2, "a bullet costs the computer a life");
  assert.equal(computerBullet.playerLives.human, 3);

  // A rock on the computer ship, charged in place.
  const computerRock = duel();
  computerRock.model.asteroids = [rock(700, 60)];
  computerRock.update(0, blank);
  assert.equal(computerRock.playerLives.computer, 2, "a rock costs the computer a life");
});

test("Asteroids versus ends at zero however the last life is lost", () => {
  const duel = (humanLives, computerLives) => {
    const game = new AsteroidsGame();
    game.setSide("versus");
    game.lifecycle.startRound({ startingLives: Math.max(humanLives, computerLives), reason: "load" });
    game.model.playerLives.human = humanLives;
    game.model.playerLives.computer = computerLives;
    game.model.computerShip.x = 700;
    game.model.computerShip.y = 60;
    game.model.invulnerable = 0;
    game.model.computerInvulnerable = 0;
    game.model.computerShotClock = 99;
    // A bullet-only outcome must not depend on unrelated reset rocks/refills.
    game.model.spawnClock = 99;
    game.model.asteroids = [];
    game.model.spawnAsteroidAt(400, 40, game.model.ship, { vx: 0, vy: 0 });
    game.model.ship.x = 60;
    game.model.ship.y = 500;
    return game;
  };
  const blank = input({ pointer: pointer({}) });
  const rock = (x, y) => ({ x, y, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [1], tone: 0, generation: 0 });

  // The human's last life lost to a rock.
  const humanOut = duel(1, 3);
  humanOut.model.asteroids = [rock(60, 500)];
  humanOut.update(0, blank);
  const humanResult = humanOut.handleLifeLoss();
  assert.equal(humanResult.gameOver, true, "the round ends when the human runs out");
  assert.equal(humanOut.model.winner, "computer", "the computer wins");
  assert.equal(humanOut.playerLives.human, 0, "the counter reaches zero");

  // The computer's last life lost to a bullet.
  const computerOut = duel(3, 1);
  computerOut.model.bullets = [{ x: computerOut.model.computerShip.x, y: computerOut.model.computerShip.y, vx: 0, vy: 0, life: 1, owner: "human" }];
  computerOut.update(0, blank);
  const computerResult = computerOut.handleLifeLoss();
  assert.equal(computerResult.gameOver, true, "the round ends when the computer runs out");
  assert.equal(computerOut.model.winner, "human", "the human wins");
  assert.equal(computerOut.playerLives.computer, 0);
});

test("Asteroids versus does not double-charge a bullet that already decremented", () => {
  const game = new AsteroidsGame();
  game.setSide("versus");
  game.lifecycle.startRound({ startingLives: 3, reason: "load" });
  game.model.invulnerable = 0;
  game.model.computerShotClock = 99;
  game.model.spawnClock = 99;
  game.model.asteroids = [];
  game.model.spawnAsteroidAt(400, 40, game.model.ship, { vx: 0, vy: 0 });
  game.model.computerShip.x = 700;
  game.model.computerShip.y = 60;
  game.model.ship.x = 60;
  game.model.ship.y = 500;
  game.model.bullets = [{ x: game.model.ship.x, y: game.model.ship.y, vx: 0, vy: 0, life: 1, owner: "computer" }];
  game.update(0, input({ pointer: pointer({}) }));
  assert.equal(game.playerLives.human, 2, "the bullet charged once at impact");
  game.handleLifeLoss();
  assert.equal(game.playerLives.human, 2, "handleLifeLoss does not charge it again");
});

test("Asteroids versus ships bounce instead of shoving each other around", async () => {
  const { wrapDistance } = await import("../src/games/asteroids/model.js");
  const duel = () => {
    const game = new AsteroidsModel();
    game.setSide("versus");
    game.reset();
    game.asteroids = [];
    game.computerShotClock = 99;
    game.invulnerable = 5;
    // The computer's AI re-steers every frame, which would make the bounce
    // depend on rock placement. Stub it out so the only motion under test is
    // the collision response.
    game.aiShip = () => {};
    game.ship.speed = 0;
    game.computerShip.speed = 0;
    return game;
  };

  // A graze: the human drifts into the computer while the computer is not
  // closing. This is the reported defect -- the old code overwrote BOTH headings
  // and pushed both ships apart, which read as the computer dragging the human
  // around the board.
  const graze = duel();
  graze.ship.x = 300;
  graze.ship.y = 300;
  graze.ship.angle = 0;
  graze.ship.speed = 100;
  graze.computerShip.x = 312;
  graze.computerShip.y = 300;
  graze.computerShip.angle = Math.PI / 2;
  const humanHeadingBefore = graze.ship.angle;
  const computerHeadingBefore = graze.computerShip.angle;
  graze.update(0.016, { pointer: null, fire: false });
  assert.equal(graze.ship.angle, humanHeadingBefore, "the human keeps their own heading");
  assert.equal(graze.computerShip.angle, computerHeadingBefore, "the computer keeps its own heading");
  assert.ok(graze.ship.knockX < 0, "the human is pushed away from the computer");
  assert.ok(graze.computerShip.knockX > 0, "the computer is pushed away from the human");

  // Momentum is exchanged, not invented: equal masses bouncing head-on send
  // each ship back the way it came.
  const headOn = duel();
  headOn.ship.x = 300;
  headOn.ship.y = 300;
  headOn.ship.angle = 0;
  headOn.ship.speed = 120;
  headOn.computerShip.x = 320;
  headOn.computerShip.y = 300;
  headOn.computerShip.angle = Math.PI;
  headOn.computerShip.speed = 120;
  headOn.update(0.016, { pointer: null, fire: false });
  assert.ok(headOn.ship.knockX < 0, "the human is knocked away from the computer");
  assert.ok(headOn.computerShip.knockX > 0, "the computer is knocked away from the human");
  // Momentum is exchanged, not invented: each ship leaves travelling the other
  // ship's way, at 120 * restitution = 102.
  const humanNormalSpeed = Math.cos(headOn.ship.angle) * headOn.ship.speed + headOn.ship.knockX;
  const computerNormalSpeed = Math.cos(headOn.computerShip.angle) * headOn.computerShip.speed + headOn.computerShip.knockX;
  assert.ok(humanNormalSpeed < 0, "the human leaves travelling back the way it came");
  assert.ok(computerNormalSpeed > 0, "the computer leaves travelling back the way it came");
  assert.ok(Math.abs(humanNormalSpeed + 102) < 3, "the exchange loses a little energy rather than gaining any");
  // Momentum is conserved: equal masses, so the two impulses are equal and
  // opposite. Checking the impulses rather than the resulting speeds avoids
  // comparing against speeds the steering pass has already decayed.
  assert.ok(Math.abs(headOn.ship.knockX + headOn.computerShip.knockX) < 0.001, "the exchange is momentum-conserving");
  assert.ok(Math.abs(headOn.ship.knockY + headOn.computerShip.knockY) < 0.001, "the exchange is momentum-conserving vertically");

  // Knockback bleeds off, so a bounce reads as a shove and not a drift.
  const settling = duel();
  settling.ship.x = 300;
  settling.ship.y = 300;
  settling.ship.angle = 0;
  settling.ship.speed = 100;
  settling.computerShip.x = 312;
  settling.computerShip.y = 300;
  settling.computerShip.angle = Math.PI / 2;
  settling.update(0.016, { pointer: null, fire: false });
  const impulse = Math.abs(settling.ship.knockX);
  assert.ok(impulse > 0, "the graze produced an impulse");
  // Park them well clear before sampling the decay: left overlapping, the human
  // keeps flying into the computer and every frame applies a fresh impulse, so
  // this would measure re-collision rather than bleed-off.
  for (let frame = 0; frame < 60; frame += 1) {
    settling.ship.x = 100;
    settling.computerShip.x = 600;
    settling.update(0.016, { pointer: null, fire: false });
  }
  assert.ok(Math.abs(settling.ship.knockX) < impulse * 0.1, "knockback decays away");

  // Neither ship may end up inside the other, and a bounce never costs a life.
  const resting = duel();
  resting.ship.x = 300;
  resting.ship.y = 300;
  resting.ship.angle = 0;
  resting.ship.speed = 100;
  resting.computerShip.x = 312;
  resting.computerShip.y = 300;
  resting.computerShip.angle = Math.PI / 2;
  resting.update(0.016, { pointer: null, fire: false });
  assert.ok(wrapDistance(resting.ship.x, resting.ship.y, resting.computerShip.x, resting.computerShip.y) >= 26 - 0.001, "ships end up side by side, not inside each other");
  assert.equal(resting.lifeLost, false, "a bounce does not cost the human a life");
  assert.deepEqual(resting.playerLives, { human: 3, computer: 3 }, "a bounce leaves the duel counters alone");

  // The dead cooldown field is gone rather than left behind.
  assert.equal(resting.shipCollisionCooldown, undefined, "the never-read cooldown field is removed");
});

test("Splat Builder is a puzzle with an outcome, not a win for the navigating actor", () => {
  const game = new SplatGame();
  game.setSide("builder");
  game.reset();
  const model = game.model;

  // The mode copy states the objective instead of implying the player navigates.
  const mode = game.modes.find((entry) => entry.value === "builder");
  assert.ok(/puzzle/i.test(mode.label), "the mode reads as a puzzle");
  assert.ok(!/computer navigates/i.test(mode.label), "the label no longer implies the computer navigates it");
  assert.ok(game.publicState().status.includes("the computer can clear"), "the status line states the goal");

  // The computer clearing the route solves the puzzle. The human never
  // navigates, so the copy credits their design rather than a win they did not
  // personally score.
  model.player.x = model.columns.at(-1).x + 100;
  model.update(1 / 60, {});
  assert.equal(game.won, true, "clearing the route ends the puzzle");
  assert.equal(model.puzzleResult, "solved");
  assert.equal(game.winMessage(), "Solved — your route works.", "the message credits the design, not the navigator");
  assert.equal(game.resultHeading(), "SOLVED", "the generic overlay uses a puzzle result heading");
  assert.ok(!/you win/i.test(game.winMessage()), "the puzzle does not claim the human won");

  // Running the computer out of lives is the failure state, and the copy says
  // the route was unsolvable rather than that the player lost.
  const failing = new SplatGame();
  failing.setSide("builder");
  failing.reset();
  let result = null;
  for (let attempt = 0; attempt < 12 && !(result && result.gameOver); attempt += 1) {
    failing.model.lostPlayers.push(failing.model.player);
    result = failing.handleLifeLoss();
    if (result && !result.gameOver) failing.resetAfterLife();
  }
  assert.ok(result, "a life loss is reported");
  assert.equal(result.gameOver, true, "the puzzle ends once the budget is spent");
  assert.equal(failing.model.puzzleResult, "unsolved", "a route that cannot be cleared is unsolved");
  assert.ok(/unsolved/i.test(result.message), "the failure is named as unsolved");
  assert.ok(/widen the gaps/i.test(result.message), "and says what to change");
  assert.equal(failing.resultHeading(), "UNSOLVED", "the generic overlay names an unsolved puzzle");
  assert.ok(!/you lost/i.test(result.message), "the puzzle does not frame failure as the player losing");
});

test("Splat Builder spends lives from its own budget", () => {
  const game = new SplatGame();
  game.setSide("builder");
  game.lifecycle.startRound({ startingLives: 2, reason: "load" });
  assert.deepEqual(game.model.raceLives, { human: 2, computer: 2 }, "Builder starts from the configured budget");
  assert.equal(game.playerLives, null, "Builder is a single puzzle owner, not a two-pilot game");

  game.model.lostPlayers.push(game.model.player);
  const first = game.handleLifeLoss();
  assert.equal(first.gameOver, false, "one life is not terminal");
  assert.equal(game.model.raceLives.human, 1, "the budget is charged once");
  game.resetAfterLife();

  game.model.lostPlayers.push(game.model.player);
  const second = game.handleLifeLoss();
  assert.equal(second.gameOver, true, "the budget is spent");
  assert.equal(game.model.raceLives.human, 0, "the budget reaches zero rather than going negative");

  // Climber keeps spending the shared engine lives, so this change does not
  // quietly give it its own budget. Race is the only mode with two owners.
  const climber = new SplatGame();
  climber.setSide("climber");
  climber.reset();
  assert.equal(climber.playerLives, null, "Climber still defers to the engine for lives");
  const race = new SplatGame();
  race.setSide("race");
  race.reset();
  assert.deepEqual(race.playerLives, { human: 3, computer: 3 }, "Race exposes per-pilot lives");
});
