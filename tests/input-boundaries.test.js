import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../src/engine.js";

function withEngine(run) {
  const listeners = new Map();
  const documentListeners = new Map();
  const noop = () => {};
  const saved = Object.fromEntries(["window", "document", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, globalThis[key]]));
  globalThis.window = { addEventListener: (type, handler) => listeners.set(type, handler), removeEventListener: (type) => listeners.delete(type) };
  globalThis.document = { hidden: false, addEventListener: (type, handler) => documentListeners.set(type, handler), removeEventListener: (type) => documentListeners.delete(type) };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
  const canvas = { ownerDocument: globalThis.document, getContext: () => ({}), addEventListener: noop, removeEventListener: noop };
  const engine = new GameEngine(canvas);
  const game = () => ({ reset() {}, setSide() {}, sideLabel() { return "test"; }, publicState() { return {}; } });
  const press = (repeat = false) => listeners.get("keydown")({ key: "ArrowUp", repeat, preventDefault: noop });
  try { run({ engine, game, press, listeners, documentListeners }); }
  finally {
    engine.destroy();
    assert.equal(listeners.size, 0);
    assert.equal(documentListeners.size, 0);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

for (const boundary of ["stop", "load", "restart", "side", "life-loss", "blur", "hide"]) {
  test(`${boundary} discards held keys, press edges, and pending pointer input`, () => withEngine(({ engine, game, press, listeners, documentListeners }) => {
    engine.load(game());
    press();
    Object.assign(engine.input.pointer, { down: true, clicked: true, released: true, doubleClicked: true, moved: true, dragDistance: 42 });
    engine.input.scrollDeltaX = 12;
    if (boundary === "load") engine.load(game());
    else if (boundary === "side") engine.setSide("other");
    else if (boundary === "life-loss") engine.handleLifeLoss();
    else if (boundary === "blur") listeners.get("blur")();
    else if (boundary === "hide") {
      globalThis.document.hidden = true;
      documentListeners.get("visibilitychange")();
    } else engine[boundary]();
    assert.equal(engine.input.keys.size, 0);
    assert.equal(engine.input.pressed.size, 0);
    for (const flag of ["down", "clicked", "released", "doubleClicked", "moved"]) assert.equal(engine.input.pointer[flag], false, flag);
    assert.equal(engine.input.pointer.dragDistance, 0);
    assert.equal(engine.input.scrollDeltaX, 0);
    press(true);
    assert.equal(engine.input.keys.size, 0, "autorepeat must not revive a stale held key");
    listeners.get("keyup")({ key: "ArrowUp" });
    press();
    assert.equal(engine.input.keys.has("ArrowUp"), true, "a fresh press controls the new context");
    assert.equal(engine.input.pressed.has("ArrowUp"), true);
  }));
}

test("an intentional same-round pause retains held controls", () => withEngine(({ engine, game, press }) => {
  engine.load(game());
  engine.restart();
  press();
  engine.pauseGame();
  engine.continueGame();
  assert.equal(engine.input.keys.has("ArrowUp"), true);
}));
