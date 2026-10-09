import test from "node:test";
import assert from "node:assert/strict";
import { createAudio, RECIPES, SOUNDED_GAMES } from "../src/audio.js";
import { installEvents } from "../src/events.js";
import { LampGame } from "../src/games/lamp.js";
import { SnakeGame } from "../src/games/snake.js";
import { BreakoutGame } from "../src/games/breakout.js";
import { SplatGame } from "../src/games/splat.js";
import { AsteroidsGame } from "../src/games/asteroids.js";
import { MissileCommandGame } from "../src/games/missile.js";
import { StarfallGame } from "../src/games/starfall.js";

// A stand-in for the Web Audio graph that records what would have been built.
// The point is that every sound decision -- which sounds, how many, in what
// order -- is assertable with no audio hardware and no browser.
function fakeAudio() {
  const log = [];
  let now = 0;
  const param = () => ({
    value: 0,
    setValueAtTime(value) { this.value = value; return this; },
    exponentialRampToValueAtTime(value) { this.value = value; return this; },
    linearRampToValueAtTime(value) { this.value = value; return this; }
  });
  const node = (kind) => ({
    kind,
    type: "",
    frequency: param(),
    gain: param(),
    Q: param(),
    buffer: null,
    connect(target) { log.push({ kind: "connect", from: kind, to: target?.kind }); return target; },
    start(at) { log.push({ kind: "start", node: kind, at }); },
    stop(at) { log.push({ kind: "stop", node: kind, at }); }
  });
  const context = {
    sampleRate: 48000,
    destination: node("destination"),
    state: "running",
    currentTime: 0,
    resume() { context.state = "running"; log.push({ kind: "resume" }); },
    close() { log.push({ kind: "close" }); },
    createOscillator() { return node("oscillator"); },
    createGain() { return node("gain"); },
    createBufferSource() { return node("bufferSource"); },
    createBiquadFilter() { return node("filter"); },
    createBuffer(channels, length) {
      log.push({ kind: "createBuffer", length });
      return { getChannelData: () => new Float32Array(length) };
    }
  };
  return {
    context,
    log,
    advance(seconds) { now += seconds; context.currentTime = now; },
    // osc start() calls in one window are what a listener actually hears.
    oscillators() { return log.filter((entry) => entry.kind === "start" && entry.node === "oscillator"); }
  };
}

const noAudio = () => createAudio({ contextFactory: () => null });

test("a sound is built only after a gesture, and never without a context", () => {
  const fake = fakeAudio();
  const audio = createAudio({ contextFactory: () => fake.context });
  assert.deepEqual(fake.log, [], "nothing is built before the player interacts");
  assert.equal(audio.play("snake", ["eat"]), 0, "and nothing is heard");
  assert.equal(audio.unlock(), true);
  assert.ok(fake.log.some((entry) => entry.kind === "createBuffer"), "the context is built on the gesture");
  assert.equal(audio.play("snake", ["eat"]), 1);
  assert.ok(fake.oscillators().length > 0, "which produces an actual sound");
});

test("the page is still fully playable where audio does not exist at all", () => {
  // No AudioContext is the normal state in the headless suites, and a browser can
  // refuse one. Audio must be inert there rather than throwing.
  const audio = noAudio();
  assert.equal(audio.unlock(), false);
  assert.equal(audio.play("snake", ["eat"]), 0);
  audio.setMuted(true);
  assert.equal(audio.play("snake", ["eat"]), 0);
  assert.doesNotThrow(() => audio.dispose());
});

test("muting and suppression are both silent, and muting can be undone", () => {
  const fake = fakeAudio();
  const audio = createAudio({ contextFactory: () => fake.context });
  audio.unlock();
  audio.setMuted(true);
  assert.equal(audio.isMuted(), true);
  assert.equal(audio.play("snake", ["eat"]), 0, "a muted cabinet is silent");
  audio.setMuted(false);
  fake.advance(1);
  assert.equal(audio.play("snake", ["eat"]), 1, "and can be unmuted");
  // Nonvisual assistance freezes time and reads the board as text. Sound there is
  // noise laid over a state the player is already parsing in words.
  audio.setSuppressed(true);
  assert.equal(audio.isSuppressed(), true);
  assert.equal(audio.play("snake", ["eat"]), 0, "assistance mode is silent");
  audio.setSuppressed(false);
  fake.advance(1);
  assert.equal(audio.play("snake", ["eat"]), 1);
});

test("one frame cannot turn into a hundred oscillators", () => {
  const fake = fakeAudio();
  const audio = createAudio({ contextFactory: () => fake.context });
  audio.unlock();
  fake.advance(1);
  // A Huge maze seeds 46 hazards, and a held key can fire many times a second.
  const crowd = Array.from({ length: 60 }, (_, index) => (index % 2 ? "coin" : "bounce"));
  const played = audio.play("lamp", crowd);
  assert.ok(played <= 4, `${played} distinct sounds were played from one frame`);
  // Repeats of the same sound inside a frame collapse to one, which is what
  // stops a wall of bricks becoming a buzz.
  assert.equal(audio.play("breakout", Array.from({ length: 20 }, () => "brick")), 1);
  assert.ok(fake.oscillators().length < 40, "the oscillator count stayed bounded");
});

test("a sound that repeats faster than its gap is dropped rather than stacked", () => {
  const fake = fakeAudio();
  const audio = createAudio({ contextFactory: () => fake.context });
  audio.unlock();
  assert.equal(audio.play("asteroids", ["shoot"]), 1, "the first shot is heard");
  fake.advance(0.01);
  assert.equal(audio.play("asteroids", ["shoot"]), 0, "one ten-thousandth later it is not a new shot");
  fake.advance(0.2);
  assert.equal(audio.play("asteroids", ["shoot"]), 1, "and after the gap it is");
});

test("every sounded game has a recipe for every event it emits", () => {
  // A typo in an event name would otherwise be a silence nobody notices.
  const games = { snake: new SnakeGame(), breakout: new BreakoutGame(), splat: new SplatGame(), asteroids: new AsteroidsGame(), missile: new MissileCommandGame(), starfall: new StarfallGame(), lamp: new LampGame() };
  for (const [id, game] of Object.entries(games)) {
    assert.ok(SOUNDED_GAMES.includes(id), `${id} is on the sounded list`);
    game.reset();
    game.update(1 / 60, { keys: new Set(), pressed: new Set(), mode: "keyboard", pointer: { x: 0, y: 0, down: false, clicked: false } });
    game.model.won = true;
    game.won = true;
    for (const event of new Set(game.model.events)) {
      assert.ok(RECIPES[`${id}:${event}`], `${id} emits "${event}" but nothing knows how to play it`);
    }
  }
});

test("Imitation is deliberately unsounded, and says why", () => {
  // A conversation game has no gameplay events, and a chime per reply would talk
  // over the person you are replying to. It is absent on purpose, not missed.
  assert.equal(SOUNDED_GAMES.includes("imitation"), false);
});

test("Lamp's events arrive on the right transitions, not on the wrong ones", () => {
  const game = new LampGame();
  game.reset();
  const model = game.model;
  const ptr = { x: 0, y: 0, down: false, clicked: false };
  const idle = { keys: new Set(), pressed: new Set(), mode: "keyboard", pointer: ptr };
  const seen = () => { const events = model.events.slice(); model.events.length = 0; return events; };
  seen();

  // The round opens with a free look that is not the player's pulse, so it makes
  // no sound either -- and it cannot be replayed to fake one.
  model.update(3, { move: null, lampDown: false, lampTap: false });
  assert.deepEqual(seen(), [], "the free opening reveal is not a pulse the player made");
  assert.equal(model.lit(), false, "and the round is now in the dark");
  // The model is driven directly here on purpose: the facade drains the queue on
  // every update, so going through it would test the bridge, not the emission.
  model.update(1 / 60, { move: null, lampDown: true, lampTap: true });
  for (let tick = 0; tick < 200 && model.lit(); tick += 1) model.update(1 / 60, {});
  assert.deepEqual(seen(), ["pulse"], "one pulse makes one sound, not one per frame of it");

  model.player = { ...model.coins[0] };
  model.update(1 / 60, {});
  assert.deepEqual(seen(), ["coin"]);

  model.player = { ...model.exit };
  model.update(1 / 60, {});
  assert.ok(seen().includes("win"), "reaching the exit wins, and says so");

  // Walking into nothing at all must be silent.
  model.player = { x: 1.5, y: 1.5 };
  model.update(1 / 60, { move: { x: 1, y: 0 }, lampDown: false, lampTap: false });
  assert.deepEqual(seen(), [], "walking is not a sound");
});

test("a chained maze makes a sound of its own, and never a win", () => {
  const game = new LampGame();
  game.setSide("continue");
  game.reset();
  const model = game.model;
  const ptr = { x: 0, y: 0, down: false, clicked: false };
  const idle = { keys: new Set(), pressed: new Set(), mode: "keyboard", pointer: ptr };
  model.update(1 / 60, { move: null, lampDown: false, lampTap: false });
  model.events.length = 0;
  model.player = { ...model.exit };
  model.update(1 / 60, { move: null, lampDown: false, lampTap: false });
  const events = model.events.slice();
  model.events.length = 0;
  assert.ok(events.includes("maze"), "clearing a maze in a chain is its own sound");
  assert.equal(events.includes("win"), false, "and it is not a win, because the run continues");
  assert.equal(model.won, false);
});

test("the host's own loss is caught by the facade, not missed", () => {
  // The engine ends a run by setting gameOver on the facade, not on the model, so
  // a sound emitted only from the model's own branches would never fire here.
  const game = new LampGame();
  game.reset();
  game.model.events.length = 0;
  game.gameOver = true;
  assert.ok(game.model.events.includes("lose"), "spending the last life is heard");
  game.model.events.length = 0;
  game.won = true;
  assert.ok(game.model.events.includes("win"));
  game.model.events.length = 0;
  game.gameOver = false;
  game.won = false;
  assert.deepEqual(game.model.events, [], "clearing the flags is not a sound");
});

test("an event queue is a plain data structure a model can own", () => {
  const model = installEvents({});
  assert.deepEqual(model.drainEvents(), [], "a fresh queue is empty");
  model.emit("a");
  model.emit("b");
  model.emit("a");
  assert.deepEqual(model.drainEvents(), ["a", "b", "a"]);
  assert.deepEqual(model.drainEvents(), [], "draining empties it");
  model.emit("c");
  model.clearEvents();
  assert.deepEqual(model.drainEvents(), []);
});
