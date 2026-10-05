import test from "node:test";
import assert from "node:assert/strict";
import { measureAsteroids } from "./asteroids.mjs";

test("Asteroids rocks mode: the ship is beaten by rocks, not by a dice roll", () => {
  const measured = measureAsteroids({ runs: 150 });

  assert.ok(measured.hazardProximityFrames > 50000, "the ship spends real time near rocks");
  // The three initial rocks are not replenished in this fixture. A normal
  // respawn clears nearby rocks and grants grace; repeated collision frames
  // used to inflate this to roughly two lives. Corrected baseline: 0.18/run.
  assert.ok(measured.hitsPerRun > 0.05 && measured.hitsPerRun < 0.4, `lost ${measured.hitsPerRun} actual lives per session, expected 0.05-0.4`);
  assert.ok(measured.lossesPerThousandProximityFrames > 0.1 && measured.lossesPerThousandProximityFrames < 1, `${measured.lossesPerThousandProximityFrames} losses per 1000 nearby-rock frames, expected 0.1-1`);
  assert.equal(measured.resets, measured.hits, "every recorded loss was resolved and respawned");

  // It spends a lot of its time reacting to rocks...
  assert.ok(measured.dodgingRate > 20, `dodging on ${measured.dodgingRate}% of frames`);
  // ...and when it does, it holds the swerve it committed to rather than
  // replanning every frame, which is what makes a wrong read cost something.
  assert.ok(measured.freshSwerveRate < 20, `picked a fresh swerve on ${measured.freshSwerveRate}% of dodge frames, so commitments are held`);
});
