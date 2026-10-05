// Asteroids rocks mode: how the computer ship handles incoming rocks.
//
// A rock that misses wraps the board and comes round again, so threat time is a
// useful exposure denominator. Actual losses come from the model's explicit
// collision/life-loss events and are resolved through its normal hook.
import { AsteroidsModel, wrapDistance } from "../../src/games/asteroids/model.js";
import { seeded, rate } from "./snake.mjs";
import { lifecycle } from "./lifecycle.mjs";

export function measureAsteroids({ runs = 200, steps = 1200, dt = 1 / 60, dodgeRange = 105, lives = 3, aiTuning = {} } = {}) {
  const originalRandom = Math.random;
  let hits = 0;
  let resets = 0;
  let hazardProximityFrames = 0;
  let decisions = 0;
  let dodging = 0;
  let replanned = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = new AsteroidsModel({ aiTuning });
      game.setSide("rocks");
      game.reset();
      const round = lifecycle(game, { lives });
      for (let index = 0; index < 3; index += 1) game.spawnAsteroid();
      for (let step = 0; step < steps && !game.gameOver; step += 1) {
        let nearest = Infinity;
        for (const asteroid of game.asteroids) {
          if (!asteroid.radius) continue;
          const distance = wrapDistance(asteroid.x, asteroid.y, game.ship.x, game.ship.y);
          if (distance < nearest) nearest = distance;
        }
        if (nearest < dodgeRange) hazardProximityFrames += 1;
        game.update(dt, { attack: null, fire: false, spawnAsteroid: null });
        round.resolve();
        for (const event of game.eventLog.splice(0)) if (event.type === "life-loss" && event.owner === "human") hits += 1;
      }
      resets += round.resets;
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
    hazardProximityFrames,
    lossesPerThousandProximityFrames: hazardProximityFrames ? +(((hits / hazardProximityFrames) * 1000)).toFixed(2) : 0,
    resets,
    decisions,
    dodgingRate: rate(dodging, decisions),
    freshSwerveRate: rate(replanned, dodging),
    runs
  };
}
