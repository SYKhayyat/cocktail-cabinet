import test from "node:test";
import assert from "node:assert/strict";
import { measureStarfall } from "./starfall.mjs";

test("Starfall runner: limited sight, held lanes, stars dodged and gems taken", () => {
  const measured = measureStarfall({ runs: 150 });

  assert.ok(measured.starsRemoved > 1000, "enough stars judged");
  // The runner dodges nearly everything, and that is a property of the lane
  // layout rather than of its reaction time -- see the note below. What the
  // factors do control is that a threatening star can now connect at all.
  assert.ok(measured.dodgedRate > 90, `dodged ${measured.dodgedRate}% of stars`);
  assert.ok(measured.hitRateOnThreatening > 0.8 && measured.hitRateOnThreatening < 10,
    `${measured.hitRateOnThreatening}% of stars that came into range connected`);

  // Gems: it collects some and misses some, so it is trading safety for score
  // rather than only ever running for cover.
  assert.ok(measured.gemsGotRate > 25 && measured.gemsGotRate < 45, `collected ${measured.gemsGotRate}% of gems that passed it`);

  // It holds a lane rather than re-picking the safest one every frame.
  assert.ok(measured.replanRate < 25, `re-chose a lane on only ${measured.replanRate}% of frames`);

  // And it is blind to part of the board: stars arrive above its sight line and
  // are only counted once they have fallen past it.
  assert.ok(measured.blindFrameRate > 5, `on ${measured.blindFrameRate}% of frames at least one star was above its sight line`);
});
