import test from "node:test";
import assert from "node:assert/strict";
import { cabinet, DT, GAMES, input, observe, SEEDS, seeded } from "./harness.mjs";
import { distribution, HORIZONS, pressure, sample } from "./measure.mjs";
import { humanPolicy } from "./policies.mjs";
import { recoveryWindow } from "./recovery.mjs";

// Broad mechanical guardrails. They are not a fun rating or population study.
// See docs/player-experience.md for hypotheses, denominators and calibration.
const BANDS = {
  snake: { medianSurvival: 20, medianGain: 5, opportunities: 100, progressedMinimum: 2, sustained: 20, choices: 100, windows: 15, objectives: 5, idleMax: 5, rewardGap: 12 },
  breakout: { medianSurvival: 15, medianGain: 30, opportunities: 20, progressedMinimum: 15, sustained: 15, choices: 20, windows: 10, objectives: 5, idleMax: 3, rewardGap: 22 },
  splat: { medianSurvival: 20, medianGain: 15, opportunities: 50, progressedMinimum: 10, sustained: 15, choices: 30, windows: 10, objectives: 10, idleMax: 2, rewardGap: 3 },
  asteroids: { medianSurvival: 8, medianGain: 50, opportunities: 20, progressedMinimum: 3, sustained: 8, choices: 30, windows: 8, objectives: 5, idleMax: 40, rewardGap: 8 },
  missile: { medianSurvival: 30, medianGain: 150, opportunities: 20, progressedMinimum: 15, sustained: 25, choices: 30, windows: 10, objectives: 10, idleMax: 45, rewardGap: 22 },
  starfall: { medianSurvival: 15, medianGain: 50, opportunities: 20, progressedMinimum: 3, sustained: 15, choices: 40, windows: 10, objectives: 2, idleMax: 45, rewardGap: 20 }
};

for (const id of Object.keys(GAMES)) {
  test(`${id}: default and progressed HUMAN-input distributions have reachable rewards and choices`, () => {
    const normal = distribution(id);
    const harder = distribution(id, { progressed: true });
    const idle = distribution(id, { idle: true });
    const band = BANDS[id];
    assert.equal(normal.runs.length, 12);
    assert.ok(normal.survival.median >= band.medianSurvival, `${id}: first-loss median ${normal.survival.median}`);
    assert.ok(normal.gain.median >= band.medianGain, `${id}: score gain median ${normal.gain.median}`);
    assert.ok(normal.survival.p25 >= band.medianSurvival / 2, "lower survival quartile remains out of the instant-loss band");
    assert.ok(normal.gain.p25 >= band.medianGain / 2, "score reachability is not carried by one lucky seed");
    assert.ok(normal.reached >= 10, `${id}: rewards reachable in ${normal.reached}/12 defaults`);
    assert.ok(normal.opportunities.median >= band.opportunities, `${id}: choice-bearing polls ${normal.opportunities.median}`);
    assert.ok(normal.rewardDrought.max <= band.rewardGap, `${id}: longest unrewarded default interval ${normal.rewardDrought.max}`);
    assert.ok(harder.survival.min >= band.progressedMinimum, `${id}: progressed early loss ${harder.survival.min}`);
    assert.ok(harder.reached >= 9, `${id}: progressed reachability ${harder.reached}/12`);
    const durationFloor = id === "splat" ? band.sustained : Math.max(band.sustained, normal.survival.p25 * 0.5);
    assert.ok(harder.survival.p25 >= durationFloor, `${id}: progressed lower-tail duration ${harder.survival.p25} < ${durationFloor}`);
    assert.ok(harder.opportunities.p25 >= band.choices, "progressed lower-tail agency must span multiple decision cycles");
    assert.ok(harder.agencyWindows.p25 >= band.windows, "actionable choices cannot all be clustered into a single early threat");
    assert.ok(harder.objective.p25 >= band.objectives, "progressed lower-tail reward must be more than a token success");
    const sustained = harder.runs.filter((r) => r.survival >= durationFloor && r.opportunities >= band.choices && r.agencyWindows >= band.windows && r.objective >= band.objectives && (id !== "breakout" || r.paddleReturns >= 3));
    assert.ok(sustained.length >= 10, `${id}: only ${sustained.length}/12 progressed runs provide sustained agency and rewards`);
    assert.ok(normal.gain.mean > idle.gain.mean + band.medianGain / 2, "active play materially outperforms doing nothing");
    assert.ok(normal.objective.mean > idle.objective.mean, "domain objectives, not just passive bonus points, reward input");
    if (id === "missile") assert.ok(normal.runs.filter((r) => r.levelsAdvanced >= 1).length >= 10, "default defender can reach the next level, not merely fire ammo");
    assert.ok(normal.survival.median > idle.survival.median + 3, "active play provides a survival advantage over idle input");
    assert.ok(idle.survival.p75 <= band.idleMax, "idle death is bounded in at least 75% of this fixed seed sample");
    assert.ok(idle.runs.filter((r) => r.losses > 0).length >= 9, "idle-death check must actually encounter losses");
    for (const result of [normal, harder]) for (const r of result.runs) {
      assert.ok(Number.isFinite(r.gain) && r.gain >= 0);
      assert.ok(r.survival > 0 && r.survival <= HORIZONS[id] + DT);
      assert.ok(r.actions > 0 && r.opportunities <= r.polls);
      const maxRate = id === "snake" ? 10 : id === "splat" ? 1 / 0.12 : 5;
      assert.ok(r.polls <= Math.ceil(r.active * maxRate) + 1, "bounded human input frequency");
    }
    // Seed and polling phase must reproduce actual trajectories, not just bands.
    assert.deepEqual(sample(id, SEEDS[0]), normal.runs[0]);
  });

  test(`${id}: mechanical progression is monotone without claiming score is monotone`, () => {
    const a = pressure(id, false), b = pressure(id, true);
    if (id === "snake") { assert.ok(b.speed > a.speed); assert.ok(b.body > a.body); }
    if (id === "breakout") { assert.ok(b.speed > a.speed * 1.2); assert.equal(b.width, a.width); }
    if (id === "splat") { assert.ok(b.gap < a.gap); assert.equal(b.spacing, a.spacing); }
    if (id === "asteroids" || id === "starfall") { assert.ok(b.speed > a.speed); assert.ok(b.spawnInterval < a.spawnInterval); }
    if (id === "missile") { assert.ok(b.speed > a.speed); assert.ok(b.enemies > a.enemies); assert.ok(b.spawnInterval < a.spawnInterval); }
    const curve = [false, 1 / 3, 2 / 3, true].map((stage) => pressure(id, stage));
    for (let i = 1; i < curve.length; i += 1) {
      const before = curve[i - 1], after = curve[i];
      if (id === "splat") assert.ok(after.gap < before.gap, "each ten-column section narrows the gap");
      else assert.ok(after.speed > before.speed, "each sampled progression step increases speed");
      if ("spawnInterval" in after) assert.ok(after.spawnInterval < before.spawnInterval);
      if ("enemies" in after) assert.ok(after.enemies > before.enemies);
    }
  });

  test(`${id}: a visible near-miss has a finite input-mediated recovery window`, () => {
    for (const progressed of [false, true]) {
      const result = recoveryWindow(id, progressed);
      assert.equal(result.idle.safe, false, "the no-input counterfactual must really lose a life/city");
      assert.equal(result.outcomes[0].safe, true, "immediate ordinary human input must save the scene");
      const minimumDelay = id === "starfall" ? 0.35 : 0.1;
      assert.ok(result.maxSafeDelay >= minimumDelay, `at least a ${minimumDelay * 1000}ms reaction window; got ${result.maxSafeDelay}`);
      assert.ok(result.outcomes.some((r) => !r.safe), "delaying eventually makes the rescue fail");
    }
  });

  if (id !== "missile") test(`${id}: real idle losses consume a finite life budget; retries freeze then restart safely`, () => {
    seeded(57, () => {
      const host = cabinet(id, { lives: 3 });
      while (!host.ended && host.losses === 0 && host.active < 60) host.step(input());
      assert.equal(host.losses, 1, "must exercise an actual loss, not inject the lifeLost flag");
      assert.equal(host.remaining, 2);
      assert.equal(host.countdown, 3);
      const frozen = observe(id, host.model);
      for (let i = 0; i < 120; i += 1) host.step(input());
      assert.deepEqual(observe(id, host.model), frozen, "the model cannot spend lives while the countdown is running");
      const active = host.active;
      while (host.countdown > 0) host.step(input());
      const policy = humanPolicy(id, 57);
      while (!host.ended && host.active < active + 0.25) host.step(policy.controls(observe(id, host.model), host.active - active));
      assert.equal(host.losses, 1, "respawn leaves a quarter-second to act before another loss");
      while (!host.ended && host.wall < 200) host.step(input());
      assert.equal(host.ended, true, "the host must not endlessly resurrect idle play");
      assert.equal(host.losses, 3);
      assert.equal(host.remaining, 0);
      assert.equal(host.lifecycle.resultState().ended, true);
    });
  });
}
