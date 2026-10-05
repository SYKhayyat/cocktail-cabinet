import test from "node:test";
import assert from "node:assert/strict";
import { AsteroidsModel } from "../../src/games/asteroids/model.js";
import { MissileModel } from "../../src/games/missile/model.js";
import { StarfallModel } from "../../src/games/starfall/model.js";
import { SplatModel } from "../../src/games/splat/model.js";
import { lifecycle } from "./lifecycle.mjs";
import { measureAsteroids } from "./asteroids.mjs";
import { measureMissile } from "./missile.mjs";
import { measureStarfall } from "./starfall.mjs";
import { measureSplat } from "./splat.mjs";

const count = (game, type) => game.eventLog.filter((event) => event.type === type).length;
const flipped = (Model, side) => {
  const game = new Model();
  game.setSide(side);
  game.reset();
  return game;
};

test("Missile outcomes distinguish interception, target impact and off-screen cleanup", () => {
  const game = flipped(MissileModel, "attacker");
  game.interceptorClock = 999;
  const target = game.cities[0];
  const impact = { id: 101, x: target.x, y: 505, targetX: target.x, targetY: 510, targetObject: target, speed: 0, kind: "city" };
  const intercepted = { id: 102, x: 400, y: 200, targetX: 400, targetY: 510, targetObject: game.cities[1], speed: 0 };
  const expired = { id: 103, x: 840, y: 200, vx: 0, vy: 0, freeFlight: true };
  game.enemyMissiles = [impact, intercepted, expired];
  game.interceptors = [{ x: 400, y: 200, targetX: 700, targetY: 200, speed: 0 }];
  game.update(0, {});
  assert.equal(count(game, "intercepted"), 1);
  assert.equal(count(game, "target-impact"), 1);
  assert.equal(count(game, "offscreen-expiry"), 1);
  assert.equal(game.score, 15, "expiry and impact do not award interception score");
  assert.equal(game.cities[1].alive, true, "an intercepted attack cannot destroy its target later in the update");
  assert.deepEqual(game.eventLog.map((event) => event.enemyId).sort(), [101, 102, 103]);
  game.update(0, {});
  assert.equal(game.eventLog.length, 3, "resolved entities have only one outcome");
});

test("Missile interception at a target cannot also count as an impact", () => {
  const game = flipped(MissileModel, "attacker");
  game.interceptorClock = 999;
  const city = game.cities[0];
  game.enemyMissiles = [{ id: 1, x: city.x, y: 500, targetX: city.x, targetY: 510, targetObject: city, speed: 0 }];
  game.interceptors = [{ x: city.x, y: 500, targetX: 200, targetY: 200, speed: 0 }];
  game.update(0, {});
  assert.equal(city.alive, true);
  assert.equal(count(game, "intercepted"), 1);
  assert.equal(count(game, "target-impact"), 0);
});

test("Missile aircraft and split children receive stable distinct outcome identities", () => {
  const game = flipped(MissileModel, "defender");
  game.launchClock = 999;
  const aircraft = { id: 100, x: 840, y: 100, targetX: 850, speed: 0, aircraft: true, dropClock: 0 };
  game.enemyMissiles = [aircraft];
  game.moveEnemy(aircraft, 0);
  assert.equal(count(game, "offscreen-expiry"), 1);
  const child = game.enemyMissiles[1];
  assert.ok(Number.isInteger(child.id));
  game.splitEnemy(child);
  const ids = game.enemyMissiles.slice(1).map((enemy) => enemy.id);
  assert.equal(new Set(ids).size, 3);
});

test("Starfall cleanup and gesture cancellation are not dodges or collisions", () => {
  const game = flipped(StarfallModel, "stars");
  game.aiRunner = () => {};
  game.stars = [
    { id: 101, x: 400, y: 20, vx: 0, vy: 0, radius: 10 },
    { id: 102, x: -40, y: 400, vx: 0, vy: 0, radius: 10, threatened: true },
    { id: 103, x: 20, y: 561, vx: 0, vy: 0, radius: 10 }
  ];
  game.update(0, {});
  assert.equal(count(game, "star-threatened"), 0, "horizontal alignment high on the board is not a threat");
  assert.equal(count(game, "star-expired"), 2);
  assert.equal(count(game, "star-dodged"), 0);
  assert.equal(count(game, "star-collision"), 0);
  game.stars[0].userCreated = true;
  game.stars[0].age = 0;
  game.update(0, { spawnGem: { x: 400 } });
  assert.equal(count(game, "star-despawn"), 1);
  assert.equal(count(game, "star-dodged"), 0, "a cancelled star was not dodged");
  assert.equal(game.lifeLost, false);
});

test("Starfall threats require an imminent collision corridor and get one stable outcome", () => {
  const game = flipped(StarfallModel, "stars");
  game.aiRunner = () => {};
  const dodged = { id: 1, x: 400, y: 380, vx: 0, vy: 130, radius: 10 };
  const wide = { id: 2, x: 460, y: 380, vx: 0, vy: 130, radius: 10 };
  game.stars = [dodged, wide];
  game.update(0, {});
  assert.equal(count(game, "star-threatened"), 1);
  game.runner.x = 700;
  game.update(2, {});
  assert.equal(count(game, "star-dodged"), 1);
  assert.equal(count(game, "star-expired"), 1);
  assert.equal(count(game, "star-collision"), 0);
  assert.equal(dodged.outcome, "star-dodged");
  game.update(0, {});
  assert.equal(count(game, "star-dodged"), 1);
});

test("Starfall collections, passed gems, expiry and respawn cleanup are separate outcomes", () => {
  const game = flipped(StarfallModel, "stars");
  game.aiRunner = () => {};
  game.gems = [
    { id: 1, x: 400, y: 500, vx: 0, vy: 1 },
    { id: 2, x: 20, y: 530, vx: 0, vy: 1 },
    { id: 3, x: 700, y: 590, vx: 0, vy: 1 },
    { id: 4, x: 500, y: 100, vx: 0, vy: 1 }
  ];
  game.update(0, {});
  assert.equal(game.score, 50);
  assert.equal(count(game, "gem-collected"), 1);
  assert.equal(count(game, "gem-passed"), 1);
  assert.equal(count(game, "gem-expired"), 1);
  game.resetAfterLife();
  assert.equal(count(game, "gem-despawn"), 1, "only the unresolved gem is cleanup");
  assert.equal(count(game, "gem-collected"), 1, "cleanup never adds a collection");
});

test("Starfall runner gem reuse starts a new outcome identity", () => {
  const game = flipped(StarfallModel, "runner");
  game.spawnClock = 999;
  game.gems = [{ id: 100, x: 400, y: 500, vx: 0, vy: 1 }];
  game.update(0, {});
  game.update(1, {});
  assert.notEqual(game.gems[0].id, 100);
  assert.equal(game.gems[0].outcome, null);
  game.gems[0].x = 400;
  game.gems[0].y = 500;
  game.update(0, {});
  assert.equal(count(game, "gem-collected"), 2, "respawned gems can be collected and recorded again");
});

test("Asteroids resolves one collision loss then clears all stale steering and respawn hazards", () => {
  const game = flipped(AsteroidsModel, "rocks");
  assert.equal("computerMistake" in game, false);
  assert.equal("computerMistakeClock" in game, false);
  assert.equal("aiError" in game.ship, false);
  game.computerShotClock = 999;
  game.invulnerable = 0;
  const rock = game.spawnAsteroidAt(400, 280, game.ship, { vx: 0, vy: 0 });
  game.update(0, {});
  game.update(0, {});
  assert.equal(count(game, "life-loss"), 1, "repeated collision frames are not extra lives");
  assert.equal(count(game, "asteroid-collision"), 1);
  const round = lifecycle(game, { lives: 2 });
  round.resolve();
  assert.equal(round.remaining, 1);
  assert.equal(round.resets, 1);
  assert.equal(round.resolve(), false, "the loss edge was consumed");
  assert.equal(game.ship.aiTarget, null);
  assert.equal(game.ship.aiReaction, 0);
  assert.equal(game.ship.aiDodgeCommit, 0);
  assert.equal(game.ship.aiEscape, null);
  assert.equal(count(game, "asteroid-despawn"), 1);
  assert.equal(game.eventLog.find((event) => event.type === "asteroid-despawn").asteroidId, rock.id);
  game.update(0, {});
  assert.equal(count(game, "life-loss"), 1, "respawn cleanup is not a second loss");
});

test("Starfall multiple collisions spend one life and stop at the headless budget", () => {
  const game = flipped(StarfallModel, "stars");
  game.aiRunner = () => {};
  game.stars = [1, 2].map((id) => ({ id, x: 400, y: 500, vy: 0, radius: 10 }));
  game.update(0, {});
  assert.equal(count(game, "star-collision"), 2, "each star has its own outcome");
  assert.equal(count(game, "life-loss"), 1, "the simultaneous impacts are one life edge");
  const round = lifecycle(game, { lives: 1 });
  round.resolve();
  assert.equal(round.losses, 1);
  assert.equal(round.resets, 0);
  assert.equal(game.gameOver, true);
  assert.equal(round.resolve(), false);
});

test("Splat counts final-step clearance immediately and resolves the builder's own retry budget", () => {
  const game = flipped(SplatModel, "builder");
  const column = game.columns[0];
  game.player.x = column.x + column.width / 2 + 1;
  game.player.y = column.gapY + column.gapHeight / 2;
  game.update(0, {});
  assert.equal(count(game, "column-cleared"), 1);
  game.columns = [game.columns[1]];
  game.player.x = game.columns[0].x;
  game.player.y = 20;
  game.raceLives = { human: 2, computer: 2 };
  const round = lifecycle(game, { lives: 2, modelOwnsLives: true });
  game.update(0, {});
  round.resolve();
  assert.equal(game.raceLives.human, 1);
  assert.equal(round.remaining, 1);
  assert.equal(game.handleLifeLoss(), null, "the already-handled collision is not charged again");
  assert.equal(count(game, "column-cleared"), 1, "resetting the route does not clear another gate");
  game.player.x = game.columns[0].x;
  game.player.y = 20;
  game.update(0, {});
  round.resolve();
  assert.equal(game.gameOver, true);
  assert.equal(game.puzzleResult, "unsolved");
  assert.equal(round.losses, 2);
  assert.equal(round.resets, 1);
});

test("Splat race records each owner's simultaneous loss once", () => {
  const game = flipped(SplatModel, "race");
  const column = game.columns[0];
  for (const player of [game.player, game.computerPlayer]) {
    player.x = column.x;
    player.y = 20;
  }
  game.update(0, {});
  game.update(0, {});
  assert.equal(count(game, "column-collision"), 2);
  assert.equal(count(game, "life-loss"), 2);
  game.handleLifeLoss();
  assert.deepEqual(game.raceLives, { human: 2, computer: 2 });
  assert.equal(game.handleLifeLoss(), null, "a repeated hook cannot charge either pilot twice");
  game.resetAfterLife();
  assert.equal(game.player.attempt, 2);
  assert.equal(game.computerPlayer.attempt, 2);
});

test("Starfall projects horizontal drift into the imminent collision corridor", () => {
  const game = flipped(StarfallModel, "stars");
  game.aiRunner = () => {};
  game.stars = [{ id: 1, x: 280, y: 380, vx: 130, vy: 130, radius: 10 }];
  game.update(0, {});
  assert.equal(count(game, "star-threatened"), 1, "a drifting star on course is a threat even while horizontally distant");
});

test("Monte Carlo event fixtures are repeatable and restore the caller's random source", () => {
  const originalRandom = Math.random;
  for (const [measure, options] of [
    [measureAsteroids, { runs: 4, steps: 1200 }],
    [measureMissile, { runs: 4, steps: 600 }],
    [measureStarfall, { runs: 4, steps: 600 }],
    [measureSplat, { runs: 4, steps: 6500 }]
  ]) {
    assert.deepEqual(measure(options), measure(options));
    assert.equal(Math.random, originalRandom);
  }
});
