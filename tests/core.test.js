import test from "node:test";
import assert from "node:assert/strict";
import { clamp, circleHitsCircle, distance } from "../src/engine.js";
import { SnakeGame } from "../src/games/snake.js";
import { BreakoutGame } from "../src/games/breakout.js";
import { StarfallGame } from "../src/games/starfall.js";
import { ImitationGame } from "../src/games/imitation.js";

test("shared helpers clamp and measure ordinary game values", () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(distance(0, 0, 3, 4), 5);
  assert.equal(circleHitsCircle(0, 0, 2, 3, 0, 2), true);
  assert.equal(circleHitsCircle(0, 0, 1, 3, 0, 1), false);
});

test("Snake creates a playable state and grows when it reaches an apple", () => {
  const game = new SnakeGame();
  assert.equal(game.side, "snake");
  game.setSettings({ cols: 30, rows: 20, startingLength: 5, wrap: true });
  game.applyPendingSettings();
  game.reset();
  assert.equal(game.snake.length, 5);
  assert.equal(game.wrap, true);
  game.setSettings({ cols: 50, rows: 36, startingLength: 8, wrap: false });
  game.reset(true);
  assert.deepEqual({ cols: game.cols, rows: game.rows, startingLength: game.startingLength, wrap: game.wrap }, { cols: 30, rows: 20, startingLength: 5, wrap: true });
  assert.deepEqual(game.cellFromPointer({ x: 205, y: 105 }), { x: 7, y: 3 });
  game.reset(true, 7);
  assert.equal(game.snake.length, 7);
  const startingSpeed = game.moveInterval();
  game.score = 10;
  assert.ok(game.moveInterval() < startingSpeed);
  game.score = 0;
  game.reset();
  assert.equal(game.snake.length, 5);
  game.apple = { x: game.snake[0].x + 1, y: game.snake[0].y };
  for (let index = 0; index < 20 && game.snake.length === 5; index += 1) game.update(0.2, { keys: new Set(), pressed: new Set(), pointer: { clicked: false, down: false } });
  assert.equal(game.snake.length, 6);
  assert.equal(game.score, 1);
});

test("Snake computer follows apples with a short reaction delay", () => {
  let reachedApple = false;
  for (let round = 0; round < 5 && !reachedApple; round += 1) {
    const game = new SnakeGame();
    game.setSide("apples");
    game.reset();
    const input = { keys: new Set(), pressed: new Set(), pointer: { clicked: false, down: false } };
    for (let index = 0; index < 3000; index += 1) game.update(0.05, input);
    reachedApple = game.score > 0;
  }
  assert.ok(reachedApple);
});

test("Breakout keeps the ball inside the screen after a step", () => {
  const game = new BreakoutGame();
  game.reset();
  const input = { keys: new Set(["ArrowRight"]), pressed: new Set(), pointer: { clicked: false } };
  for (let index = 0; index < 100; index += 1) {
    game.update(0.016, input);
    for (const ball of game.balls) {
      assert.ok(ball.x >= 0 && ball.x <= 800);
      assert.ok(ball.y >= 0 && ball.y <= 560);
    }
  }
});

test("Breakout preserves the brick wall after a life loss", () => {
  const game = new BreakoutGame();
  game.setSide("blocks");
  game.reset();
  game.bricks[0].hits = 0;
  game.resetAfterLife();
  assert.equal(game.bricks[0].hits, 0);
  assert.equal(game.bricks.length, 50);
  assert.equal(game.human.width, 112);
});

test("Breakout input mode gives keyboard priority until the mouse moves", () => {
  const game = new BreakoutGame();
  game.reset();
  game.update(0.016, { mode: "keyboard", keys: new Set(["ArrowRight"]), pressed: new Set(), pointer: { x: 700, moved: true, clicked: false, down: false } });
  const keyboardX = game.human.x;
  assert.ok(keyboardX < 700);
  game.update(0.016, { mode: "mouse", keys: new Set(), pressed: new Set(), pointer: { x: 100, moved: true, clicked: false, down: false } });
  assert.ok(game.human.x < keyboardX);
});

test("Breakout setup click cycles a block and drag rearranges it", () => {
  const game = new BreakoutGame();
  game.setSide("blocks");
  game.reset();
  const brick = game.bricks[0];
  const center = { x: brick.x + brick.width / 2, y: brick.y + brick.height / 2 };
  const baseInput = { mode: "mouse", keys: new Set(), pressed: new Set(), pointer: { x: center.x, y: center.y, moved: true, clicked: true, down: true } };
  game.update(0.016, baseInput);
  game.update(0.016, { ...baseInput, pointer: { ...baseInput.pointer, clicked: false, down: false } });
  assert.notEqual(brick.type, "normal");
  const oldX = brick.x;
  game.update(0.016, { ...baseInput, pointer: { ...baseInput.pointer, x: center.x, clicked: true, down: true } });
  game.update(0.016, { ...baseInput, pointer: { ...baseInput.pointer, x: center.x + 70, clicked: false, down: true } });
  assert.notEqual(brick.x, oldX);
  const arrangedX = brick.x;
  game.reset();
  assert.equal(game.bricks[0].x, arrangedX);
  assert.notEqual(game.bricks[0].type, "normal");
});

test("Imitation keeps its stable game id for cabinet lookup", () => {
  const game = new ImitationGame();
  assert.equal(game.id, "imitation");
  assert.equal(typeof game.matchId, "string");
});

test("Starfall can spawn stars and the machine runner stays in bounds", () => {
  const game = new StarfallGame();
  game.setSide("stars");
  game.reset();
  game.update(0.1, { keys: new Set(), pressed: new Set(), pointer: { x: 200, y: 100, clicked: true } });
  assert.equal(game.stars.length, 1);
  for (let index = 0; index < 100; index += 1) game.update(0.016, { keys: new Set(), pressed: new Set(), pointer: { clicked: false } });
  assert.ok(game.runner.x >= 0 && game.runner.x <= 800);
});
