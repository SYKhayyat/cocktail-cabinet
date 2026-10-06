import test from "node:test";
import assert from "node:assert/strict";
import * as host from "../src/engine.js";
import { createGameLifecycle } from "../src/game-lifecycle.js";
import { SnakeGame } from "../src/games/snake/index.js";
import { BreakoutGame, BreakoutModel } from "../src/games/breakout/index.js";
import { AsteroidsGame, AsteroidsModel } from "../src/games/asteroids/index.js";
import { SplatGame, SplatModel } from "../src/games/splat/index.js";
import { StarfallGame } from "../src/games/starfall/index.js";
import { MissileCommandGame } from "../src/games/missile/index.js";
import { ImitationGame } from "../src/games/imitation/index.js";

test("models accept configured lives as values for all supported budgets", () => {
  for (let startingLives = 1; startingLives <= 9; startingLives += 1) {
    for (const Model of [BreakoutModel, AsteroidsModel]) {
      const model = new Model();
      model.setSide("versus");
      model.reset(false, { startingLives });
      assert.deepEqual(model.playerLives, { human: startingLives, computer: startingLives });
      assert.equal("engine" in model, false);
    }
    for (const side of ["race", "builder"]) {
      const model = new SplatModel();
      model.setSide(side);
      model.reset(false, false, { startingLives });
      assert.deepEqual(model.raceLives, { human: startingLives, computer: startingLives });
      assert.equal("engine" in model, false);
    }
  }
});

function withHost(run) {
  const noop = () => {};
  const text = [];
  const context = new Proxy({ fillText: (value) => text.push(value) }, { get: (target, key) => target[key] || noop, set: (target, key, value) => { target[key] = value; return true; } });
  const canvas = { width: 800, height: 560, getContext: () => context, addEventListener: noop, removeEventListener: noop };
  const saved = Object.fromEntries(["window", "requestAnimationFrame", "cancelAnimationFrame", "BroadcastChannel"].map((key) => [key, globalThis[key]]));
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
  globalThis.BroadcastChannel = undefined;
  const messages = [];
  const lives = [];
  const engine = new host.GameEngine(canvas, { onMessage: (value) => messages.push(value), onLives: (...value) => lives.push(value) });
  try { return run({ engine, messages, lives, text }); }
  finally {
    engine.destroy();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

function play(engine) {
  engine.restart();
  engine.countdown = 0;
}

function step(engine) { engine.frame(engine.lastTime + 16); }

test("facades declare boot, life restart, ownership, and result capabilities", () => {
  withHost(({ engine }) => {
    for (const Game of [SnakeGame, BreakoutGame, AsteroidsGame, SplatGame, StarfallGame, MissileCommandGame, ImitationGame]) {
      const game = new Game();
      engine.load(game);
      assert.equal("engine" in game, false);
      assert.equal("engine" in game.model, false);
      assert.equal(Object.isFrozen(game.lifecycle), true);
      assert.equal(typeof game.lifecycle.resultState, "function");
      assert.equal(engine.ready, Game !== ImitationGame);
      assert.equal(engine.stopped, Game !== ImitationGame);
      assert.equal(Boolean(game.lifecycle.restartAfterLife), ![MissileCommandGame, ImitationGame].includes(Game));
      assert.equal(game.lifecycle.lifeState().owner, [MissileCommandGame, ImitationGame].includes(Game) ? "none" : "host");
    }
  });
});

test("interactive boot is a capability, not a game id branch", () => {
  withHost(({ engine }) => {
    const game = { id: "new-interactive-game", reset() {}, update() {}, draw() {}, publicState() {} };
    game.lifecycle = createGameLifecycle(game, { boot: "interactive" });
    engine.load(game);
    assert.equal(engine.ready, false);
    assert.equal(engine.stopped, false);
    const imitation = new ImitationGame();
    engine.load(imitation);
    const phase = imitation.phase;
    step(engine);
    assert.equal(imitation.phase, phase);
    assert.equal(engine.countdown, 0);
  });
});

test("round context carries configured lives through load, restart, and side change", () => {
  withHost(({ engine }) => {
    for (const [Game, side] of [[BreakoutGame, "versus"], [AsteroidsGame, "versus"], [SplatGame, "race"], [SplatGame, "builder"]]) {
      const game = new Game();
      game.setSide(side);
      engine.setLives(6);
      engine.load(game);
      assert.equal(game.lifecycle.lifeState().remaining, 6);
      game.reset();
      assert.equal(game.lifecycle.lifeState().remaining, 6, "a ready-screen preview reset keeps the value-only round context");
      assert.equal(Object.isFrozen(game.lifecycle.roundContext), true);
      engine.setLives(8);
      assert.equal(game.lifecycle.lifeState().remaining, 6, "a raised budget waits for the next round");
      engine.restart();
      assert.equal(game.lifecycle.lifeState().remaining, 8);
      engine.setLives(5);
      engine.setSide(side);
      assert.equal(game.lifecycle.lifeState().remaining, 5);
    }
  });
});

test("Snake life restart preserves score, length, and active settings", () => {
  withHost(({ engine, messages }) => {
    const game = new SnakeGame();
    engine.load(game);
    play(engine);
    game.model.score = 7;
    game.model.reset(true, 9);
    const settings = { cols: game.model.cols, rows: game.model.rows, wrap: game.model.wrap };
    game.setSettings({ cols: 20, rows: 18, startingLength: 4, wrap: true });
    game.model.snake[0].x = game.model.cols - 1;
    game.model.direction = game.model.nextDirection = { x: 1, y: 0 };
    game.model.aiClock = 1;
    step(engine);
    assert.equal(engine.lives, 2);
    assert.equal(engine.countdown, 3);
    assert.equal(game.score, 7);
    assert.equal(game.snake.length, 9);
    assert.deepEqual({ cols: game.model.cols, rows: game.model.rows, wrap: game.model.wrap }, settings);
    assert.equal(game.lifeLost, false);
    assert.match(messages.at(-1), /Wall hit/);
    engine.restart();
    assert.equal(game.score, 0);
    assert.equal(game.snake.length, 4);
    assert.equal(game.model.cols, 20);
  });
});

test("solo Breakout rewards are observable headlessly and consumed once by the host", () => {
  const model = new BreakoutModel();
  model.reset();
  const brick = { type: "extraLife", active: true };
  model.hitBrick(model.balls[0], brick);
  assert.deepEqual(model.pendingRewards, [{ type: "extra-life" }]);
  assert.equal("engine" in model, false);
  model.reset();
  assert.deepEqual(model.pendingRewards, [], "new rounds discard unconsumed old rewards");
  withHost(({ engine }) => {
    const game = new BreakoutGame();
    engine.load(game);
    play(engine);
    game.model.hitBrick(game.model.balls[0], brick);
    step(engine);
    assert.deepEqual([engine.lives, engine.maxLives, engine.pendingLives], [4, 4, 4]);
    step(engine);
    assert.equal(engine.lives, 4, "the reward is not replayed");
    engine.restart();
    assert.equal(engine.lives, 4, "earned budget persists across new games");
    engine.setSide("versus");
    engine.countdown = 0;
    game.model.hitBrick(game.model.balls[0], brick);
    step(engine);
    assert.equal(game.model.playerLives.human, 5);
    assert.equal(engine.lives, 4, "duel rewards stay with their scoring pilot");
  });
});

test("model-owned losses do not spend the host budget and result state drives the overlay", () => {
  withHost(({ engine, messages, text }) => {
    const game = new AsteroidsGame();
    game.setSide("versus");
    engine.setLives(1);
    engine.load(game);
    play(engine);
    game.model.asteroids = [];
    game.model.computerShotClock = 99;
    game.model.bullets = [{ x: game.model.computerShip.x, y: game.model.computerShip.y, vx: 0, vy: 0, life: 1, owner: "human" }];
    step(engine);
    assert.equal(game.model.playerLives.computer, 0);
    assert.equal(engine.lives, 1);
    assert.equal(engine.stopped, true);
    assert.equal(game.lifecycle.resultState().heading, "YOU WIN");
    assert.match(messages.at(-1), /You win/);
    assert.ok(text.includes("YOU WIN"));
  });
});

test("lowering lives clamps every game-owned budget without granting spent lives", () => withHost(({ engine, lives }) => {
  for (const [Game, side] of [[BreakoutGame, "versus"], [AsteroidsGame, "versus"], [SplatGame, "race"], [SplatGame, "builder"]]) {
    engine.setLives(7);
    const game = new Game();
    game.setSide(side);
    engine.load(game);
    const counters = game.model.playerLives || game.model.raceLives;
    counters.human = 2;
    counters.computer = 6;
    engine.setLives(3);
    assert.deepEqual(counters, { human: 2, computer: 3 });
    assert.deepEqual(lives.at(-1), [2, 3]);
    assert.equal(game.lifecycle.roundContext.startingLives, 3);
    engine.setLives(8);
    assert.deepEqual(counters, { human: 2, computer: 3 }, "raising cannot resurrect either owner");
    engine.restart();
    assert.deepEqual(game.lifecycle.lifeState().remaining, 8);
  }
}));

test("lowering the host maximum clamps it even when remaining lives are already below it", () => withHost(({ engine }) => {
  engine.setLives(7);
  engine.load(new SnakeGame());
  engine.lives = 1;
  engine.setLives(3);
  assert.deepEqual([engine.lives, engine.maxLives], [1, 3]);
}));

test("Splat puzzle retries preserve layout and end through a single-owner result", () => {
  withHost(({ engine, text, messages }) => {
    const game = new SplatGame();
    game.setSide("builder");
    engine.setLives(2);
    engine.load(game);
    game.model.columns[0].gapY = 200;
    play(engine);
    assert.equal(game.model.columns[0].gapY, 200, "New game preserves authored gaps");
    for (let loss = 0; loss < 2; loss += 1) {
      engine.countdown = 0;
      const column = game.model.columns[0];
      game.model.player.x = column.x + column.width / 2;
      game.model.player.y = 30;
      step(engine);
      assert.equal(game.model.raceLives.human, 1 - loss);
      assert.equal(engine.lives, 1 - loss, "the puzzle mirrors its single-owner budget into host state");
    }
    assert.equal(engine.stopped, true);
    assert.equal(game.lifecycle.lifeState().players, null);
    assert.equal(game.lifecycle.resultState().heading, "UNSOLVED");
    assert.ok(text.includes("UNSOLVED"));
    assert.match(messages.at(-1), /Unsolved/);
    engine.restart();
    assert.equal(game.lifecycle.resultState().ended, false);
    assert.equal(game.model.raceLives.human, 2);
  });
});

test("single-owner host losses exhaust their configured budget without an endless restart", () => {
  withHost(({ engine }) => {
    for (const Game of [SnakeGame, BreakoutGame, StarfallGame, AsteroidsGame, SplatGame]) {
      const game = new Game();
      engine.setLives(1);
      engine.load(game);
      play(engine);
      // Inject the public edge trigger without changing the model's event log.
      game.lifeLost = true;
      step(engine);
      assert.equal(engine.lives, 0, Game.name);
      assert.equal(engine.stopped, true, Game.name);
      assert.equal(game.lifecycle.resultState().ended, true, Game.name);
      assert.equal(engine.countdown, 0, Game.name);
    }
  });
});
