import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../src/engine.js";
import { semanticState, performSemanticAction } from "../src/nonvisual.js";
import { SnakeGame } from "../src/games/snake.js";
import { BreakoutGame } from "../src/games/breakout.js";
import { SplatGame } from "../src/games/splat.js";
import { AsteroidsGame } from "../src/games/asteroids.js";
import { MissileCommandGame } from "../src/games/missile.js";
import { StarfallGame } from "../src/games/starfall.js";

// Use the real lifecycle and stepping APIs without starting a renderer.
function host(Game, side) {
  const game = new Game();
  game.setSide(side || game.side);
  const engine = Object.assign(Object.create(GameEngine.prototype), {
    game, lifecycle: game.lifecycle, assistance: true, assistanceOutcome: "", ready: false, paused: false, stopped: false,
    maxLives: 3, pendingLives: 3, lives: 3, countdown: 0
  });
  engine.startRound("restart");
  return engine;
}
function perform(engine, action, target = "", extra = {}) {
  return performSemanticAction(engine, { action, target, x: 400, y: 250, seconds: 0.1, ...extra });
}

for (const Game of [SnakeGame, BreakoutGame, SplatGame, AsteroidsGame, MissileCommandGame, StarfallGame]) {
  const catalogue = new Game();
  for (const mode of catalogue.modes.filter((item) => item.available !== false)) {
    test(`${catalogue.id}/${mode.value}: actual entities, objective, outcome, actionable step`, () => {
      const engine = host(Game, mode.value);
      const state = semanticState(engine.game, engine);
      assert.ok(state.mode.includes(mode.label));
      assert.ok(state.objective.length > 30);
      assert.ok(state.players.length);
      assert.ok(state.actions.length > 1);
      assert.match(state.outcome, /Score.*Lives|Score.*lives|Score.*Puzzle retries/);
      assert.match(perform(engine, "wait"), /performed/);
    });
  }
}

test("Snake moves exactly once, refuses occupied apples, and obeys reverse/wall rules", () => {
  const engine = host(SnakeGame);
  const head = { ...engine.game.model.snake[0] };
  perform(engine, "up");
  assert.deepEqual(engine.game.model.snake[0], { x: head.x, y: head.y - 1 });
  perform(engine, "down");
  assert.deepEqual(engine.game.model.snake[0], { x: head.x, y: head.y - 2 });
  engine.game.model.snake[0] = { x: head.x, y: 0 };
  perform(engine, "up");
  assert.equal(engine.lives, 2);
  assert.match(semanticState(engine.game, engine).outcome, /Wall hit/);
  const apples = host(SnakeGame, "apples");
  const occupied = apples.game.model.snake[0];
  assert.match(perform(apples, "apple", "", { x: occupied.x + 1, y: occupied.y + 1 }), /occupied/);
  perform(apples, "apple", "", { x: 1, y: 1 });
  assert.deepEqual(apples.game.model.apple, { x: 0, y: 0 });
  assert.match(perform(apples, "apple", "", { x: 0, y: 1 }), /bounds/);
});

test("Breakout named setup edits preserve bounds/type/layout before starting", () => {
  const engine = host(BreakoutGame, "blocks");
  engine.ready = true;
  const ball = { ...engine.game.model.balls[0] };
  assert.match(perform(engine, "brick-move", "brick-0", { x: -200, y: 900 }), /updated/);
  assert.equal(engine.game.model.bricks[0].x, 8);
  assert.equal(engine.game.model.bricks[0].y, 400);
  perform(engine, "brick-cycle", "brick-0");
  assert.equal(engine.game.model.bricks[0].type, "extraLife");
  assert.equal(engine.game.model.layout[0].type, "extraLife");
  assert.deepEqual(engine.game.model.balls[0], ball);
});

test("Splat named gap/column editing is available while paused and uses Builder rules", () => {
  const engine = host(SplatGame, "builder");
  engine.paused = true;
  const m = engine.game.model;
  const column = m.columns[0];
  const gap = column.gapY;
  perform(engine, "gap-up", `column-${column.id}`);
  assert.equal(column.gapY, gap - 10);
  const count = m.columns.length;
  perform(engine, "column-add", `column-${column.id}`);
  assert.equal(m.columns.length, count + 1);
  perform(engine, "column-remove", `column-${column.id}`);
  assert.equal(m.columns.length, count);
  assert.match(perform(engine, "gap-up", `column-${column.id}`), /no longer exists/);
});

test("Asteroids sends bounded rocks and aiming fires real travelling bullets", () => {
  const rocks = host(AsteroidsGame, "rocks");
  perform(rocks, "rock", "", { x: 40, y: 40 });
  assert.equal(rocks.game.model.asteroids.length, 1);
  const engine = host(AsteroidsGame);
  perform(engine, "aim-fire", `rock-${engine.game.model.asteroids[0].id}`);
  assert.ok(engine.game.model.bullets.length);
  assert.ok(engine.game.model.shotClock > 0);
  assert.match(semanticState(engine.game, engine).hazards.map((item) => item.text).join(" "), /Bullet/);
});

test("Missile uses named live city targets and real battery ammunition", () => {
  const attack = host(MissileCommandGame, "attacker");
  perform(attack, "attack", "city-0");
  assert.equal(attack.game.model.enemyMissiles[0].targetObject, attack.game.model.cities[0]);
  attack.game.model.cities[0].alive = false;
  assert.match(perform(attack, "attack", "city-0"), /already destroyed/);
  const defend = host(MissileCommandGame);
  perform(defend, "battery-left");
  assert.equal(defend.game.model.selectedBattery, 0);
  perform(defend, "intercept");
  assert.equal(defend.game.model.bases[0].missiles, 9);
  assert.equal(defend.game.model.interceptors.length, 1);
  defend.game.model.bases[0].missiles = 0;
  assert.match(perform(defend, "intercept"), /empty/);
});

test("Starfall keyboard actions send both hazards and gem lures", () => {
  const engine = host(StarfallGame, "stars");
  perform(engine, "star", "", { x: 120 });
  assert.equal(engine.game.model.stars[0].x, 120);
  perform(engine, "wait", "", { seconds: 0.5 });
  perform(engine, "gem", "", { x: 700 });
  assert.ok(engine.game.model.gems.length);
  assert.match(semanticState(engine.game, engine).targets[0].text, /Gem/);
});

test("Paused, stopped, disabled, invalid time and stale targets never act", () => {
  const engine = host(AsteroidsGame);
  const ship = { ...engine.game.model.ship };
  engine.paused = true;
  assert.match(perform(engine, "thrust"), /Continue/);
  engine.paused = false;
  assert.match(perform(engine, "thrust", "", { seconds: NaN }), /No step/);
  assert.match(perform(engine, "aim-fire", "rock-9999"), /no longer exists/);
  engine.assistance = false;
  assert.match(perform(engine, "thrust"), /Enable/);
  assert.deepEqual(engine.game.model.ship, ship);
});

test("Steps stop at life loss and terminal results, with authoritative outcomes", () => {
  const engine = host(MissileCommandGame, "attacker");
  engine.game.model.cities.forEach((city) => { city.alive = false; });
  perform(engine, "wait");
  assert.equal(engine.stopped, true);
  assert.match(semanticState(engine.game, engine).outcome, /YOU WIN/);
  const lose = host(MissileCommandGame, "attacker");
  lose.game.model.bases.forEach((base) => { base.alive = false; });
  perform(lose, "wait");
  assert.equal(lose.stopped, true);
  assert.match(semanticState(lose.game, lose).outcome, /COMPUTER WINS.*cities hold/);
});

test("Real cooldown refusals and flipped life ownership are readable", () => {
  const asteroids = host(AsteroidsGame);
  asteroids.game.model.shotClock = 0.18;
  assert.match(perform(asteroids, "fire"), /cooldown active/);
  assert.equal(asteroids.game.model.bullets.length, 0);
  const stars = host(StarfallGame, "stars");
  stars.game.model.gemSpawnCooldown = 0.2;
  assert.match(perform(stars, "gem"), /cooldown active/);
  assert.equal(stars.game.model.gems.length, 0);
  assert.match(semanticState(stars.game, stars).outcome, /Computer lives 3/);
  const builder = host(SplatGame, "builder");
  assert.match(semanticState(builder.game, builder).outcome, /Puzzle retries 3/);
});
