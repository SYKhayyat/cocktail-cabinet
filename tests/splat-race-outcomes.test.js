import test from "node:test";
import assert from "node:assert/strict";
import { SplatModel } from "../src/games/splat/model.js";
import { SplatGame } from "../src/games/splat/index.js";

const input = { drift: 0, bounce: 0 };
function race(tuning = {}) {
  const model = new SplatModel({ aiTuning: tuning });
  model.setSide("race");
  model.reset();
  // Finish line 400; distant column cannot cause unrelated collisions.
  model.columns = [{ id: 1, x: 300, width: 30, gapY: 60, gapHeight: 440, passed: true }];
  return model;
}

test("Splat exact simultaneous finish is a tie, not a human branch-order win", () => {
  const model = race();
  model.player.x = model.computerPlayer.x = 399;
  model.updateRace(1 / 60, input);
  assert.equal(model.won, true);
  assert.equal(model.winner, null);
  assert.equal(model.versusTie, true);
  const game = new SplatGame();
  game.model = model;
  assert.equal(game.lifecycle.resultState().heading, "TIE");
  assert.match(game.winMessage(), /tie/i);
  assert.match(game.publicState().status, /tie/i);
});

test("Splat compares within-step crossing times when both finish", () => {
  for (const [humanX, computerX, winner] of [[397, 399, "computer"], [399, 397, "human"]]) {
    const model = race();
    model.player.x = humanX;
    model.computerPlayer.x = computerX;
    model.updateRace(0.05, input);
    assert.equal(model.winner, winner);
    assert.equal(model.versusTie, false);
  }
  const model = race({ horizontalSpeed: 240 });
  model.player.x = 397;
  model.computerPlayer.x = 396;
  model.updateRace(0.05, input);
  assert.equal(model.winner, "computer", "fractional crossing time matters, not final x or human-first branch");
});

test("Splat simultaneous final-life collisions are a tie regardless of queue order", () => {
  for (const reversed of [false, true]) {
    const model = race();
    model.raceLives = { human: 1, computer: 1 };
    model.lostPlayers = reversed ? [model.computerPlayer, model.player] : [model.player, model.computerPlayer];
    const loss = model.handleLifeLoss();
    assert.equal(loss.gameOver, true);
    assert.equal(model.winner, null);
    assert.equal(model.versusTie, true);
    assert.match(loss.message, /tie/i);
  }
});

test("Splat one-sided finish and elimination still choose the actual owner", () => {
  const model = race();
  model.player.x = 399;
  model.computerPlayer.x = 390;
  model.updateRace(1 / 60, input);
  assert.equal(model.winner, "human");
  model.reset();
  assert.equal(model.versusTie, false);
  model.raceLives = { human: 2, computer: 1 };
  model.lostPlayers = [model.computerPlayer];
  model.handleLifeLoss();
  assert.equal(model.winner, "human");
  assert.equal(model.versusTie, false);
});
