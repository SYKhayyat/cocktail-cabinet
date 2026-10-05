// Starfall runner: explicit star outcomes and gem outcomes. The model emits one
// stable outcome per spawned entity, so off-screen cleanup is not a dodge or a
// collection opportunity.
import { StarfallModel } from "../../src/games/starfall/model.js";
import { seeded, rate } from "./snake.mjs";
import { lifecycle } from "./lifecycle.mjs";

export function measureStarfall({ runs = 200, steps = 600, dt = 1 / 60, lives = 3, aiTuning = {} } = {}) {
  const originalRandom = Math.random;
  let hits = 0;
  let starsRemoved = 0;
  let starsExpired = 0;
  let starsDespawned = 0;
  let starsDodged = 0;
  let threatening = 0;
  let gemsRemoved = 0;
  let gemsGot = 0;
  let gemsExpired = 0;
  let gemsDespawned = 0;
  let decisions = 0;
  let replans = 0;
  let blindFrames = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = new StarfallModel({ aiTuning });
      game.setSide("stars");
      game.reset();
      const round = lifecycle(game, { lives });
      for (let step = 0; step < steps && !game.gameOver; step += 1) {
        game.update(dt, {
          keyDirection: 0,
          pointerX: 400,
          pointerDown: true,
          spawnStar: step % 30 === 0 ? { x: 20 + Math.random() * 760, y: 20 } : null
        });
        round.resolve();
        for (const event of game.eventLog.splice(0)) {
          if (event.type === "star-threatened") threatening += 1;
          else if (event.type === "star-collision") { hits += 1; starsRemoved += 1; }
          else if (event.type === "star-dodged") { starsDodged += 1; starsRemoved += 1; }
          else if (event.type === "star-expired") { starsExpired += 1; starsRemoved += 1; }
          else if (event.type === "star-despawn") { starsDespawned += 1; starsRemoved += 1; }
          else if (event.type === "gem-collected") { gemsGot += 1; gemsRemoved += 1; }
          else if (event.type === "gem-passed") { gemsRemoved += 1; }
          else if (event.type === "gem-expired") gemsExpired += 1;
          else if (event.type === "gem-despawn") gemsDespawned += 1;
        }
      }
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
    starsExpired,
    starsDespawned,
    starsDodged,
    threatenedStars: threatening,
    resolvedThreats: starsDodged + hits,
    dodgeRateOnResolvedThreats: rate(starsDodged, starsDodged + hits),
    collisionRateOnResolvedThreats: rate(hits, starsDodged + hits),
    gemCollectionRate: rate(gemsGot, gemsRemoved),
    gemsCollected: gemsGot,
    gemsPassed: gemsRemoved - gemsGot,
    gemsExpired,
    gemsDespawned,
    replanRate: rate(replans, decisions),
    blindFrameRate: rate(blindFrames, decisions),
    decisions,
    runs
  };
}
