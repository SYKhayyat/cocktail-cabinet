import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as geometry from "../src/geometry.js";
import * as decisions from "../src/decisions.js";
import { drawText } from "../src/rendering.js";
import * as host from "../src/engine.js";
import { checkModelBoundary } from "../scripts/check-model-boundary.mjs";

test("the complete arcade model dependency graph stays model-safe", async () => {
  assert.equal(await checkModelBoundary(), 8);
});

test("neutral helpers retain identical engine compatibility exports", () => {
  for (const [name, value] of Object.entries({ ...geometry, ...decisions, drawText })) assert.equal(host[name], value, name);
  assert.equal(geometry.circleHitsRect({ x: 4, y: 4, radius: 2 }, { x: 5, y: 5, width: 2, height: 2 }), true);
  const model = { decisionLog: [], decisionLogLimit: 8 };
  for (let index = 0; index < 10; index += 1) decisions.recordDecision(model, { index });
  assert.deepEqual(model.lastDecision, { index: 9 });
  assert.equal(model.decisionLog.length, 8);
  assert.equal(model.decisionLog[0].index, 2);
});

test("all arcade models import and step without a browser, renderer, or engine", () => {
  const script = `
    import assert from "node:assert/strict";
    for (const key of ["window", "document", "requestAnimationFrame", "cancelAnimationFrame"]) {
      Object.defineProperty(globalThis, key, { get() { throw new Error("host access: " + key); } });
    }
    const models = [
      ["snake", "SnakeModel"], ["breakout", "BreakoutModel"],
      ["splat", "SplatModel"], ["asteroids", "AsteroidsModel"],
      ["missile", "MissileModel"], ["starfall", "StarfallModel"]
    ];
    for (const [name, type] of models) {
      const module = await import("./src/games/" + name + "/model.js");
      const model = new module[type]();
      model.reset();
      model.update(0.01, { pointer: { x: 0, y: 0, down: false, clicked: false }, keys: new Set(), pressed: new Set() });
      assert.equal(model.lifeLost, false);
      assert.equal(model.gameOver, false);
    }
  `;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});
