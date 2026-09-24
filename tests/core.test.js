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
  const startingSpeed = game.moveInterval();
  game.score = 10;
  assert.ok(game.moveInterval() < startingSpeed);
  game.score = 0;
  assert.equal(game.snake.length, 5);
  game.apple = { x: game.snake[0].x + 1, y: game.snake[0].y };
  for (let index = 0; index < 20 && game.snake.length === 5; index += 1) game.update(0.2, { keys: new Set(), pressed: new Set(), pointer: { clicked: false, down: false } });
  assert.equal(game.snake.length, 6);
  assert.equal(game.score, 1);
});

test("Snake computer follows apples with a short reaction delay", () => {
  const game = new SnakeGame();
  game.setSide("apples");
  game.reset();
  const input = { keys: new Set(), pressed: new Set(), pointer: { clicked: false, down: false } };
  for (let index = 0; index < 3000; index += 1) game.update(0.05, input);
  assert.ok(game.score > 0);
});

test("Breakout keeps the ball inside the screen after a step", () => {
  const game = new BreakoutGame();
  game.reset();
  const input = { keys: new Set(["ArrowRight"]), pressed: new Set(), pointer: { clicked: false } };
  for (let index = 0; index < 100; index += 1) game.update(0.016, input);
  assert.ok(game.ball.x >= 0 && game.ball.x <= 800);
  assert.ok(game.ball.y >= 0 && game.ball.y <= 560);
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
