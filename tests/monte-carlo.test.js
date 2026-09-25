import test from "node:test";
import assert from "node:assert/strict";
import { SnakeModel } from "../src/games/snake/model.js";
import { BreakoutModel } from "../src/games/breakout/model.js";
import { SplatModel } from "../src/games/splat/model.js";
import { AsteroidsModel } from "../src/games/asteroids/model.js";
import { MissileModel } from "../src/games/missile/model.js";
import { StarfallModel } from "../src/games/starfall/model.js";

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function blankPointer() {
  return { x: 0, y: 0, moved: false, clicked: false, down: false };
}

function runScenario(runs, steps, setup, advance, isFailure = (game) => game.lifeLost || game.gameOver) {
  const originalRandom = Math.random;
  let successes = 0;
  let failures = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = setup();
      let failed = false;
      for (let step = 0; step < steps; step += 1) {
        advance(game, step);
        if (game.won) break;
        if (isFailure(game)) {
          failed = true;
          break;
        }
      }
      if (failed) failures += 1;
      else successes += 1;
    }
  } finally {
    Math.random = originalRandom;
  }
  return { successes, failures };
}

function runContactScenario(runs, steps, setup, advance) {
  const originalRandom = Math.random;
  let successes = 0;
  let failures = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = setup();
      for (let step = 0; step < steps && !game.won; step += 1) advance(game, step);
      successes += game.paddleHits;
      failures += game.paddleMisses;
    }
  } finally {
    Math.random = originalRandom;
  }
  return { successes, failures };
}

function assertHumanLikeRatio(name, result, minimum, maximum) {
  assert.ok(result.failures > 0, `${name} computer never failed`);
  const ratio = result.successes / result.failures;
  assert.ok(ratio >= minimum && ratio <= maximum, `${name} success ratio was ${ratio.toFixed(1)}:1, expected ${minimum}:1-${maximum}:1`);
}

test("Monte Carlo keeps each computer policy at its fun difficulty", () => {
  const runs = 200;
  const scenarios = {
    snake: {
      minimum: 6,
      maximum: 25,
      result: runScenario(runs, 1000, () => {
        const game = new SnakeModel();
        game.setSide("apples");
        game.reset();
        return game;
      }, (game) => game.update(0.05, { direction: null, steer: null, placeApple: null })),
    },
    breakout: {
      minimum: 4,
      maximum: 15,
      result: runContactScenario(runs, 5000, () => {
        const game = new BreakoutModel();
        game.setSide("blocks");
        game.reset();
        return game;
      }, (game) => game.update(1 / 60, { mode: "mouse", keyDirection: 0, pointer: blankPointer() })),
    },
    splat: {
      minimum: 4,
      maximum: 14,
      result: runScenario(runs, 6500, () => {
        const game = new SplatModel();
        game.setSide("layout");
        game.reset();
        return game;
      }, (game) => game.update(1 / 60, { placeColumnX: undefined })),
    },
    asteroids: {
      minimum: 2,
      maximum: 6,
      result: runScenario(runs, 1200, () => {
        const game = new AsteroidsModel();
        game.setSide("rocks");
        game.reset();
        for (let index = 0; index < 3; index += 1) game.spawnAsteroid();
        return game;
      }, (game) => {
        game.update(1 / 60, { attack: null, fire: false, spawnAsteroid: null });
      }),
    },
    missile: {
      minimum: 1,
      maximum: 5,
      result: runScenario(runs, 600, () => {
        const game = new MissileModel();
        game.setSide("attack");
        game.reset();
        return game;
      }, (game, step) => {
        const attack = step % 45 === 0 ? { x: 40 + Math.random() * 720 } : null;
        game.update(1 / 60, { aim: blankPointer(), launch: false, attack });
      }),
    },
    starfall: {
      minimum: 2,
      maximum: 5,
      result: runScenario(runs, 600, () => {
        const game = new StarfallModel();
        game.setSide("stars");
        game.reset();
        return game;
      }, (game, step) => {
        const spawnStar = step % 30 === 0 ? { x: 20 + Math.random() * 760, y: 20 } : null;
        game.update(1 / 60, { keyDirection: 0, pointerX: 0, spawnStar });
      }),
    },
  };
  for (const [name, scenario] of Object.entries(scenarios)) assertHumanLikeRatio(name, scenario.result, scenario.minimum, scenario.maximum);
});
