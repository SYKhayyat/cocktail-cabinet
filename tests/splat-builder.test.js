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
