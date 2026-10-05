import test from "node:test";
import assert from "node:assert/strict";
import { measureStarfall } from "./starfall.mjs";

test("Starfall runner: limited sight, held lanes, stars dodged and gems taken", () => {
  const measured = measureStarfall({ runs: 150 });

  assert.ok(measured.starsRemoved > 1000, "enough stars judged");
  // Only collision-course stars within one commitment window are threats.
  // Cleanup is excluded; the corrected seeded baseline is 62.1% dodged.
  assert.ok(measured.resolvedThreats > 40, "enough real collision opportunities judged");
  assert.ok(measured.dodgeRateOnResolvedThreats > 45 && measured.dodgeRateOnResolvedThreats < 80,
    `dodged ${measured.dodgeRateOnResolvedThreats}% of resolved threats`);
  assert.ok(measured.collisionRateOnResolvedThreats > 20 && measured.collisionRateOnResolvedThreats < 55,
    `${measured.collisionRateOnResolvedThreats}% of resolved imminent threats connected`);
  assert.equal(measured.starsRemoved, measured.starsExpired + measured.starsDespawned + measured.starsDodged + measured.hits);

  // Gems: it collects some and misses some, so it is trading safety for score
  // rather than only ever running for cover.
  assert.ok(measured.gemCollectionRate > 8 && measured.gemCollectionRate < 25, `collected ${measured.gemCollectionRate}% of gems that reached the runner's row`);

  // It holds a lane rather than re-picking the safest one every frame.
  assert.ok(measured.replanRate < 25, `re-chose a lane on only ${measured.replanRate}% of frames`);

  // And it is blind to part of the board: stars arrive above its sight line and
  // are only counted once they have fallen past it.
  assert.ok(measured.blindFrameRate > 5, `on ${measured.blindFrameRate}% of frames at least one star was above its sight line`);
});
