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

function runScenario(runs, steps, setup, advance, expectedSide = null, isFailure = (game) => game.lifeLost || game.gameOver) {
  const originalRandom = Math.random;
  let successes = 0;
  let failures = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = setup();
      if (expectedSide && game.side !== expectedSide) throw new Error(`fixture selected "${game.side}" but registered sides are ${JSON.stringify(game.sides)}`);
      
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

// Legacy suite, being retired game by game.
//
// What is left here is only the games not yet converted. The metric these cases
// use -- successes divided by failures, where a run that hit the step limit
// without finishing or dying counts as a success -- is not a difficulty measure.
// The number turns out to be roughly a linear function of how many steps the
// case allows: doubling the budget roughly halves it, on every game. So it
// encodes the step count rather than the computer.
//
// Snake, Breakout and Asteroids now have their own suites under tests/ai/, which
// measure decisions instead of endurance and pin survival separately. This file
// will be deleted when the remaining three are converted.
test("Monte Carlo keeps each computer policy at its fun difficulty", () => {
  const runs = 200;
  const scenarios = {
    splat: {
      minimum: 4,
      maximum: 14,
      result: runScenario(runs, 6500, () => {
        const game = new SplatModel();
        game.setSide("builder");
        game.reset();
        return game;
      }, (game) => game.update(1 / 60, {}), "builder"),
    },
  };
  for (const [name, scenario] of Object.entries(scenarios)) assertHumanLikeRatio(name, scenario.result, scenario.minimum, scenario.maximum);
});
