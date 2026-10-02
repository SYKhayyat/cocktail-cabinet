import test from "node:test";
import assert from "node:assert/strict";
import { measureAsteroids } from "./asteroids.mjs";

test("Asteroids rocks mode: the ship is beaten by rocks, not by a dice roll", () => {
  const measured = measureAsteroids({ runs: 150 });

  assert.ok(measured.threatFrames > 50000, "the ship spends real time under threat");
  // Previously the ship lost 0.6 lives per session while spending most of the
  // time inside its own dodge range: it was effectively unkillable. It now loses
  // roughly twice per 20-second window, which is a visible but survivable
  // opponent for someone placing rocks.
  assert.ok(measured.hitsPerRun > 0.9 && measured.hitsPerRun < 3.2, `lost ${measured.hitsPerRun} lives per session, expected 0.9-3.2`);
  assert.ok(measured.hitsPerThousandThreatFrames > 2 && measured.hitsPerThousandThreatFrames < 8, `${measured.hitsPerThousandThreatFrames} hits per 1000 frames under threat, expected 2-8`);

  // It spends a lot of its time reacting to rocks...
  assert.ok(measured.dodgingRate > 20, `dodging on ${measured.dodgingRate}% of frames`);
  // ...and when it does, it holds the swerve it committed to rather than
  // replanning every frame, which is what makes a wrong read cost something.
  assert.ok(measured.freshSwerveRate < 20, `picked a fresh swerve on ${measured.freshSwerveRate}% of dodge frames, so commitments are held`);
});
