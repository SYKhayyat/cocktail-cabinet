import test from "node:test";
import assert from "node:assert/strict";
import { SnakeGame } from "../src/games/snake/index.js";

test("Snake terminal view and lifecycle name the cabinet New game action", () => {
  const game = new SnakeGame();
  game.lifecycle.startRound({ startingLives: 1, reason: "restart" });
  game.gameOver = true;
  const text = [];
  const noop = () => {};
  const context = new Proxy({ fillText: (value) => text.push(value) }, { get: (target, key) => target[key] || noop, set: (target, key, value) => { target[key] = value; return true; } });
  game.draw(context);
  assert.ok(text.includes("Game over — press New game"));
  assert.ok(text.every((value) => !value.includes("New round")));
  assert.match(game.lifecycle.resultState().instruction, /New game/);
});
