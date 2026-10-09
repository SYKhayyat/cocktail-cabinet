import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../src/engine.js";
import { SnakeGame } from "../src/games/snake/index.js";
import { BreakoutGame } from "../src/games/breakout/index.js";
import { SplatGame } from "../src/games/splat/index.js";
import { AsteroidsGame } from "../src/games/asteroids/index.js";
import { MissileCommandGame } from "../src/games/missile/index.js";
import { StarfallGame } from "../src/games/starfall/index.js";
import { LampGame } from "../src/games/lamp/index.js";

function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}
// Exercise the integrated host, not stand-in model/life accounting.
const noop = () => {};
const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "a", "d", "q", "e", "n", "Delete", "PageDown"];

test("seeded arcade lifecycle/input fuzz preserves finite state, bounds, and round ownership", (t) => {
  const saved = new Map(["window", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, globalThis[key]]));
  const random = Math.random;
  const context = new Proxy({ measureText: () => ({ width: 10 }) }, {
    get: (target, key) => target[key] || noop,
    set: (target, key, value) => { target[key] = value; return true; }
  });
  const canvas = { width: 800, height: 560, getContext: () => context, addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 560 }) };
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
  let modes = 0;
  let frames = 0;
  try {
    for (const seed of [7, 278, 61082]) {
      Math.random = seeded(seed);
      const engine = new GameEngine(canvas);
      try {
        for (const Game of [SnakeGame, BreakoutGame, SplatGame, AsteroidsGame, MissileCommandGame, StarfallGame, LampGame]) {
          const game = new Game();
          engine.load(game);
          for (const mode of game.modes) {
            engine.setSide(mode.value);
            modes += 1;
            for (let tick = 0; tick < 360; tick += 1) {
              if (tick % 61 === 0) engine.restart();
              if (tick % 43 === 0) engine.setLives(1 + Math.floor(Math.random() * 9));
              if (tick % 37 === 0) engine.pauseGame();
              if (tick % 37 === 1) engine.continueGame();
              // Skip presentation countdown deliberately: these probes exercise
              // real rules rather than spending their horizon on ready screens.
              engine.countdown = 0;
              const key = keys[Math.floor(Math.random() * keys.length)];
              engine.input.keys = new Set([key]);
              engine.input.pressed = new Set([key]);
              Object.assign(engine.input.pointer, {
                x: Math.random() * 800, y: Math.random() * 560,
                down: tick % 3 === 0, clicked: tick % 3 === 0,
                released: tick % 3 === 1, moved: true,
                dragStartX: 350, dragStartY: 250,
                dragDistance: tick % 5 === 0 ? 0 : 40,
                dragDeltaX: tick % 5 - 2, dragDeltaY: tick % 7 - 3
              });
              engine.frame(engine.lastTime + 1000 / 60);
              frames += 1;
              assert.ok(Number.isFinite(game.score) && game.score >= 0, `${game.id}/${mode.value} seed ${seed} score`);
              assert.ok(engine.maxLives >= 1 && engine.maxLives <= 9);
              const life = engine.lifecycle.lifeState();
              if (life.owner === "host") assert.ok(engine.lives >= 0 && engine.lives <= engine.maxLives);
              if (life.owner === "game") {
                assert.ok(life.remaining >= 0 && life.remaining <= engine.maxLives, `${game.id}/${mode.value} remaining ${life.remaining}/${engine.maxLives}`);
                for (const count of Object.values(life.players || {})) assert.ok(count >= 0 && count <= engine.maxLives);
              }
              const model = game.model;
              for (const collection of [model.balls, model.asteroids, model.bullets, model.enemyMissiles, model.interceptors, model.stars, model.gems, model.snake, model.columns]) {
                for (const entity of collection || []) {
                  for (const field of ["x", "y", "vx", "vy", "radius"]) if (entity[field] !== undefined) assert.ok(Number.isFinite(entity[field]), `${game.id}/${mode.value} nonfinite ${field}`);
                }
              }
              if (game.id === "splat") {
                assert.ok(model.columns.length > 0 && model.columns.length <= 256);
                assert.ok(model.columns.every((column, i, array) => !i || column.x >= array[i - 1].x));
              }
              if (model.versusTie) assert.equal(model.winner, null);
            }
          }
        }
      } finally { engine.destroy(); }
    }
    t.diagnostic(`${modes} seeded mode runs; ${frames} real engine frames; seeds 7, 278, 61082`);
  } finally {
    Math.random = random;
    for (const [key, value] of saved) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});
