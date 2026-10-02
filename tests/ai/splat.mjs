// Splat: how many gates the ball gets through, and how many it hits.
//
// Difficulty here is not a property of the ball alone. Columns sit about 55px
// apart, so the knob that decides whether a route is hard or merely impossible
// is how far each gate moves vertically from the last one. The fixture therefore
// lays the route out as a bounded walk: each gap is up to `step` px from the one
// before. Random positions produce routes that are physically unreachable, which
// measures nothing.
import { SplatModel } from "../../src/games/splat/model.js";
import { seeded, rate } from "./snake.mjs";

export function measureSplat({ runs = 100, steps = 6500, dt = 1 / 60, step = 130, gapHeight = 50, lives = 3 } = {}) {
  const originalRandom = Math.random;
  let cleared = 0;
  let deaths = 0;
  let solved = 0;
  let decisions = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = new SplatModel();
      game.setSide("builder");
      game.reset();
      if (step !== null) {
        let y = 280;
        for (const column of game.columns) {
          y = Math.max(90, Math.min(430, y + Math.round((Math.random() * 2 - 1) * step)));
          column.gapY = y;
          column.gapHeight = gapHeight;
        }
      }
      let seen = new WeakSet();
      let budget = lives;
      for (let tick = 0; tick < steps && !game.won && budget > 0; tick += 1) {
        for (const column of game.columns) {
          if (column.passed && !seen.has(column)) {
            seen.add(column);
            cleared += 1;
          }
        }
        game.update(dt, {});
        if (game.lifeLost) {
          deaths += 1;
          budget -= 1;
          game.lifeLost = false;
          if (budget <= 0) break;
          game.resetAfterLife();
          seen = new WeakSet();
        }
      }
      if (game.won) solved += 1;
      decisions += game.decisionLog.length;
    }
  } finally {
    Math.random = originalRandom;
  }
  return {
    clearedPerRun: +(cleared / runs).toFixed(1),
    deathsPerRun: +(deaths / runs).toFixed(2),
    solvedRate: rate(solved, runs),
    columnsPerDeath: deaths ? +(cleared / deaths).toFixed(1) : null,
    decisionsPerRun: Math.round(decisions / runs),
    runs
  };
}
