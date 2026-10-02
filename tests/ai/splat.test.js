import test from "node:test";
import assert from "node:assert/strict";
import { measureSplat } from "./splat.mjs";

test("Splat: the starting route is clearable, and a hard route is genuinely hard", () => {
  const starting = measureSplat({ runs: 100, step: null });
  // The route the game hands you is beatable. If this ever fails, a new player
  // has been given a route the ball cannot clear.
  assert.equal(starting.deathsPerRun, 0, "the starting route should cost no lives");
  assert.equal(starting.solvedRate, 100, "the starting route should always be solved");
  assert.ok(starting.clearedPerRun > 45, `cleared ${starting.clearedPerRun} gates`);

  // A route whose gates step 130px vertically is the interesting case: the ball
  // clears most of it, loses about a life, and finishes a little over half the
  // time. This is the number that can be tuned -- the starting route is not,
  // because nothing on it ever goes wrong.
  const hard = measureSplat({ runs: 100, step: 130 });
  assert.ok(hard.clearedPerRun > 38, `cleared ${hard.clearedPerRun} gates before failing`);
  assert.ok(hard.deathsPerRun > 0.7 && hard.deathsPerRun < 1.8, `lost ${hard.deathsPerRun} lives per attempt, expected 0.7-1.8`);
  assert.ok(hard.solvedRate > 40 && hard.solvedRate < 75, `solved ${hard.solvedRate}% of hard routes, expected 40-75%`);

  // It commits to a gap rather than re-aiming every frame, and it only starts
  // lining up for a gate once that gate is within its lookahead.
  assert.ok(hard.decisionsPerRun > 20 && hard.decisionsPerRun < 400, `${hard.decisionsPerRun} gap decisions per run`);
});
