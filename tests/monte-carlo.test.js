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

function runScenario(runs, steps, setup, advance) {
  const originalRandom = Math.random;
  const outcomes = [];
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = setup();
      let failed = false;
      for (let step = 0; step < steps; step += 1) {
        advance(game, step);
        if (game.lifeLost || game.gameOver) {
          failed = true;
          break;
        }
      }
      outcomes.push(failed);
    }
  } finally {
    Math.random = originalRandom;
  }
  return outcomes.filter(Boolean).length;
}

test("Monte Carlo confirms every computer policy can eventually fail", () => {
  const runs = 20;
  const steps = 2500;
  const failureRates = {
    snake: runScenario(runs, steps, () => {
      const game = new SnakeModel();
      game.setSide("apples");
      game.reset();
      return game;
    }, (game) => game.update(0.05, { direction: null, steer: null, placeApple: null })),
    breakout: runScenario(runs, steps, () => {
      const game = new BreakoutModel();
      game.setSide("blocks");
      game.reset();
      return game;
    }, (game) => game.update(1 / 60, { mode: "mouse", keyDirection: 0, pointer: blankPointer() })),
    splat: runScenario(runs, steps, () => {
      const game = new SplatModel();
      game.setSide("layout");
      game.reset();
      return game;
    }, (game, step) => {
      if (step % 18 === 0) game.addPlatform(Math.max(25, Math.min(655, game.climber.x + 50 + Math.floor(Math.random() * 160))));
      game.update(0.05, { keyDirection: 0, pointerX: 0, placePlatform: undefined });
    }),
    asteroids: runScenario(runs, steps, () => {
      const game = new AsteroidsModel();
      game.setSide("rocks");
      game.reset();
      return game;
    }, (game, step) => {
      const spawnAsteroid = step % 30 === 0 ? { x: 20 + Math.random() * 760, y: 20 + Math.random() * 520 } : null;
      game.update(1 / 60, { attack: null, fire: false, spawnAsteroid });
    }),
    missile: runScenario(runs, steps, () => {
      const game = new MissileModel();
      game.setSide("attack");
      game.reset();
      return game;
    }, (game, step) => {
      const attack = step % 24 === 0 ? { x: 40 + Math.random() * 720 } : null;
      game.update(1 / 60, { aim: blankPointer(), launch: false, attack });
    }),
    starfall: runScenario(runs, steps, () => {
      const game = new StarfallModel();
      game.setSide("stars");
      game.reset();
      return game;
    }, (game, step) => {
      const spawnStar = step % 30 === 0 ? { x: 20 + Math.random() * 760, y: 20 } : null;
      game.update(1 / 60, { keyDirection: 0, pointerX: 0, spawnStar });
    }),
  };
  for (const [name, failures] of Object.entries(failureRates)) assert.ok(failures > 0, `${name} computer never failed`);
});
