import test from "node:test";
import assert from "node:assert/strict";
import { measureSnake, rate } from "./snake.mjs";

test("Snake computer: turn quality, survival, and error that is not dice", () => {
  // Measured on the cramped board, because the roomy board almost never puts the
  // snake in a tight spot: only 7 decisions out of 51944 had a single safe
  // option, so safety could not be checked at all.
  const cramped = measureSnake({ settings: { cols: 12, rows: 9, startingLength: 7 } });
  const roomy = measureSnake({});

  assert.ok(cramped.decisions > 10000, "enough decisions to judge");
  assert.ok(cramped.bySafety[1] && cramped.bySafety[1].total > 100, "the cramped board produces tight decisions to compare against");

  // Not a perfect solver, and not randomly flailing either. Greedy stepping is
  // the baseline, so this sits near half by construction; the point is that it
  // is neither 0% nor 100%.
  assert.ok(cramped.wrongRate > 25 && cramped.wrongRate < 70, `wrong-turn rate was ${cramped.wrongRate}%, expected 25-70%`);

  // The requested invariant: safety must not determine how likely a wrong turn
  // is. Compared across buckets where the snake actually had a choice: with one
  // legal move the rate is 0% by arithmetic, not by judgement, so including it
  // would test nothing.
  const open = rate(cramped.bySafety[3].wrong, cramped.bySafety[3].total);
  const choice = rate(cramped.bySafety[2].wrong, cramped.bySafety[2].total);
  assert.ok(open > 20, `with three safe options the snake is still wrong ${open}% of the time, so it is not a perfect planner`);
  assert.ok(Math.abs(open - choice) < 20, `wrong-turn rate must not be decided by safety: ${open}% with the board open vs ${choice}% with one alternative`);
  // And having no legal move at all is a real state, not one the old scoring
  // could even see: it treats a cell inside the snake's body as safe.
  assert.ok(cramped.bySafety[0] && cramped.bySafety[0].total > 20, "boxed-in situations with no legal move are detected");

  // Momentum: the snake holds a heading for a meaningful share of turns, which is
  // what stops it re-planning every single move like a machine.
  assert.ok(cramped.heldRate > 10 && cramped.heldRate < 70, `heading held on ${cramped.heldRate}% of turns, expected 10-70%`);

  // Survival, on the board people actually play.
  assert.ok(roomy.deathsPerRun > 3 && roomy.deathsPerRun < 30, `died on ${roomy.deathsPerRun}% of runs, expected 3-30%`);
  assert.ok(roomy.secondsToDeath > 25 && roomy.secondsToDeath < 70, `lasted ${roomy.secondsToDeath}s on average, expected 25-70s`);

  // The mechanism, decomposed. Momentum is the factor that carries the mistake;
  // with it removed and full knowledge restored, the snake is a perfect planner.
  // If it were still wrong, the imperfection would be coming from somewhere the
  // model cannot account for -- randomness, or a bug in this test's scoring.
  const crampedSettings = { cols: 12, rows: 9, startingLength: 7 };
  const perfect = measureSnake({ settings: crampedSettings, perfectPerception: true, noMomentum: true });
  assert.ok(perfect.wrongRate < 2, `with no momentum and full knowledge the snake is optimal (${perfect.wrongRate}% wrong)`);

  const momentum = measureSnake({ settings: crampedSettings, perfectPerception: true });
  assert.ok(momentum.wrongRate > 20, `momentum alone accounts for ${momentum.wrongRate}% wrong turns`);

  // The reaction delay only costs the snake anything when the apple moves, which
  // in this mode means when the player moves it. Measured against a still apple
  // it looks inert, which would be a false all-clear.
  const stillApple = measureSnake({ settings: crampedSettings, noMomentum: true });
  const movingApple = measureSnake({ settings: crampedSettings, noMomentum: true, placeApples: true });
  const perfectMovingApple = measureSnake({ settings: crampedSettings, noMomentum: true, placeApples: true, perfectPerception: true });
  assert.ok(movingApple.wrongRate > stillApple.wrongRate + 3,
    `a moving apple should make the delay bite: ${movingApple.wrongRate}% wrong against ${stillApple.wrongRate}% when it stands still`);
  assert.ok(perfectMovingApple.wrongRate < movingApple.wrongRate,
    `removing the reaction delay recovers those turns, so the loss came from the delay (${perfectMovingApple.wrongRate}% against ${movingApple.wrongRate}%)`);
});
