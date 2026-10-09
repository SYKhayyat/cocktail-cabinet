import test from "node:test";
import assert from "node:assert/strict";
import { SnakeGame } from "../src/games/snake.js";
import { BreakoutGame } from "../src/games/breakout.js";
import { SplatGame } from "../src/games/splat.js";
import { AsteroidsGame } from "../src/games/asteroids.js";
import { MissileCommandGame } from "../src/games/missile.js";
import { StarfallGame } from "../src/games/starfall.js";
import { ImitationGame } from "../src/games/imitation.js";
import { LampGame } from "../src/games/lamp.js";

const input = (key, pointer = {}) => ({ keys: new Set(key ? [key] : []), pressed: new Set(key ? [key] : []), mode: "keyboard", pointer: { x: 200, y: 200, ...pointer } });
const text = (game) => game.controlHint().map(({ keys, label }) => `${keys.join(" ")} ${label}`).join("; ");

test("every mode hint describes its own role, not an inactive sibling", () => {
  for (const Game of [SnakeGame, BreakoutGame, SplatGame, AsteroidsGame, MissileCommandGame, StarfallGame, ImitationGame, LampGame]) {
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
    [ImitationGame, "write", /classification/, /guess|Click/],
    // The freeze is the rule most likely to read as a bug, so the hint has to
    // say it rather than leaving it to be discovered.
    [LampGame, "walk", /walk blind.*Arrows|ArrowUp.*walk blind/s, /place/]
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

  const lamp = new LampGame(); lamp.reset();
  // Past the free opening reveal, so the assertions are about the player's
  // own pulses rather than the round's one free look.
  for (let tick = 0; tick < 200 && lamp.model.lit(); tick += 1) lamp.update(1 / 60, input());
  const still = { x: lamp.model.player.x, y: lamp.model.player.y };
  lamp.update(1 / 60, input("ArrowRight"));
  assert.notEqual(lamp.model.player.x, still.x, "ArrowRight walks while the lamp is out");
  const at = { x: lamp.model.player.x, y: lamp.model.player.y };
  lamp.update(1 / 60, input(" "));
  assert.equal(lamp.model.lit(), true, "the advertised Space lights the lamp");
  lamp.update(1 / 60, input("ArrowRight"));
  assert.deepEqual(lamp.model.player, at, "and you cannot walk while it is lit");
  for (let tick = 0; tick < 200 && lamp.model.lit(); tick += 1) lamp.update(1 / 60, input());
  lamp.update(1 / 60, input(null, { down: true, clicked: true }));
  assert.equal(lamp.model.lit(), true, "the advertised Click lights the lamp");
  assert.equal(lamp.model.lampHeld, false, "a press is a tap, not yet a hold");
  for (let tick = 0; tick < 10; tick += 1) lamp.update(1 / 60, input(null, { down: true }));
  assert.equal(lamp.model.lampHeld, false, "still only a tap inside the hold delay");
  for (let tick = 0; tick < 30; tick += 1) lamp.update(1 / 60, input(null, { down: true }));
  assert.equal(lamp.model.lampHeld, true, "the advertised Hold sustains once the button is held");
  lamp.update(1 / 60, input(null, { down: false }));
  assert.equal(lamp.model.lampHeld, false, "and letting go starts the fade");

  const stars = new StarfallGame(); stars.model.side = "stars"; stars.reset();
  stars.update(0, input(null, { clicked: true, released: true }));
  assert.equal(stars.model.stars.length, 1);
  stars.update(0, input(null, { doubleClicked: true, released: true }));
  assert.equal(stars.model.gems.length, 1);
});

// The Builder hint once advertised "Wheel" to pan while nothing in the codebase
// read the accumulated wheel delta, which is exactly the drift issue #66 exists
// to prevent. Every advertised Builder key must now have a real, observable
// effect on the model.
test("every advertised Splat Builder control has a real effect", () => {
  const builder = () => { const game = new SplatGame(); game.model.side = "builder"; game.reset(); return game; };
  const idle = (overrides) => ({ keys: new Set(), pressed: new Set(), mode: "keyboard", scrollDeltaX: 0, pointer: { x: 0, y: 0, down: false, clicked: false, released: false, dragDistance: 0, ...overrides } });
  const key = (name) => ({ ...idle(), keys: new Set([name]), pressed: new Set([name]) });

  const selection = builder();
  const firstId = selection.model.selectedColumnId;
  selection.update(0, key("ArrowRight"));
  assert.notEqual(selection.model.selectedColumnId, firstId, "ArrowRight selects a column");
  selection.update(0, key("End"));
  assert.equal(selection.model.selectedColumnId, selection.model.columns.at(-1).id, "End selects the last column");
  selection.update(0, key("Home"));
  assert.equal(selection.model.selectedColumnId, selection.model.columns[0].id, "Home selects the first column");

  const move = builder();
  const movedX = move.model.selectedColumn.x;
  move.update(0, key("d"));
  assert.equal(move.model.selectedColumn.x, movedX + 10, "D moves the column");

  const gap = builder();
  const gapY = gap.model.selectedColumn.gapY;
  gap.update(0, key("ArrowUp"));
  assert.equal(gap.model.selectedColumn.gapY, gapY - 10, "ArrowUp moves the gap");
  const gapHeight = gap.model.selectedColumn.gapHeight;
  gap.update(0, key("q"));
  assert.equal(gap.model.selectedColumn.gapHeight, gapHeight - 10, "Q resizes the gap");

  const tool = builder();
  const toolHint = tool.controlHint().map(({ keys, label }) => `${keys.join(" ")} ${label}`).join("; ");
  assert.match(toolHint, /C G column\/gap tool/);
  tool.update(0, key("g"));
  assert.equal(tool.model.tool, "gap", "G selects the gap tool");
  tool.update(0, key("c"));
  assert.equal(tool.model.tool, "column", "C selects the column tool");

  const add = builder();
  const before = add.model.columns.length;
  add.update(0, key("n"));
  assert.equal(add.model.columns.length, before + 1, "N adds a column");
  add.update(0, key("Delete"));
  assert.equal(add.model.columns.length, before, "Delete removes a column");

  const keyPan = builder();
  keyPan.update(0, key("PageDown"));
  assert.equal(keyPan.model.builderCameraX, 400, "PageDown pans the route");

  const wheelPan = builder();
  wheelPan.update(0, { ...idle(), scrollDeltaX: 240 });
  assert.equal(wheelPan.model.builderCameraX, 240, "the advertised Wheel pans the route");

  const drag = builder();
  const column = drag.model.columns[0];
  const dragX = column.x;
  const grip = { x: dragX + 200, y: 100, down: true, dragStartX: dragX, dragStartY: 100, dragDistance: 200 };
  drag.update(0, { ...idle(), pointer: { ...idle().pointer, ...grip } });
  drag.update(0, { ...idle(), pointer: { ...idle().pointer, ...grip, down: false, released: true } });
  assert.equal(column.x, dragX + 200, "Drag moves a column");
});
