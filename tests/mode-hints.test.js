import test from "node:test";
import assert from "node:assert/strict";
import { SnakeGame } from "../src/games/snake.js";
import { BreakoutGame } from "../src/games/breakout.js";
import { SplatGame } from "../src/games/splat.js";
import { AsteroidsGame } from "../src/games/asteroids.js";
import { MissileCommandGame } from "../src/games/missile.js";
import { StarfallGame } from "../src/games/starfall.js";
import { ImitationGame } from "../src/games/imitation.js";

const input = (key, pointer = {}) => ({ keys: new Set(key ? [key] : []), pressed: new Set(key ? [key] : []), mode: "keyboard", pointer: { x: 200, y: 200, ...pointer } });
const text = (game) => game.controlHint().map(({ keys, label }) => `${keys.join(" ")} ${label}`).join("; ");

test("all twenty mode hints describe their own role, not an inactive sibling", () => {
  for (const Game of [SnakeGame, BreakoutGame, SplatGame, AsteroidsGame, MissileCommandGame, StarfallGame, ImitationGame]) {
    const game = new Game();
    for (const mode of game.modes.filter(({ available }) => available !== false)) {
      game.model.side = mode.value;
      assert.ok(text(game).length > 8, `${game.id}/${mode.value}`);
    }
  }
  for (const [Game, side, expected, absent] of [
    [SnakeGame, "snake", /steer toward the pointer/, /apple/],
    [SnakeGame, "apples", /place an apple/, /steer|Arrow/],
    [BreakoutGame, "blocks", /Drag move a block.*Click cycle/, /paddle|Arrow/],
    [AsteroidsGame, "rocks", /send an asteroid.*velocity/, /fire|thrust|Arrow/],
    [MissileCommandGame, "attacker", /enemy missile.*nearest city or battery.*velocity/, /choose a battery|Space|Arrow/],
    [StarfallGame, "runner", /Mouse guide the runner/, /star|gem/],
    [StarfallGame, "stars", /send a star.*send gems/, /runner|Arrow/],
    [ImitationGame, "ai", /Enter send a message/, /guess|Click/],
    [ImitationGame, "provide", /response to the Guess player/, /choose|Click/],
    [ImitationGame, "write", /classification/, /guess|Click/]
  ]) {
    const game = new Game(); game.model.side = side;
    assert.match(text(game), expected);
    assert.doesNotMatch(text(game), absent);
  }
});

test("mode hints correspond to real controller effects and inactive keys do nothing", () => {
  const snake = new SnakeGame(); snake.reset();
  snake.update(0, input("ArrowUp"));
  assert.deepEqual(snake.model.nextDirection, { x: 0, y: -1 });
  snake.model.side = "apples"; snake.reset();
  snake.update(0, input(null, { clicked: true, x: 100, y: 100 }));
  assert.deepEqual(snake.model.apple, snake.model.cellFromPointer({ x: 100, y: 100 }));

  const blocks = new BreakoutGame(); blocks.model.side = "blocks"; blocks.reset();
  const brick = blocks.model.bricks[0]; const beforeType = brick.type;
  blocks.controller.handleReadyInput(input(null, { x: brick.x + 5, y: brick.y + 5, clicked: true, down: true }));
  blocks.controller.handleReadyInput(input(null));
  assert.notEqual(brick.type, beforeType, "advertised block click cycles its type");

  const rocks = new AsteroidsGame(); rocks.model.side = "rocks"; rocks.reset();
  rocks.update(0, input(" "));
  assert.equal(rocks.model.bullets.length, 0, "Space is not a rocks-mode fire control");
  rocks.update(0, input(null, { released: true }));
  assert.equal(rocks.model.asteroids.length, 1, "advertised click/release sends a rock");

  const missile = new MissileCommandGame(); missile.model.side = "attacker"; missile.reset();
  const battery = missile.model.selectedBattery;
  missile.update(0, input("ArrowRight")); missile.update(0, input(" "));
  assert.equal(missile.model.selectedBattery, battery);
  assert.equal(missile.model.enemyMissiles.length, 0);
  missile.update(0, input(null, { released: true }));
  assert.equal(missile.model.enemyMissiles.length, 1);

  const stars = new StarfallGame(); stars.model.side = "stars"; stars.reset();
  stars.update(0, input(null, { clicked: true, released: true }));
  assert.equal(stars.model.stars.length, 1);
  stars.update(0, input(null, { doubleClicked: true, released: true }));
  assert.equal(stars.model.gems.length, 1);
});
