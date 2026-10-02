// Starfall runner: stars dodged against stars that connected, and gems taken.
//
// The headline dodged percentage is misleading on its own, because most stars
// dropped at a random x never come near the runner at all. So the number that
// matters is how often a star that genuinely came into range actually connected.
import { StarfallModel } from "../../src/games/starfall/model.js";
import { seeded, rate } from "./snake.mjs";

export const THREAT_RANGE = 60;

export function measureStarfall({ runs = 200, steps = 600, dt = 1 / 60, threatRange = THREAT_RANGE } = {}) {
  const originalRandom = Math.random;
  let hits = 0;
  let starsRemoved = 0;
  let threatening = 0;
  let gemsRemoved = 0;
  let gemsGot = 0;
  let decisions = 0;
  let replans = 0;
  let blindFrames = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = new StarfallModel();
      game.setSide("stars");
      game.reset();
      const closest = new Map();
      for (let step = 0; step < steps; step += 1) {
        for (const star of game.stars) {
          const distance = Math.abs(star.x - game.runner.x);
          if (!closest.has(star) || distance < closest.get(star)) closest.set(star, distance);
        }
        const starsBefore = game.stars.length;
        const gemsBefore = game.gems.length;
        const scoreBefore = game.score;
        game.update(dt, {
          keyDirection: 0,
          pointerX: 400,
          pointerDown: true,
          spawnStar: step % 30 === 0 ? { x: 20 + Math.random() * 760, y: 20 } : null
        });
        starsRemoved += Math.max(0, starsBefore - game.stars.length);
        gemsRemoved += Math.max(0, gemsBefore - game.gems.length);
        gemsGot += (game.score - scoreBefore) / 50;
        if (game.lifeLost) {
          hits += 1;
          game.lifeLost = false;
        }
      }
      for (const [, distance] of closest) if (distance <= threatRange) threatening += 1;
      for (const entry of game.decisionLog) {
        decisions += 1;
        if (entry.replanned) replans += 1;
        if (entry.starsOnBoard > entry.starsSeen) blindFrames += 1;
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  return {
    hits,
    starsRemoved,
    threatening,
    dodgedRate: rate(starsRemoved - hits, starsRemoved),
    hitRateOnThreatening: rate(hits, threatening),
    gemsGotRate: rate(gemsGot, gemsRemoved),
    replanRate: rate(replans, decisions),
    blindFrameRate: rate(blindFrames, decisions),
    decisions,
    runs
  };
}
