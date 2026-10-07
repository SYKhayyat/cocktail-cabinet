import test from "node:test";
import assert from "node:assert/strict";
import { CANVAS_PALETTE, drawText } from "../src/rendering.js";
import { GameEngine } from "../src/engine.js";
import { SnakeModel } from "../src/games/snake/model.js";
import { BreakoutModel, BRICK_LABELS } from "../src/games/breakout/model.js";
import { SplatModel } from "../src/games/splat/model.js";
import { AsteroidsModel } from "../src/games/asteroids/model.js";
import { MissileModel } from "../src/games/missile/model.js";
import { ImitationModel } from "../src/games/imitation/model.js";
import { StarfallModel } from "../src/games/starfall/model.js";

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).slice(0, 3).map((part) => parseInt(part, 16) / 255);
  return rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(first, second) {
  const a = luminance(first); const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

class Element {
  constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.attributes = {}; this.hidden = false; }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
}

// Record every element the drawing code creates or inserts. The removed canvas
// text companion built a panel in exactly these two places, so this is how the
// tests prove that drawing a frame now touches the DOM not at all.
function recordingContext(width = 800) {
  const shapes = []; const text = []; const stack = []; const touched = []; let path = null;
  const screen = new Element("div");
  screen.insertAdjacentElement = (position, child) => { touched.push(child); };
  const ownerDocument = { createElement: (tag) => { const element = new Element(tag); touched.push(element); return element; } };
  const canvas = {
    width: 800, ownerDocument, parentNode: screen,
    getBoundingClientRect: () => ({ width }), closest: () => screen
  };
  const context = {
    canvas, fillStyle: CANVAS_PALETTE.background, globalAlpha: 1,
    measureText(value) { return { width: String(value).length * parseFloat(this.font.match(/([\d.]+)px/)[1]) * 0.65 }; },
    fillRect(x, y, w, h) { shapes.push({ color: this.fillStyle, contains: (a, b) => a >= x && a <= x + w && b >= y && b <= y + h }); },
    beginPath() { path = null; },
    arc(x, y, radius) { path = (a, b) => Math.hypot(a - x, b - y) <= radius; },
    fill() { if (path) shapes.push({ color: this.fillStyle, contains: path }); },
    fillText(value, x, y) {
      const size = Number(this.font.match(/([\d.]+)px/)[1]);
      const sampleX = this.textAlign === "left" ? x + 1 : this.textAlign === "right" ? x - 1 : x;
      const background = shapes.findLast((shape) => shape.contains(sampleX, y - size / 2))?.color;
      text.push({ value: String(value), color: this.fillStyle, background, size, alpha: this.globalAlpha });
    },
    save() { stack.push({ fillStyle: this.fillStyle, globalAlpha: this.globalAlpha }); },
    restore() { Object.assign(this, stack.pop()); },
    moveTo() {}, lineTo() {}, stroke() {}, closePath() {}, strokeRect() {}, translate() {}, rotate() {}
  };
  return { context, text, screen, touched, resize: (next) => { width = next; } };
}

const models = { snake: SnakeModel, breakout: BreakoutModel, splat: SplatModel, asteroids: AsteroidsModel, missile: MissileModel, imitation: ImitationModel, starfall: StarfallModel };
const views = Object.fromEntries(await Promise.all(Object.keys(models).map(async (id) => [id, (await import(`../src/games/${id}/view.js`)).draw])));

function assertDrawnContrast(records, name) {
  assert.ok(records.length, `${name} draws text`);
  for (const { value, color, background, alpha } of records) {
    assert.ok(Object.values(CANVAS_PALETTE).includes(color), `${name}: ${value} uses shared palette (${color})`);
    assert.equal(alpha, 1, `${name}: ${value} is opaque`);
    assert.ok(background, `${name}: ${value} has a known backing shape`);
    assert.ok(contrast(color, background) >= 4.5, `${name}: ${value}: ${color} on ${background} = ${contrast(color, background).toFixed(2)}:1`);
  }
}

test("palette uses normal-text contrast even for headings; original footer fails", () => {
  assert.ok(contrast("#64748b", CANVAS_PALETTE.background) < 4.5);
  assert.ok(contrast("#06111f", "#475569") < 4.5);
  for (const [name, color] of Object.entries(CANVAS_PALETTE)) {
    if (["background", "onBright"].includes(name)) continue;
    assert.ok(contrast(color, CANVAS_PALETTE.background) >= 4.5, name);
  }
});

for (const [id, Model] of Object.entries(models)) {
  for (const { value: mode } of new Model().modes) {
    test(`${id}/${mode}: actual draw styles pass 4.5:1 and no frame ever touches the DOM`, () => {
      const model = new Model(); model.setSide(mode); model.reset();
      if (id === "breakout") {
        // Exercise every power-up color, rather than relying on random layouts.
        Object.keys(BRICK_LABELS).forEach((type, index) => Object.assign(model.bricks[index], { type, active: true }));
      }
      if (id === "missile") model.bases[0].alive = false;
      if (id === "splat" && mode === "builder") model.routeLimitReached = true;
      for (const width of [800, 375, 320]) {
        const recorder = recordingContext(width);
        views[id](model, recorder.context);
        assertDrawnContrast(recorder.text, `${id}/${mode}/${width}`);
        // The panel this replaces rebuilt itself from whatever happened to be
        // drawn that frame, so it grew and shrank mid-round and dragged the
        // page with it. Drawing must now have no DOM side effects at all.
        assert.deepEqual(recorder.touched, [], `${id}/${mode}/${width}: drawing creates and inserts no element`);
      }
      if (id === "splat" && mode === "race") {
        model.computerPlayer.x = model.player.x + 600;
        const { context, text } = recordingContext();
        views[id](model, context);
        assertDrawnContrast(text, "split race");
      }
    });
  }
}

test("no board width or drawn size can bring the label panel back", () => {
  // The panel appeared whenever any label fell under 12 CSS px, which on an
  // 800px board includes the 7px Breakout brick badges at full desktop width.
  // Sizing must no longer be able to produce page furniture.
  for (const width of [4000, 800, 375, 320, 200]) {
    for (const size of [7, 10, 12, 14, 16, 24]) {
      const recorder = recordingContext(width);
      drawText(recorder.context, "Green +1 life", 16, 28, size);
      assert.deepEqual(recorder.touched, [], `width ${width} at ${size}px adds nothing to the page`);
      assert.equal(recorder.text.length, 1);
    }
  }
});

test("engine overlay labels use the palette and add nothing to the page", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  try {
    for (const phase of ["ready", "countdown", "paused", "ended"]) {
      for (const width of [800, 375, 320]) {
        const recorder = recordingContext(width);
        const engine = Object.assign(Object.create(GameEngine.prototype), {
          context: recorder.context, running: true, lastTime: 0, ready: phase === "ready", countdown: phase === "countdown" ? 3 : 0,
          stopped: phase !== "countdown", paused: phase === "paused", lives: 3, maxLives: 3,
          input: { pressed: new Set(), pointer: {} }, clearTransientPointer() {},
          game: { score: 7, draw: (ctx) => drawText(ctx, "Game objective", 16, 28, 12), publicState: () => ({}) },
          lifecycle: { resultState: () => ({ ended: phase === "ended", heading: "GAME OVER", instruction: "Press New game to retry" }), lifeState: () => ({ owner: "host" }) }
        });
        engine.frame(16);
        assertDrawnContrast(recorder.text, `${phase}/${width}`);
        assert.deepEqual(recorder.touched, [], `${phase}/${width}: the overlay frame adds nothing to the page`);
        assert.ok(recorder.text.some(({ value }) => value.includes("Score: 7")));
      }
    }
  } finally { globalThis.requestAnimationFrame = originalRaf; }
});
