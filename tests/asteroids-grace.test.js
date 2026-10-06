import test from "node:test";
import assert from "node:assert/strict";
import { AsteroidsModel } from "../src/games/asteroids/model.js";
import { AsteroidsGame } from "../src/games/asteroids/index.js";

function duel() {
  const model = new AsteroidsModel();
  model.setSide("versus");
  model.reset();
  model.asteroids = [];
  return model;
}

for (const owner of ["human", "computer"]) {
  for (const cause of ["asteroid", "bullet"]) {
    test(`${owner} respawn is protected from ${cause} during grace, not afterwards`, () => {
      const model = duel();
      model.resetAfterLife();
      const ship = owner === "human" ? model.ship : model.computerShip;
      const graceKey = owner === "human" ? "invulnerable" : "computerInvulnerable";
      const hazard = () => {
        if (cause === "asteroid") {
          model.asteroids = [{ id: 99, x: ship.x, y: ship.y, radius: 20 }];
          model.resolveShipHazards();
        } else {
          model.bullets = [{ x: ship.x, y: ship.y, owner: owner === "human" ? "computer" : "human", life: 1 }];
          model.resolveDuelBullets();
        }
      };
      hazard();
      assert.equal(model.playerLives[owner], 3);
      model[graceKey] = 0;
      hazard();
      assert.equal(model.playerLives[owner], 2);
      assert.ok(model[graceKey] > 0, "a spent life protects against another hazard in the same frame");
      hazard();
      assert.equal(model.playerLives[owner], 2);
    });
  }
}

test("duel retry clears rocks at both spawn locations", () => {
  const model = duel();
  model.asteroids = [{ id: 1, x: 400, y: 280, radius: 20 }, { id: 2, x: 400, y: 160, radius: 20 }, { id: 3, x: 100, y: 100, radius: 20 }];
  model.resetAfterLife();
  assert.deepEqual(model.asteroids.map((rock) => rock.id), [3]);
});

test("each pilot's grace expires on its own active-time clock", () => {
  const model = duel();
  model.invulnerable = 0.2;
  model.computerInvulnerable = 0.7;
  model.spawnClock = model.computerShotClock = 99;
  model.asteroids = [{ id: 1, x: 100, y: 100, radius: 20, vx: 0, vy: 0, rotation: 0, spin: 0 }];
  model.update(0.25, {});
  assert.equal(model.invulnerable, 0);
  assert.ok(Math.abs(model.computerInvulnerable - 0.45) < 1e-10);
});

test("simultaneous final pilot hits resolve as a tie rather than a branch-order win", () => {
  for (const order of [["human", "computer"], ["computer", "human"]]) {
    const game = new AsteroidsGame();
    game.setSide("versus");
    game.lifecycle.startRound({ startingLives: 1, reason: "restart" });
    const model = game.model;
    model.invulnerable = model.computerInvulnerable = 0;
    model.bullets = order.map((owner) => {
      const target = owner === "human" ? model.computerShip : model.ship;
      return { x: target.x, y: target.y, owner, life: 1 };
    });
    model.resolveDuelBullets();
    const loss = game.lifecycle.resolveLifeLoss();
    assert.equal(loss.gameOver, true);
    assert.deepEqual(model.playerLives, { human: 0, computer: 0 });
    assert.equal(game.lifecycle.resultState().heading, "TIE");
    assert.match(game.winMessage(), /tie/i);
    game.lifecycle.startRound({ startingLives: 3, reason: "restart" });
    assert.equal(game.versusTie, false);
  }
});
