import test from "node:test";
import assert from "node:assert/strict";
import { StarfallModel, STARFALL_AI_DEFAULTS, starfallHumanDifficulty } from "../src/games/starfall/model.js";
import { cabinet, DT, input, seeded } from "./player/harness.mjs";
import { recoveryProbe } from "./player/recovery.mjs";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Only set up a controlled visible threat. Movement, collision, life loss and
// retry all run through the shipped controller/model/lifecycle thereafter.
function threatScene(score, x = 400, lives = 1) {
  const host = cabinet("starfall", { lives });
  const m = host.model;
  m.score = score;
  m.gems = [];
  m.stars = [m.newRunnerStar(x, 340)];
  m.runner.x = x;
  m.spawnClock = 10;
  return host;
}

function escape(score, x, direction, delay, dt = DT) {
  const host = threatScene(score, x);
  const key = direction < 0 ? "ArrowLeft" : "ArrowRight";
  while (!host.ended && host.active + 1e-9 < 1.8) {
    const keys = host.active + 1e-9 >= delay ? new Set([key]) : new Set();
    host.step(input({ keys }), dt);
  }
  return host;
}

test("Starfall human production spawns preserve the opening and ease monotonically to bounded pressure", () => {
  seeded(57, () => {
    for (const [score, speed, interval] of [
      [0, 130, 1.1], [25, 180, 0.95], [50, 230, 0.8],
      [75, 242.5, 0.75], [100, 255, 0.7], [150, 280, 0.6],
      [1_000_000, 280, 0.6], [Number.MAX_SAFE_INTEGER, 280, 0.6]
    ]) {
      const m = new StarfallModel();
      m.reset();
      m.score = score;
      m.gems = [];
      m.spawnClock = 0;
      m.update(DT, { mode: "keyboard", keyDirection: 0 });
      assert.equal(m.stars.length, 1);
      assert.equal(m.stars[0].vy, speed, `production speed at score ${score}`);
      assert.equal(m.stars[0].radius, 10);
      close(m.stars[0].y, 20 + speed * DT);
      close(m.spawnClock, interval);
    }
  });
  for (let score = 1; score <= 150; score += 1) {
    const before = starfallHumanDifficulty(score - 1);
    const after = starfallHumanDifficulty(score);
    assert.ok(after.starSpeed > before.starSpeed, `speed progresses at ${score}`);
    assert.ok(after.spawnInterval < before.spawnInterval, `cadence progresses at ${score}`);
  }
  for (const score of [151, 1000, 1_000_000, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(starfallHumanDifficulty(score), starfallHumanDifficulty(150));
  }
});

test("Starfall human ceilings pay for delayed reaction and keyboard collision clearance", () => {
  const host = seeded(57, () => threatScene(Number.MAX_SAFE_INTEGER));
  const star = host.model.stars[0];
  const clearance = host.model.runner.radius + star.radius;
  host.game.update(DT, input({ keys: new Set(["ArrowRight"]) }));
  const speed = (host.model.runner.x - 400) / DT;
  close(speed, 240);
  const budget = 0.35 + clearance / speed + DT;
  assert.ok((500 - 340 - clearance) / star.vy >= budget);
  assert.ok(starfallHumanDifficulty(host.model.score).spawnInterval >= 0.35 + 2 * clearance / speed + DT);
});

test("Starfall recovery fixture uses production difficulty and saves a 350ms delayed keyboard response", () => {
  for (const progressed of [false, true]) {
    assert.equal(recoveryProbe("starfall", progressed, 0).safe, true);
    assert.equal(recoveryProbe("starfall", progressed, 0.35).safe, true);
    assert.equal(recoveryProbe("starfall", progressed).safe, false);
  }
  assert.equal(recoveryProbe("starfall", true, 0.5).safe, false, "later responses must still lose");
  assert.equal(recoveryProbe("starfall", false, 1.2).safe, false);
});

test("Starfall delayed keyboard escapes work both ways and inward from either edge, even at extreme scores", () => {
  seeded(57, () => {
    for (const score of [150, 1_000_000, Number.MAX_SAFE_INTEGER]) {
      for (const [x, direction] of [[400, -1], [400, 1], [20, 1], [780, -1]]) {
        for (const dt of [DT / 2, DT, 1 / 30, 0.05]) {
          const host = escape(score, x, direction, 0.35, dt);
          assert.equal(host.losses, 0, `score=${score}, x=${x}, direction=${direction}, dt=${dt}`);
          assert.equal(host.ended, false);
          assert.equal(host.model.score, score);
          assert.ok(host.model.eventLog.some((event) => event.type === "star-dodged"));
          assert.ok(Math.abs(host.model.runner.x - x) > 26, "ordinary controls must actually clear the threat");
        }
      }
    }
  });
});

test("Starfall high-score idle, late and outward-at-edge responses still collide without invulnerability", () => {
  seeded(57, () => {
    for (const [x, direction, delay] of [[400, 1, Infinity], [400, -1, 0.5], [400, 1, 0.5], [20, -1, 0], [780, 1, 0]]) {
      const host = escape(Number.MAX_SAFE_INTEGER, x, direction, delay);
      assert.equal(host.losses, 1);
      assert.equal(host.ended, true);
      assert.ok(host.lossTimes[0] < 0.6);
      assert.ok(host.model.eventLog.some((event) => event.type === "star-collision"));
      assert.equal(host.model.score, Number.MAX_SAFE_INTEGER);
    }
  });
});

test("Starfall real life retry preserves earned score and human difficulty, then new round clears it", () => {
  seeded(57, () => {
    const host = threatScene(150, 400, 2);
    const difficulty = starfallHumanDifficulty(host.model.score);
    while (!host.losses) host.step(input());
    assert.equal(host.losses, 1);
    assert.equal(host.remaining, 1);
    assert.equal(host.countdown, 3);
    assert.equal(host.model.score, 150);
    assert.equal(host.model.lifeLost, false);
    assert.equal(host.model.pendingLifeLoss, false);
    assert.deepEqual(host.model.runner, { x: 400, y: 500, radius: 16 });
    assert.equal(host.model.stars.length, 0);
    assert.equal(host.model.gems.length, 3);
    assert.equal(host.model.spawnClock, 0.3);
    while (host.countdown > 0) host.step(input());
    assert.equal(host.model.score, 150);
    assert.deepEqual(starfallHumanDifficulty(host.model.score), difficulty);
    while (!host.model.stars.length) host.step(input());
    assert.equal(host.model.stars[0].vy, difficulty.starSpeed);
    close(host.model.spawnClock, difficulty.spawnInterval);
    assert.equal(host.losses, 1);
    host.lifecycle.startRound({ startingLives: 2, reason: "new-game" });
    assert.equal(host.model.score, 0);
    assert.deepEqual(starfallHumanDifficulty(host.model.score), { starSpeed: 130, spawnInterval: 1.1 });
  });
});

test("Starfall flipped star speeds and independently overridden AI tuning stay unchanged", () => {
  seeded(57, () => {
    for (const score of [0, 50, 150, 1000]) {
      const aiTuning = { speed: 0, visionHeight: 1000, lanes: [100, 400, 700] };
      const m = new StarfallModel({ aiTuning });
      m.setSide("stars");
      m.reset();
      m.score = score;
      m.update(DT, { spawnStar: { x: 400 }, pointerDown: false });
      assert.equal(m.stars[0].vy, 130 + score * 2);
      assert.equal(m.stars[0].userCreated, true);
      assert.equal(m.runner.x, 400);
      assert.equal(m.aiTuning.speed, 0);
      assert.deepEqual(m.aiTuning.lanes, aiTuning.lanes);
      assert.equal(STARFALL_AI_DEFAULTS.speed, 220);
      m.resetAfterLife();
      assert.equal(m.aiTuning.speed, 0);
      assert.equal(m.score, score);
    }
  });
});
