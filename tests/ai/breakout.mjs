// Breakout computer: balls returned against balls missed, plus survival.
//
// The paddle decides a direction rather than a coordinate, so the measurement is
// simple: how many balls did it get a paddle under, and how many went past.
import { BreakoutModel } from "../../src/games/breakout/model.js";
import { seeded, rate } from "./snake.mjs";

export function measureBreakout({ runs = 200, steps = 5000, dt = 1 / 60, side = "blocks", aiTuning = {} } = {}) {
  const originalRandom = Math.random;
  let hits = 0;
  let misses = 0;
  let decisions = 0;
  let held = 0;
  let reversals = 0;
  let sessions = 0;
  let firstMissAt = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = new BreakoutModel({ aiTuning });
      game.setSide(side);
      game.reset();
      let seenMiss = false;
      for (let step = 0; step < steps; step += 1) {
        game.update(dt, { mode: "mouse", keyDirection: 0, pointer: { x: 0, y: 0, moved: false, clicked: false, down: false } });
        if (game.won) break;
      }
      hits += game.paddleHits;
      misses += game.paddleMisses;
      if (!seenMiss && game.paddleMisses > 0) {
        seenMiss = true;
        firstMissAt += 1;
      }
      for (const entry of game.decisionLog) {
        decisions += 1;
        if (entry.intent === 0) held += 1;
        if (entry.previousIntent && entry.intent && entry.previousIntent !== entry.intent) reversals += 1;
      }
      sessions += 1;
    }
  } finally {
    Math.random = originalRandom;
  }
  return {
    hits,
    misses,
    returnRate: rate(hits, hits + misses),
    missRate: rate(misses, hits + misses),
    decisions,
    heldRate: rate(held, decisions),
    reversalRate: rate(reversals, decisions),
    sessionsWithAMiss: rate(firstMissAt, sessions),
    runs
  };
}
