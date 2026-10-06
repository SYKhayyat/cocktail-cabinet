import test from "node:test";
import assert from "node:assert/strict";
import { AsteroidsModel } from "../src/games/asteroids/model.js";

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
