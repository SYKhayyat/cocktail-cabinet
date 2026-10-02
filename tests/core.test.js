import test from "node:test";
import assert from "node:assert/strict";
import { clamp, circleHitsCircle, distance, GameEngine } from "../src/engine.js";

function assertMatch(actual, pattern, message) {
  if (!pattern.test(String(actual ?? ""))) throw new Error(`${message} (got ${JSON.stringify(actual)})`);
}
import { SnakeModel } from "../src/games/snake/model.js";
import { BreakoutModel } from "../src/games/breakout/model.js";
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
  const game = new SnakeModel();
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
    const game = new SnakeModel();
    game.setSide("apples");
    game.reset();
    const input = { keys: new Set(), pressed: new Set(), pointer: { clicked: false, down: false } };
    for (let index = 0; index < 3000; index += 1) game.update(0.05, input);
    reachedApple = game.score > 0;
  }
  assert.ok(reachedApple);
});

test("Breakout keeps the ball inside the screen after a step", () => {
  const game = new BreakoutModel();
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
  const game = new BreakoutModel();
  game.setSide("blocks");
  game.reset();
  game.bricks[0].hits = 0;
  game.resetAfterLife();
  assert.equal(game.bricks[0].hits, 0);
  assert.equal(game.bricks.length, 50);
  assert.equal(game.human.width, 112);
});

test("Breakout input mode gives keyboard priority until the mouse moves", () => {
  const game = new BreakoutModel();
  game.reset();
  game.update(0.016, { mode: "keyboard", keys: new Set(["ArrowRight"]), pressed: new Set(), pointer: { x: 700, moved: true, clicked: false, down: false } });
  const keyboardX = game.human.x;
  assert.ok(keyboardX < 700);
  game.update(0.016, { mode: "mouse", keys: new Set(), pressed: new Set(), pointer: { x: 100, moved: true, clicked: false, down: false } });
  assert.ok(game.human.x < keyboardX);
});

test("Breakout setup click cycles a block and drag rearranges it", () => {
  const game = new BreakoutModel();
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
  assert.equal(game.bricks[0].width, 62);
  assert.equal(game.bricks[0].height, 18);
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

function withFakeDom(run) {
  const listeners = new Map();
  const canvasListeners = new Map();
  const noop = () => {};
  const contextStub = new Proxy({}, { get: () => noop, set: () => true });
  const canvas = {
    width: 800,
    height: 560,
    getContext: () => contextStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 560 }),
    addEventListener: (type, handler) => canvasListeners.set(type, handler),
    removeEventListener: (type) => canvasListeners.delete(type)
  };
  const fakeWindow = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type)
  };
  const saved = { window: globalThis.window, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  globalThis.window = fakeWindow;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
  try {
    return run({
      engine: new GameEngine(canvas),
      dispatch: (type, event) => canvasListeners.get(type)?.(event),
      dispatchWindow: (type, event) => listeners.get(type)?.(event)
    });
  } finally {
    globalThis.window = saved.window;
    globalThis.requestAnimationFrame = saved.raf;
    globalThis.cancelAnimationFrame = saved.caf;
  }
}

function fakeGame(overrides = {}) {
  return {
    id: "snake",
    score: 0,
    gameOver: false,
    lifeLost: false,
    won: false,
    reset() {},
    setSide() {},
    sideLabel() { return "Test side"; },
    update() {},
    draw() {},
    publicState() { return { title: "Test", description: "", side: "", status: "" }; },
    ...overrides
  };
}

function withEngine(run) {
  return withFakeDom(({ engine }) => run(engine, fakeGame()));
}

test("raising the lives setting mid-round queues it for the next game", () => {
  withEngine((engine, game) => {
    engine.load(game);
    assert.deepEqual([engine.lives, engine.maxLives], [3, 3]);
    engine.lives = 2;
    engine.setLives(9);
    assert.deepEqual([engine.lives, engine.maxLives], [2, 3], "a raise never grants a free life now");
    assert.equal(engine.pendingLives, 9);
    engine.restart();
    assert.deepEqual([engine.lives, engine.maxLives], [9, 9], "the queued value lands on the next game");
  });
});

test("lowering the lives setting mid-round clamps immediately and stays coherent", () => {
  withEngine((engine, game) => {
    engine.load(game);
    engine.lives = 2;
    engine.setLives(1);
    assert.deepEqual([engine.lives, engine.maxLives], [1, 1], "lives can never exceed the new maximum");
    engine.setLives(5);
    assert.deepEqual([engine.lives, engine.maxLives], [1, 1], "raising again does not resurrect lives");
    engine.restart();
    assert.deepEqual([engine.lives, engine.maxLives], [5, 5]);
  });
});

test("lives settings apply across game loads and side changes", () => {
  withEngine((engine, game) => {
    engine.load(game);
    engine.setLives(6);
    engine.load(fakeGame({ id: "breakout" }));
    assert.deepEqual([engine.lives, engine.maxLives], [6, 6], "loading a game adopts the queued setting");
    engine.setLives(2);
    engine.lives = 2;
    engine.setSide("other");
    assert.deepEqual([engine.lives, engine.maxLives], [2, 2]);
  });
});

test("an extra life earned in play survives the next game", () => {
  withEngine((engine, game) => {
    engine.load(game);
    engine.setLives(4);
    engine.restart();
    assert.deepEqual([engine.lives, engine.maxLives], [4, 4]);
    engine.addLife();
    assert.deepEqual([engine.lives, engine.maxLives], [5, 5]);
    engine.restart();
    assert.deepEqual([engine.lives, engine.maxLives], [5, 5], "the reward is not lost by restarting");
  });
});

test("lives settings are clamped to the documented 1-9 range", () => {
  withEngine((engine, game) => {
    engine.load(game);
    engine.setLives(0);
    assert.equal(engine.pendingLives, 1);
    engine.setLives(50);
    assert.equal(engine.pendingLives, 9);
    engine.setLives("not a number");
    assert.equal(engine.pendingLives, 3, "unparseable input falls back to the default");
    engine.setLives(2.7);
    assert.equal(engine.pendingLives, 2, "a fractional input is not a whole number of lives");
  });
});

test("a cancelled pointer gesture leaves no click, drag, or release behind", () => {
  withFakeDom(({ engine, dispatch, dispatchWindow }) => {
    const pointerEvent = { pointerId: 7, clientX: 100, clientY: 120 };
    dispatch("pointerdown", pointerEvent);
    dispatch("pointermove", { ...pointerEvent, clientX: 160, clientY: 180 });
    assert.equal(engine.input.pointer.down, true);
    assert.equal(engine.input.pointer.clicked, true);
    assert.ok(engine.input.pointer.dragDistance > 0);

    dispatchWindow("pointercancel", { pointerId: 7 });

    const pointer = engine.input.pointer;
    assert.equal(pointer.clicked, false, "a cancelled press must not become a click");
    assert.equal(pointer.released, false, "a cancelled press must not become a release");
    assert.equal(pointer.doubleClicked, false);
    assert.equal(pointer.down, false);
    assert.equal(pointer.moved, false);
    assert.equal(pointer.dragDeltaX, 0);
    assert.equal(pointer.dragDeltaY, 0);
    assert.equal(pointer.dragDistance, 0);
    assert.equal(engine.input.scrollDeltaX, 0);
    assert.equal(engine.activePointerId, null, "the cancelled pointer is released for the next gesture");

    const freshGesture = dispatch("pointerdown", { pointerId: 9, clientX: 300, clientY: 200 });
    assert.equal(engine.input.pointer.down, true);
    assert.equal(engine.input.pointer.clicked, true);
    assert.equal(engine.input.pointer.dragDeltaX, 0, "the next gesture starts from a clean drag baseline");
    assert.equal(engine.input.pointer.dragDistance, 0);
  });
});

test("pointercancel for an unrelated pointer leaves the active gesture alone", () => {
  withFakeDom(({ engine, dispatch, dispatchWindow }) => {
    dispatch("pointerdown", { pointerId: 1, clientX: 50, clientY: 60 });
    dispatchWindow("pointercancel", { pointerId: 2 });
    assert.equal(engine.input.pointer.down, true, "a second pointer's cancel must not abort the first");
    assert.equal(engine.input.pointer.clicked, true);
    assert.equal(engine.activePointerId, 1);
  });
});

test("pointercancel discards a pending double-click so it cannot re-fire", () => {
  withFakeDom(({ engine, dispatch, dispatchWindow }) => {
    dispatch("pointerdown", { pointerId: 3, clientX: 200, clientY: 200 });
    dispatchWindow("pointerup", { pointerId: 3, clientX: 200, clientY: 200 });
    dispatch("pointerdown", { pointerId: 3, clientX: 201, clientY: 201 });
    assert.equal(engine.input.pointer.doubleClicked, true);
    dispatchWindow("pointercancel", { pointerId: 3 });
    dispatch("pointerdown", { pointerId: 3, clientX: 202, clientY: 202 });
    assert.equal(engine.input.pointer.doubleClicked, false, "the cancelled click must not pair with the next press");
  });
});

test("the engine stops and announces a winner when a duel reaches zero lives", async () => {
  const { AsteroidsGame } = await import("../src/games/asteroids/index.js");
  const messages = [];
  await withEngine((engine) => {
    const game = new AsteroidsGame();
    game.setSide("versus");
    game.reset();
    engine.onMessage = (value) => messages.push(value);
    engine.load(game);
    engine.ready = false;
    engine.stopped = false;
    engine.paused = false;
    engine.countdown = 0;
    game.model.asteroids = [];
    game.model.computerShotClock = 99;
    game.model.ship.x = 60;
    game.model.ship.y = 500;
    game.model.playerLives.computer = 1;
    game.model.bullets = [{ x: game.model.computerShip.x, y: game.model.computerShip.y, vx: 0, vy: 0, life: 1, owner: "human" }];

    let time = performance.now() + 1000;
    engine.frame((time += 1000 / 60));

    assert.equal(game.model.playerLives.computer, 0, "the computer is out of lives");
    assert.equal(game.model.gameOver, true, "the model reports the round as over");
    assert.equal(game.model.winner, "human", "the human is declared the winner");
    assert.equal(engine.stopped, true, "the engine halts the round");
    assert.ok(messages.some((text) => /You win/.test(text)), `the winner is announced (got ${JSON.stringify(messages)})`);
  });
});

test("Asteroids versus routes rock losses through duel lives and reset", async () => {
  const { AsteroidsGame } = await import("../src/games/asteroids/index.js");
  await withEngine((engine) => {
    for (const owner of ["human", "computer"]) {
      const game = new AsteroidsGame();
      game.setSide("versus");
      engine.load(game);
      engine.ready = false;
      engine.stopped = false;
      engine.paused = false;
      engine.countdown = 0;
      game.model.asteroids = [{ x: owner === "human" ? game.model.ship.x : game.model.computerShip.x, y: owner === "human" ? game.model.ship.y : game.model.computerShip.y, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0, shape: [], tone: 0, generation: 1 }];
      game.model.invulnerable = 0;
      engine.frame(performance.now() + 1000);
      assert.equal(game.model.playerLives[owner], 2, `${owner} rock loss charges the duel counter once`);
      assert.equal(engine.lives, 3, "a duel rock loss does not spend the engine's solo budget");
      assert.equal(engine.countdown, 3, "a non-terminal rock loss starts the normal countdown");
    }
  });
});

test("the ready overlay shows a versus life line only for two-owner games", async () => {
  const { BreakoutGame } = await import("../src/games/breakout/index.js");
  const lifeLine = (game) => (game.playerLives
    ? `You: ${game.playerLives.human}    Computer: ${game.playerLives.computer}`
    : `Lives: 3/3`);

  await withEngine((engine) => {
    for (const side of ["bottom", "blocks"]) {
      const game = new BreakoutGame();
      engine.load(game);
      game.setSide(side);
      game.reset();
      assert.equal(game.playerLives, null, `${side} has no second owner to report`);
      assertMatch(lifeLine(game), /^Lives: /, `${side} uses the single-paddle life line`);
    }
    const duel = new BreakoutGame();
    engine.load(duel);
    duel.setSide("versus");
    duel.reset();
    assertMatch(lifeLine(duel), /^You: .*Computer: /, "versus uses the two-owner life line");
  });
});

test("Pause freezes the countdown and Continue resumes it from there", () => {
  const messages = [];
  withEngine((engine) => {
    engine.onMessage = (value) => messages.push(value);
    const game = fakeGame();
    engine.load(game);
    engine.ready = false;
    engine.restart();
    assert.ok(engine.countdown > 0, "New game starts a countdown");

    engine.pauseGame();
    assert.equal(engine.paused, true, "Pause pauses during the countdown");
    assert.equal(engine.stopped, true);
    assert.ok(messages.some((text) => /Paused/.test(text)), "Pause reports itself");

    // Frames while paused must not advance the countdown. This is the core of
    // the fix: the countdown used to keep running, so Continue was a no-op
    // while the message still said to press it.
    const frozen = engine.countdown;
    let time = performance.now() + 1000;
    for (let frame = 0; frame < 30; frame += 1) engine.frame((time += 1000 / 60));
    assert.equal(engine.countdown, frozen, "the countdown is frozen while paused");

    // Continue is always actionable when paused, and resumes the same countdown.
    engine.continueGame();
    assert.equal(engine.paused, false, "Continue resumes");
    assert.ok(Math.abs(engine.countdown - frozen) < 0.05, "the countdown continues from where it stopped");
    assert.ok(messages.some((text) => /Continuing in/.test(text)), "Continue reports resuming");

    engine.frame((time += 1000 / 60));
    assert.ok(engine.countdown < frozen, "the countdown advances again after resuming");
  });
});

test("Continue is a no-op unless the round is paused", () => {
  withEngine((engine) => {
    const game = fakeGame();
    engine.load(game);
    engine.ready = false;
    const countdownBefore = engine.countdown;
    engine.continueGame();
    assert.equal(engine.paused, false, "Continue without a pause does nothing");
    assert.equal(engine.countdown, countdownBefore, "and does not invent a countdown");

    engine.continueGame();
    assert.equal(engine.paused, false, "repeated Continue calls stay inert");
  });
});

test("Pause is idempotent and does not fight Continue", () => {
  withEngine((engine) => {
    const game = fakeGame();
    engine.load(game);
    engine.ready = false;
    engine.restart();
    engine.pauseGame();
    engine.pauseGame();
    assert.equal(engine.paused, true, "pausing twice is harmless");
    const frozen = engine.countdown;
    engine.continueGame();
    assert.equal(engine.paused, false);
    assert.ok(Math.abs(engine.countdown - frozen) < 0.05, "a second pause did not restart the countdown");
  });
});
