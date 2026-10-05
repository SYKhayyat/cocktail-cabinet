import test from "node:test";
import assert from "node:assert/strict";
import { DT, SEEDS } from "./harness.mjs";
import { COMPLETION_HORIZON, completionDistribution, completionSample } from "./measure.mjs";

for (const id of ["breakout", "splat"]) for (const progressed of [false, true]) {
  test(`${id}: ${progressed ? "progressed" : "default"} clearance is independently reachable within a bounded three-life round`, () => {
    const result = completionDistribution(id, { progressed });
    assert.equal(result.runs.length, 12);
    assert.equal(result.completed + result.censored + result.exhausted, 12, "every round has exactly one observed terminal/censored outcome");
    assert.ok(result.completed >= 10, `${result.completed}/12 actual victories; score is not completion`);
    assert.ok(result.censored <= 2, "a stalled clearance must remain a visible censor, not a victory");
    assert.ok(result.exhausted <= 1, "a three-life default budget should usually be sufficient for clearance");
    if (id === "breakout") for (const run of result.runs) {
      if (!run.firstRespawn) continue;
      const expected = Math.hypot(180, 210) * 1.045 ** run.firstRespawn.difficulty;
      assert.ok(Math.abs(run.firstRespawn.speed - expected) < 1e-9,
        "clearance retries must retain difficulty pressure, not silently return to base speed");
    }
    for (const run of result.runs) {
      assert.ok(run.active > 0 && run.active <= COMPLETION_HORIZON + DT);
      assert.ok(run.wall >= run.active, "retry countdowns are excluded from active duration, not forgotten");
      assert.equal(Number(run.won) + Number(run.censored) + Number(run.exhausted), 1);
      if (run.censored) assert.ok(run.active >= COMPLETION_HORIZON - DT, "censor only at the predeclared time limit");
      if (run.won) assert.ok(run.remaining > 0, "victory comes through the real lifecycle without a fabricated replenishment");
    }
    assert.deepEqual(completionSample(id, SEEDS[0], { progressed }), result.runs[0]);
  });
}
