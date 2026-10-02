import test from "node:test";
import assert from "node:assert/strict";
import { measureMissile } from "./missile.mjs";

test("Missile defence: interceptors connect, and most of the attack still gets through", () => {
  const measured = measureMissile({ runs: 150 });

  assert.ok(measured.fired > 1000, "enough interceptors judged");
  // The battery is a real defence but a leaky one. Interceptors fly a committed
  // course to a point the battery estimated, so they connect sometimes and miss
  // sometimes, without anything rolling for it.
  assert.ok(measured.hitRatePerShot > 2 && measured.hitRatePerShot < 20, `connected on ${measured.hitRatePerShot}% of shots`);
  assert.ok(measured.leakRate > 40 && measured.leakRate < 75, `${measured.leakRate}% of the attack got through`);

  // The aim is short of the true intercept, by a consistent margin, on purpose.
  // That is the whole error model: an imperfect estimate, not a dice.
  assert.ok(measured.meanAimShortfall > 3, `aim falls short of a perfect intercept by ${measured.meanAimShortfall}px on average`);
  assert.ok(measured.meanAimShortfall < 120, "and not so far that it is simply missing everything");
});
