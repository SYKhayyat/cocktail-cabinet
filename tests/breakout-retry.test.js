import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../src/engine.js";
import { BreakoutGame, BreakoutModel } from "../src/games/breakout/index.js";

const INPUT = { mode: "keyboard", keyDirection: 0, pointer: { x: 0, y: 0, moved: false, down: false } };
const FACTOR = 1.045;

function modelAtScore(side, score) {
  const model = new BreakoutModel();
  model.setSide(side);
  model.reset();
  model.score = score;
  if (side === "versus") model.scores = { human: score, computer: score - 1 };
  model.applyDifficulty();
  model.bricks[0].hits = 0;
  model.update(0, INPUT);
  return model;
}

function assertVelocity(ball, vx, vy, level) {
  const factor = FACTOR ** level;
  assert.ok(Math.abs(ball.vx - vx * factor) < 1e-9, `vx: expected ${vx * factor}, got ${ball.vx}`);
  assert.ok(Math.abs(ball.vy - vy * factor) < 1e-9, `vy: expected ${vy * factor}, got ${ball.vy}`);
}

function assertOwnedVelocity(ball, level) {
  assertVelocity(ball, ball.owner === "computer" ? -180 : 180, ball.owner === "computer" ? 200 : -200, level);
  assert.equal(ball.lastPaddle, ball.owner);
  assert.equal(ball.dead, false);
}

for (const side of ["bottom", "blocks"]) {
  for (const [score, level] of [[0, 0], [19, 1], [45, 4], [1000, 8]]) {
    test(`Breakout ${side} retry retains level ${level}, score, and remaining bricks`, () => {
      const model = modelAtScore(side, score);
      const bricks = structuredClone(model.bricks);
      const layout = structuredClone(model.layout);
      for (let retry = 0; retry < 3; retry += 1) {
        model.balls[0].y = 550;
        model.update(0, INPUT);
        assert.equal(model.lifeLost, true);
        assert.equal(model.balls.length, 0);
        model.resetAfterLife();
        model.lifeLost = false;
        assert.equal(model.difficultyLevel, level);
        assertVelocity(model.balls[0], 180, 210, level);
        model.applyDifficulty();
        assertVelocity(model.balls[0], 180, 210, level);
        assert.equal(model.score, score);
        assert.deepEqual(model.bricks, bricks);
        assert.deepEqual(model.layout, layout);
      }
      model.reset();
      assert.equal(model.difficultyLevel, 0);
      assert.equal(model.score, 0);
      assertVelocity(model.balls[0], 180, 210, 0);
    });
  }
}

for (const lostOwner of ["human", "computer"]) {
  test(`Breakout versus ${lostOwner} replacement preserves accelerated power-up survivors`, () => {
    const model = modelAtScore("versus", 30);
    const survivor = model.balls.find((ball) => ball.owner !== lostOwner);
    survivor.x = 80;
    survivor.y = 430;
    model.hitBrick(survivor, { type: "speed", active: true });
    model.hitBrick(survivor, { type: "double", active: true });
    const clone = model.balls.at(-1);
    assert.equal(clone.vx, -survivor.vx * 0.82, "clones inherit velocity without applying the retained level again");
    assert.equal(clone.vy, survivor.vy * 0.82);
    model.applyDifficulty();
    const level = model.difficultyLevel;
    const survivors = [survivor, clone];
    const snapshots = survivors.map((ball) => ({ ...ball }));
    const scores = { ...model.scores };
    const bricks = structuredClone(model.bricks);
    const lost = model.balls.find((ball) => ball.owner === lostOwner);
    lost.y = lostOwner === "human" ? 550 : -20;
    model.update(0, INPUT);
    assert.deepEqual(model.handleLifeLoss().owners, [lostOwner]);
    model.resetAfterLife();
    assert.equal(model.balls.length, 3);
    for (let index = 0; index < survivors.length; index += 1) {
      assert.equal(model.balls[index], survivors[index]);
      assert.deepEqual(model.balls[index], snapshots[index], "survivors retain their power-up velocities exactly");
    }
    assertOwnedVelocity(model.balls.at(-1), level);
    model.applyDifficulty();
    assertOwnedVelocity(model.balls.at(-1), level);
    assert.deepEqual(model.scores, scores);
    assert.deepEqual(model.bricks, bricks);
    assert.equal(model.playerLives[lostOwner], 2);
  });
}

for (const owners of [["human", "computer"], ["human", "human"]]) {
  test(`Breakout versus simultaneous ${owners.join("/")} losses scale every replacement once`, () => {
    const model = modelAtScore("versus", 50);
    model.balls = owners.map((owner) => model.newOwnedBall(owner));
    model.balls.forEach((ball) => { ball.y = ball.owner === "computer" ? -20 : 550; });
    model.update(0, INPUT);
    assert.equal(model.balls.length, 0);
    const loss = model.handleLifeLoss();
    assert.deepEqual(loss.owners, owners);
    assert.equal(loss.gameOver, false);
    model.resetAfterLife();
    assert.equal(model.balls.length, owners[0] === owners[1] ? 3 : 2);
    assert.deepEqual(model.balls.map((ball) => ball.owner), owners[0] === owners[1] ? [...owners, "computer"] : owners);
    for (const ball of model.balls) assertOwnedVelocity(ball, 5);
    model.applyDifficulty();
    for (const ball of model.balls) assertOwnedVelocity(ball, 5);
  });
}

for (const missingOwner of ["human", "computer"]) {
  test(`Breakout versus fallback restores missing ${missingOwner} at retained difficulty`, () => {
    const model = modelAtScore("versus", 1000);
    const existingOwner = missingOwner === "human" ? "computer" : "human";
    const survivor = model.balls.find((ball) => ball.owner === existingOwner);
    const snapshot = { ...survivor };
    model.balls = [survivor];
    model.lifeLossOwner = existingOwner;
    model.resetAfterLife();
    assert.equal(model.balls[0], survivor);
    assert.deepEqual(survivor, snapshot);
    assert.equal(model.balls.length, 3);
    for (const ball of model.balls.slice(1)) assertOwnedVelocity(ball, 8);
    model.reset();
    assert.equal(model.difficultyLevel, 0);
    assert.deepEqual(model.scores, { human: 0, computer: 0 });
    for (const ball of model.balls) assertOwnedVelocity(ball, 0);
  });
}

test("Breakout score earned just before retry applies only the outstanding difficulty increment", () => {
  const model = modelAtScore("bottom", 20);
  model.score = 30;
  model.resetAfterLife();
  assertVelocity(model.balls[0], 180, 210, 2);
  model.applyDifficulty();
  assert.equal(model.difficultyLevel, 3);
  assertVelocity(model.balls[0], 180, 210, 3);
});

function withEngine(run) {
  const noop = () => {};
  const context = new Proxy({}, { get: () => noop });
  const canvas = { getContext: () => context, addEventListener: noop, removeEventListener: noop };
  const saved = Object.fromEntries(["window", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, globalThis[key]]));
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
  const engine = new GameEngine(canvas);
  try { run(engine); }
  finally {
    engine.destroy();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

for (const side of ["bottom", "blocks", "versus"]) {
  test(`Breakout ${side} engine life retry and New game honor distinct difficulty lifecycles`, () => withEngine((engine) => {
    const game = new BreakoutGame();
    game.setSide(side);
    engine.load(game);
    engine.restart();
    engine.countdown = 0;
    const model = game.model;
    model.score = 40;
    if (side === "versus") model.scores = { human: 40, computer: 15 };
    model.applyDifficulty();
    model.bricks[0].hits = 0;
    game.update(0, engine.input);
    const bricks = structuredClone(model.bricks);
    const lost = model.balls[0];
    lost.y = 550;
    engine.frame(engine.lastTime + 16);
    assert.equal(game.lifeLost, false);
    assert.equal(engine.countdown, 3);
    assert.equal(game.score, 40);
    assert.deepEqual(game.bricks, bricks);
    assert.equal(model.difficultyLevel, 4);
    if (side === "versus") {
      assert.equal(model.playerLives.human, 2);
      assert.equal(engine.lives, 3, "versus loss does not spend host lives");
      assertOwnedVelocity(model.balls.find((ball) => ball.owner === "human"), 4);
    } else {
      assert.equal(engine.lives, 2);
      assertVelocity(model.balls[0], 180, 210, 4);
    }
    engine.restart();
    assert.equal(model.difficultyLevel, 0);
    assert.equal(game.score, 0);
    assert.ok(game.bricks.every((brick) => brick.hits === 1));
    if (side === "versus") for (const ball of model.balls) assertOwnedVelocity(ball, 0);
    else assertVelocity(model.balls[0], 180, 210, 0);
  }));
}
