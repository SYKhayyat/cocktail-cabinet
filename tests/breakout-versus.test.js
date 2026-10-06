import test from "node:test";
import assert from "node:assert/strict";
import { BREAKOUT_AI_DEFAULTS } from "../src/games/breakout/model.js";
import { measureBreakout } from "./ai/breakout.mjs";
import { CALIBRATION_SEEDS, VALIDATION_SEEDS, POLICIES, DT, HORIZON, humanInputs, versusDistribution, versusSample } from "./breakout-versus-probe.mjs";

const SEEDS = [...CALIBRATION_SEEDS, ...VALIDATION_SEEDS];
const defaults = new Map();

for (const policy of POLICIES) {
  test(`Breakout Versus ${policy}: bounded input wins without trivializing the duel, including a life-deficit comeback band`, () => {
    const normal = versusDistribution(policy, { seeds: SEEDS });
    const behind = versusDistribution(policy, { seeds: SEEDS, lifeDeficit: true });
    defaults.set(policy, normal);
    // 25-85% default wins and 33-75% from a one-life disadvantage. Counts,
    // denominators, independent input assumptions, and baseline are documented.
    assert.ok(normal.human >= 6 && normal.human <= 20, `${policy}: normal ${normal.human}/24 wins`);
    assert.ok(behind.human >= 8 && behind.human <= 18, `${policy}: one-life-deficit ${behind.human}/24 wins`);
    assert.ok(normal.lifeComebacks >= 4, `${policy}: ${normal.lifeComebacks}/24 natural life comebacks`);
    assert.ok(normal.computer >= 4, "computer remains a meaningful challenge");
    // Don't allow one seed partition to carry the whole result.
    for (const seeds of [CALIBRATION_SEEDS, VALIDATION_SEEDS]) {
      const chosen = normal.runs.filter((r) => seeds.includes(r.seed));
      assert.ok(chosen.filter((r) => r.outcome === "human").length >= 2);
      assert.ok(chosen.some((r) => r.outcome === "computer"));
      assert.ok(behind.runs.filter((r) => seeds.includes(r.seed) && r.outcome === "human").length >= 2);
    }
    for (const d of [normal, behind]) {
      assert.equal(d.censored, 0, "a timeout is not a win or loss");
      assert.equal(d.human + d.computer + d.tie + d.censored, 24);
      assert.ok(d.active.median >= 5 && d.active.max <= HORIZON);
      for (const run of d.runs) {
        assert.ok(run.polls <= Math.ceil(run.active / humanInputs(policy, run.seed).period) + 1);
        assert.ok(run.active <= HORIZON + DT);
        assert.ok(run.wall >= run.active);
        assert.ok(Object.values(run.lives).every((life) => life >= 0 && life <= 9));
      }
    }
    assert.deepEqual(versusSample(policy, SEEDS[0]), normal.runs[0], "seed reproduces the full trajectory and loss history");
    assert.deepEqual(versusSample(policy, SEEDS[0], { lifeDeficit: true }), behind.runs[0]);
  });
}

test("Breakout Versus natural score comebacks occur for more than one independent input strategy", () => {
  const distributions = POLICIES.map((policy) => defaults.get(policy) || versusDistribution(policy, { seeds: SEEDS }));
  assert.ok(distributions.filter((d) => d.comebacks > 0).length >= 2, "not only one optimized script can regain a 25-point deficit and win");
  assert.ok(distributions.reduce((sum, d) => sum + d.comebacks, 0) >= 3);
  for (const d of distributions) for (const run of d.runs.filter((r) => r.comeback)) {
    assert.ok(run.deficit.gap >= 25 && run.deficit.time >= 2);
    assert.ok(run.regained.time > run.deficit.time && run.regained.lead > 0);
    assert.equal(run.outcome, "human");
    assert.ok(run.scores.human > run.scores.computer, "the recovered score lead survives to victory");
  }
});

test("Breakout Versus idle controls cannot masquerade as a playable win band", () => {
  for (const lifeDeficit of [false, true]) {
    const idle = versusDistribution("idle", { seeds: SEEDS, lifeDeficit });
    assert.equal(idle.human, 0);
    assert.equal(idle.computer, 24);
    assert.equal(idle.censored, 0);
    assert.equal(idle.active.max < 5, true);
  }
});

test("Breakout human input holds observations between polls, with timed key release and independent aim strategies", () => {
  const a = { paddle: { x: 350, y: 500, width: 112 }, balls: [{ x: 700, y: 400, vx: 100, vy: 200, radius: 8 }] };
  const b = { paddle: { x: 350, y: 500, width: 112 }, balls: [{ x: 20, y: 400, vx: -100, vy: 200, radius: 8 }] };
  for (const policy of POLICIES) {
    const player = humanInputs(policy, 0);
    const initial = player.read(a, 0);
    assert.deepEqual(player.read(b, 0.01), initial, "new visual state cannot steer between polls");
    assert.equal(player.polls, 1);
    assert.notDeepEqual(player.read(b, player.period), initial, "the next observation can change control");
    assert.equal(player.polls, 2);
  }
  const pulse = humanInputs("bank-pulse", 0);
  pulse.read({ ...a, balls: [{ ...a.balls[0], x: 430, vx: 0 }] }, 0);
  assert.equal(pulse.read(b, 0.19).keys.size, 0, "pre-scheduled pulse releases without a new observation");
});

test("Breakout Blocks defaults remain unchanged by Versus calibration", () => {
  const keys = ["reactionMin", "reactionMax", "speed", "lookaheadBounces", "arriveTolerance", "dwellMin", "dwellMax", "initialReaction", "idleCenterX", "idleTolerance"];
  assert.deepEqual(Object.fromEntries(keys.map((key) => [key, BREAKOUT_AI_DEFAULTS[key]])), {
    reactionMin: 0.1, reactionMax: 0.18, speed: 600, lookaheadBounces: 1, arriveTolerance: 22,
    dwellMin: 0.18, dwellMax: 0.38, initialReaction: 0.08, idleCenterX: 344, idleTolerance: 8
  });
  assert.deepEqual(measureBreakout({ runs: 6, steps: 2000 }), measureBreakout({
    runs: 6, steps: 2000, aiTuning: { versusReactionMin: 0.14, versusReactionMax: 0.24 }
  }), "Versus reaction tuning cannot alter seeded Blocks trajectories");
});
