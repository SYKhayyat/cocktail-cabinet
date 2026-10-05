import test from "node:test";
import assert from "node:assert/strict";
import { cabinet, GAMES, observe, seeded } from "./harness.mjs";
import { humanPolicy } from "./policies.mjs";

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const COMPUTER_HELPERS = ["chooseDirection", "routeScore", "canEnter", "refreshPerception", "aiShip", "moveComputer", "aiRunner", "visibleStars", "mostUrgentEnemy", "launchMachineInterceptor"];
const KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]);

for (const id of Object.keys(GAMES)) test(`${id}: player only emits real controls from frozen visual snapshots, with AI helpers disabled`, () => {
  seeded(57, () => {
    const host = cabinet(id, { lives: 1 });
    const player = humanPolicy(id, 57);
    for (const name of COMPUTER_HELPERS) if (typeof host.model[name] === "function") {
      host.model[name] = () => { throw new Error(`player baseline used production computer helper ${name}`); };
    }
    while (!host.ended && host.active < 15) {
      const visible = freeze(observe(id, host.model));
      assert.doesNotMatch(JSON.stringify(visible), /"(?:ai[A-Z]\w*|computer\w*|decisionLog|lastDecision|spawnClock|targetX|targetY)":/);
      const controls = player.controls(visible, host.active);
      assert.deepEqual(Object.keys(controls).sort(), ["keys", "mode", "pointer", "pressed"]);
      for (const name of [...controls.keys, ...controls.pressed]) assert.ok(KEYS.has(name));
      if (controls.pointer.moved) {
        assert.ok(Number.isFinite(controls.pointer.x) && Number.isFinite(controls.pointer.y));
        assert.ok(controls.pointer.x >= 0 && controls.pointer.x <= 800);
        assert.ok(controls.pointer.y >= 0 && controls.pointer.y <= 560);
      }
      host.step(controls);
    }
    assert.ok(player.metrics.actions > 0, "baseline actually exercised the controller");
    assert.equal(host.model.decisionLog.length, 0, "solo input does not invoke production computer decisions");
  });
});

test("seed scope restores Math.random after both successful and throwing probes", () => {
  const original = Math.random;
  const first = seeded(57, () => [Math.random(), Math.random()]);
  assert.equal(Math.random, original);
  assert.deepEqual(seeded(57, () => [Math.random(), Math.random()]), first);
  assert.throws(() => seeded(57, () => { throw new Error("probe interrupted"); }), /probe interrupted/);
  assert.equal(Math.random, original);
});

test("Breakout human reads a visible bank shot and pre-schedules release without extra perception", () => {
  const player = humanPolicy("breakout", 0);
  const visible = freeze({ paddle: { x: 670, y: 500, width: 112 }, balls: [{ x: 780, y: 400, vx: 300, vy: 200, radius: 8 }] });
  const first = player.controls(visible, 0);
  assert.deepEqual([...first.keys], ["ArrowLeft"], "the right-wall rebound lands to the left, not beyond the right edge");
  const unreadable = { get balls() { throw new Error("extra perception between polls"); } };
  assert.deepEqual([...player.controls(unreadable, 0.1).keys], [], "release the timed short correction rather than overshoot by a full 92px");
  assert.equal(player.metrics.polls, 1, "timed key-up is not an extra reaction or a new target read");
});

test("Asteroids human notices a close rock early and uses a bounded right-angle sidestep", () => {
  const player = humanPolicy("asteroids", 0);
  const visible = freeze({ ship: { x: 400, y: 280, angle: -Math.PI / 2 }, rocks: [{ x: 550, y: 280, radius: 25 }] });
  const controls = player.controls(visible, 0);
  assert.equal(controls.pointer.down, true, "150px is already a human escape opportunity, not a late 90px alarm");
  assert.ok(Math.abs(controls.pointer.x - 400) < 1e-9 && controls.pointer.y < 280, "a right-angle sidestep can continue the visible upward heading instead of an immediate 180-degree reversal");
  const far = humanPolicy("asteroids", 0).controls(freeze({ ...visible, rocks: [{ x: 650, y: 280, radius: 25 }] }), 0);
  const bearing = Math.atan2(far.pointer.y - 280, far.pointer.x - 400);
  assert.ok(Math.abs(bearing + Math.PI / 2) <= 2.8 * 0.2 + 1e-9, "cursor steering remains bounded even when aiming at a distant target");
});
