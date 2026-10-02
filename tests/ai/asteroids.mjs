// Asteroids rocks mode: how the computer ship handles incoming rocks.
//
// "Dodged" has no terminal event here -- a rock that misses wraps the board and
// comes round again -- so the measurement is hits against time spent inside the
// ship's own dodge range. That range is the model's constant, not one invented
// for the test.
import { AsteroidsModel, wrapDistance } from "../../src/games/asteroids/model.js";
import { seeded, rate } from "./snake.mjs";

export function measureAsteroids({ runs = 200, steps = 1200, dt = 1 / 60, dodgeRange = 105 } = {}) {
  const originalRandom = Math.random;
  let hits = 0;
  let threatFrames = 0;
  let decisions = 0;
  let dodging = 0;
  let replanned = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = new AsteroidsModel();
      game.setSide("rocks");
      game.reset();
      for (let index = 0; index < 3; index += 1) game.spawnAsteroid();
      for (let step = 0; step < steps; step += 1) {
        let nearest = Infinity;
        for (const asteroid of game.asteroids) {
          if (!asteroid.radius) continue;
          const distance = wrapDistance(asteroid.x, asteroid.y, game.ship.x, game.ship.y);
          if (distance < nearest) nearest = distance;
        }
        if (nearest < dodgeRange) threatFrames += 1;
        game.update(dt, { attack: null, fire: false, spawnAsteroid: null });
        if (game.lifeLost) {
          hits += 1;
          game.lifeLost = false;
        }
      }
      for (const entry of game.decisionLog) {
        decisions += 1;
        if (entry.dodging) {
          dodging += 1;
          if (entry.replanned) replanned += 1;
        }
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  return {
    hits,
    hitsPerRun: +(hits / runs).toFixed(2),
    threatFrames,
    hitsPerThousandThreatFrames: +(((hits / threatFrames) * 1000)).toFixed(2),
    decisions,
    dodgingRate: rate(dodging, decisions),
    freshSwerveRate: rate(replanned, dodging),
    runs
  };
}
