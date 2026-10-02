import test from "node:test";
import assert from "node:assert/strict";
import { measureBreakout } from "./breakout.mjs";

test("Breakout computer: balls returned, balls missed, and misses that are not dice", () => {
  const measured = measureBreakout({ runs: 150 });

  assert.ok(measured.hits + measured.misses > 1000, "enough balls judged");
  // The paddle is not a wall and not a liability. Before this change it
  // returned 97.7% of balls once the injected error came out; the dwell is what
  // makes a committed misjudgement cost something.
  assert.ok(measured.missRate > 5 && measured.missRate < 20, `missed ${measured.missRate}% of balls, expected 5-20%`);
  assert.ok(measured.returnRate > 80, `returned ${measured.returnRate}% of balls`);

  // It does not miss because it rolled badly: it misses most sessions, which a
  // per-decision dice would not produce, and it holds still on a fifth of its
  // decisions, so it is not flailing.
  assert.ok(measured.sessionsWithAMiss > 60, `${measured.sessionsWithAMiss}% of sessions included a miss`);
  assert.ok(measured.heldRate > 5 && measured.heldRate < 45, `held still on ${measured.heldRate}% of decisions`);

  // The dwell is the factor that carries the difficulty, so it should be
  // responsible for a large share of the direction changes.
  assert.ok(measured.reversalRate < 40, `reversed direction on only ${measured.reversalRate}% of decisions`);
});
