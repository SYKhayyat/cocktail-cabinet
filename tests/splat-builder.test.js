import test from "node:test";
import assert from "node:assert/strict";
import { SplatGame } from "../src/games/splat/index.js";

const pointer = (values) => ({ x: 0, y: 0, down: false, released: false, dragDistance: 0, ...values });
function builder() {
  const game = new SplatGame();
  game.setSide("builder");
  game.lifecycle.startRound({ startingLives: 5, reason: "side" });
  return game;
}

test("#71: ready spacing changes preserve distinctive authored gaps and positions", () => {
  const game = builder();
  const column = game.model.columns[0];
  game.setTool("gap");
  game.handleReadyInput({ pointer: pointer({ down: true, x: column.x, y: 173, dragStartX: column.x, dragStartY: 173 }) });
  game.handleReadyInput({ pointer: pointer({ released: true, x: column.x, y: 326, dragStartX: column.x, dragStartY: 173 }) });
  const route = game.model.columns.map(({ passed, ...geometry }) => geometry);
  game.setSettings({ columnSpacing: 200 });
  assert.match(game.refreshSettingsPreview(), /Authored route preserved/);
  assert.deepEqual(game.model.columns.map(({ passed, ...geometry }) => geometry), route);
  assert.equal(game.model.columns[0].gapY, 173);
  assert.equal(game.model.columns[0].gapHeight, 153);
  assert.equal(game.model.columnSpacing, 200);
  assert.equal(game.model.raceLives.human, 5);
  game.lifecycle.startRound({ startingLives: 5, reason: "restart" });
  assert.deepEqual(game.model.columns.map(({ passed, ...geometry }) => geometry), route);
});

test("#71: unauthored ready previews still regenerate with the requested spacing", () => {
  const game = builder();
  game.setSettings({ columnSpacing: 200 });
  assert.match(game.refreshSettingsPreview(), /Preview updated/);
  assert.equal(game.model.columns[1].x - game.model.columns[0].x, 200);
  game.model.addColumn(500);
  game.setSide("climber");
  game.reset();
  assert.equal(game.model.columns.length, 50);
});

test("#67: empty-canvas panning is bounded and never authors a column or gap", () => {
  for (const tool of ["column", "gap"]) {
    const game = builder();
    game.setTool(tool);
    const route = structuredClone(game.model.columns);
    const gesture = { dragStartX: 775, dragStartY: 280 };
    game.handleReadyInput({ pointer: pointer({ ...gesture, x: 775, y: 280, down: true }) });
    game.handleReadyInput({ pointer: pointer({ ...gesture, x: 215, y: 280, down: true, dragDistance: 560 }) });
    assert.equal(game.model.cameraX, 560);
    game.handleReadyInput({ pointer: pointer({ ...gesture, x: 215, y: 280, released: true, dragDistance: 560 }) });
    assert.deepEqual(game.model.columns, route, "crossing columns must remain a pan");
    game.model.panBuilder(1e9);
    assert.equal(game.model.cameraX, game.model.builderCameraLimit());
    game.model.panBuilder(-1e9);
    assert.equal(game.model.cameraX, 0);
    assert.equal(game.model.layoutAuthored, false);
  }
});

test("#67: paused and running pans remain visible; cancellation clears the baseline", () => {
  const game = builder();
  const gesture = { dragStartX: 775, dragStartY: 280 };
  game.handlePausedInput({ pointer: pointer({ ...gesture, x: 435, y: 280, down: true, dragDistance: 340 }) });
  assert.equal(game.model.cameraX, 340);
  game.model.updateBuilder(0.01, { pointer: pointer({}) });
  assert.equal(game.model.cameraX, 340, "ball following must not undo manual navigation");
  assert.equal(game.model.builderGesture, null);
  const count = game.model.columns.length;
  game.handlePausedInput({ pointer: pointer({ x: 565, y: 280, released: true }) });
  assert.equal(game.model.columns.length, count + 1);
  assert.ok(game.model.columns.some((column) => column.x === 905));
});

test("#67: column dragging preserves sorted route order when crossing another column", () => {
  const game = builder();
  const column = game.model.columns[0];
  const startX = column.x;
  game.handleReadyInput({ pointer: pointer({ x: startX + 200, y: 100, down: true, dragStartX: startX, dragStartY: 100, dragDistance: 200 }) });
  game.handleReadyInput({ pointer: pointer({ x: startX + 200, y: 100, released: true, dragStartX: startX, dragStartY: 100, dragDistance: 200 }) });
  assert.equal(column.x, startX + 200);
  assert.ok(game.model.columns.every((column, index, columns) => !index || columns[index - 1].x <= column.x));
});

test("#69: keyboard-only authoring selects, moves, draws, resizes, adds and removes", () => {
  const game = builder();
  const key = (value, method = "handleReadyInput") => game[method]({ keys: new Set([value]), pressed: new Set([value]) });
  const first = game.model.columns[0];
  key("ArrowRight");
  const column = game.model.columns[1];
  assert.equal(game.model.selectedColumnId, column.id);
  const original = { ...column };
  key("D");
  assert.equal(column.x, original.x + 10);
  assert.equal(first.x, 190);
  key("g");
  assert.equal(game.tool, "gap");
  key("ArrowUp");
  key("e");
  assert.equal(column.gapY, original.gapY - 10);
  assert.equal(column.gapHeight, original.gapHeight + 10);
  key("c", "handlePausedInput");
  assert.equal(game.tool, "column");
  key("End");
  assert.equal(game.model.selectedColumnId, game.model.columns.at(-1).id);
  assert.ok(game.model.cameraX > 0, "offscreen selection must navigate the route");
  const count = game.model.columns.length;
  key("n", "handlePausedInput");
  const added = game.model.selectedColumn;
  assert.equal(game.model.columns.length, count + 1);
  key("Delete");
  assert.equal(game.model.columns.length, count);
  assert.ok(!game.model.columns.includes(added));
  key("Home");
  assert.equal(game.model.selectedColumnId, first.id);
  assert.equal(game.model.cameraX, 130);
  key("PageUp");
  assert.equal(game.model.cameraX, 0);
  key("q");
  assert.equal(first.gapHeight, 102);
  assert.equal(game.model.layoutAuthored, true);
});

test("#69: running keyboard edits use the same path and keep gaps bounded", () => {
  const game = builder();
  const first = game.model.selectedColumn;
  for (let index = 0; index < 100; index += 1) game.update(0, { keys: new Set(), pressed: new Set(["ArrowDown", "e"]), pointer: undefined });
  assert.ok(first.gapY >= 60 && first.gapY + first.gapHeight <= 560);
  assert.ok(first.gapHeight <= 240);
  const snapshot = { ...first };
  game.update(0, { keys: new Set(["d"]), pressed: new Set() });
  assert.deepEqual(first, snapshot, "editor commands are press edges, not frame-rate movement");
  const solo = new SplatGame();
  solo.reset();
  assert.ok(!solo.controlHint().some(({ label }) => label.includes("column")));
  assert.ok(game.controlHint().some(({ label }) => label === "select column"));
});
