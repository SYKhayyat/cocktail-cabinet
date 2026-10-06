import test from "node:test";
import assert from "node:assert/strict";
import { BreakoutGame } from "../src/games/breakout/index.js";

const INPUT = { mode: "keyboard", keys: new Set(), pointer: { x: 0, moved: false } };

function duel(lives = 1) {
  const game = new BreakoutGame();
  game.setSide("versus");
  game.lifecycle.startRound({ startingLives: lives, reason: "load" });
  return game;
}

for (const order of [["human", "computer"], ["computer", "human"]]) {
  test(`Breakout simultaneous final exits are a tie, independent of ${order.join("/")} order and score`, () => {
    for (const scores of [{ human: 100, computer: 10 }, { human: 10, computer: 100 }, { human: 10, computer: 10 }]) {
      const game = duel();
      const m = game.model;
      m.scores = scores;
      m.balls = order.map((owner) => m.newOwnedBall(owner));
      for (const ball of m.balls) ball.y = ball.owner === "human" ? 550 : -20;
      game.update(0, INPUT);
      const loss = game.lifecycle.resolveLifeLoss();
      assert.equal(loss.gameOver, true);
      assert.deepEqual(m.playerLives, { human: 0, computer: 0 });
      assert.equal(game.winner, null);
      assert.equal(game.versusTie, true);
      assert.equal(game.won, false);
      assert.equal(m.versusRoundOver, true);
      assert.match(loss.message, /tie/i);
      assert.equal(game.lifecycle.resultState().heading, "TIE");
      assert.match(game.publicState().status, /tie/i);
      assert.match(game.lifecycle.resolveLifeLoss().message, /tie/i, "terminal resolution stays a tie");
    }
  });
}

for (const eliminated of ["human", "computer"]) {
  test(`Breakout ${eliminated} final-life elimination has consistent terminal flags and no score-win claim`, () => {
    const game = duel();
    const m = game.model;
    m.scores[eliminated] = 100;
    m.pendingLifeLossOwners = [eliminated];
    const loss = game.lifecycle.resolveLifeLoss();
    assert.equal(loss.gameOver, true);
    assert.equal(m.versusRoundOver, true);
    assert.equal(game.winner, eliminated === "human" ? "computer" : "human");
    assert.equal(game.won, eliminated === "computer");
    assert.equal(game.versusTie, false);
    assert.match(game.publicState().status, /lives/i);
    assert.doesNotMatch(game.publicState().status, /highest score/i);
  });
}

test("Breakout clearance ties clear stale win flags and a new round clears outcome state", () => {
  const game = duel();
  game.model.scores = { human: 20, computer: 10 };
  game.model.finishVersus();
  assert.equal(game.won, true);
  game.model.scores.computer = 20;
  game.model.finishVersus();
  assert.equal(game.won, false);
  assert.equal(game.versusTie, true);
  game.lifecycle.startRound({ startingLives: 3, reason: "restart" });
  assert.equal(game.versusTie, false);
  assert.equal(game.winner, null);
  assert.equal(game.model.versusRoundOver, false);
  assert.equal(game.lifecycle.resultState().ended, false);
});
