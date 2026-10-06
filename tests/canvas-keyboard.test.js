import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GameEngine } from "../src/engine.js";
import { SplatGame } from "../src/games/splat/index.js";
import { semanticState } from "../src/nonvisual.js";

test("the board is in native Tab order and references the active instructions", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const canvas = html.match(/<canvas\b[^>]+>/)?.[0];
  assert.match(canvas, /tabindex="0"/);
  assert.match(canvas, /aria-describedby="controlHint nonvisualObjective"/);
});

test("focused-canvas Builder navigation edits and pans without browser page scrolling", () => {
  const noop = () => {};
  const saved = new Map(["window", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, globalThis[key]]));
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
  const context = new Proxy({}, { get: (target, key) => target[key] || noop, set: (target, key, value) => { target[key] = value; return true; } });
  const canvas = { tagName: "CANVAS", getContext: () => context, addEventListener: noop, removeEventListener: noop };
  const engine = new GameEngine(canvas);
  try {
    engine.load(new SplatGame());
    engine.setSide("builder");
    const key = (name) => {
      let prevented = false;
      engine.handleKeyDown({ key: name, target: canvas, preventDefault() { prevented = true; } });
      engine.frame(engine.lastTime + 16);
      engine.handleKeyUp({ key: name });
      return prevented;
    };
    assert.equal(key("ArrowRight"), true);
    const model = engine.game.model;
    assert.equal(model.selectedColumnId, model.columns[1].id);
    const selected = semanticState(engine.game, engine).targets.filter((item) => /selected for keyboard editing/.test(item.label));
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, `column-${model.selectedColumnId}`);
    const previousX = model.selectedColumn.x;
    key("d");
    assert.equal(model.selectedColumn.x, previousX + 10);
    assert.equal(key("PageDown"), true);
    assert.equal(model.builderCameraX, 400);
    assert.equal(key("Home"), true);
    assert.equal(model.selectedColumnId, model.columns[0].id);
  } finally {
    engine.destroy();
    for (const [key, value] of saved) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});
