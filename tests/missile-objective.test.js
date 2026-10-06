import test from "node:test";
import assert from "node:assert/strict";
import { MissileModel } from "../src/games/missile/model.js";

function attacker() {
  const model = new MissileModel();
  model.setSide("attacker");
  model.reset();
  model.interceptorClock = 999;
  return model;
}

test("an attacker scores target destruction once, not repeated hits on ruins", () => {
  const model = attacker();
  const city = model.cities[0];
  const first = { targetObject: city, kind: "city" };
  model.impactEnemy(first);
  model.impactEnemy(first);
  model.impactEnemy({ targetObject: city, kind: "city" });
  assert.equal(model.score, 100);
  assert.equal(model.eventLog.length, 2);
});

test("city-clear victory retains exactly six city rewards across repeated terminal checks", () => {
  const model = attacker();
  for (const city of model.cities) model.impactEnemy({ targetObject: city, kind: "city" });
  model.update(0, {});
  model.checkGameOver();
  assert.equal(model.won, true);
  assert.equal(model.winner, "human");
  assert.equal(model.score, 600);
});

for (const kind of ["city", "battery"]) {
  test(`a dragged missile rewards the ${kind} it actually touches, not its nominal target`, () => {
    const model = attacker();
    const target = kind === "city" ? model.cities[2] : model.bases[1];
    const nominal = model.cities[0];
    model.enemyMissiles = [{ x: target.x, y: target.y, targetX: nominal.x, targetY: nominal.y, targetObject: nominal, kind: "city", freeFlight: true, vx: 0, vy: 0 }];
    model.update(0, {});
    assert.equal(target.alive, false);
    assert.equal(nominal.alive, true);
    assert.equal(model.score, kind === "city" ? 100 : 50);
  });
}

test("a dragged missile crossing ground away from a target earns nothing", () => {
  const model = attacker();
  const nominal = model.cities[0];
  model.enemyMissiles = [{ x: 850, y: 570, targetX: nominal.x, targetY: nominal.y, targetObject: nominal, kind: "city", freeFlight: true, vx: 0, vy: 0 }];
  model.update(0, {});
  assert.equal(model.score, 0);
  assert.equal(nominal.alive, true);
});
