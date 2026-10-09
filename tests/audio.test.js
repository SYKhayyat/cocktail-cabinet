import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAudio, RECIPES, SOUNDED_GAMES } from "../src/audio.js";
import { installEvents } from "../src/events.js";
import { LampGame } from "../src/games/lamp.js";
import { LampModel } from "../src/games/lamp/model.js";
import { MissileModel } from "../src/games/missile/model.js";
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

const GAMES = {
  snake: SnakeGame, breakout: BreakoutGame, splat: SplatGame,
  asteroids: AsteroidsGame, missile: MissileCommandGame, starfall: StarfallGame, lamp: LampGame
};

// Drives a game hard enough to reach every outcome it can reach, and reports
// every event id it emitted along the way. Static reading of the source is not
// enough: an event behind a branch the driver never enters is still an event the
// recipe has to exist for.
const collectEvents = (Game) => {
  const game = new Game();
  const seen = new Set();
  const record = () => { for (const event of game.model.drainEvents()) seen.add(event); };
  const input = { keys: new Set(), pressed: new Set(), mode: "keyboard", pointer: { x: 200, y: 200, down: false, clicked: false } };
  // The model is driven directly on purpose. The facade drains the queue on every
  // update, so going through it would collect nothing at all.
  let sawWin = false;
  const run = (dt, keys) => { game.model.update(dt, { ...input, ...keys }); for (const e of game.model.events) seen.add(e); game.model.events.length = 0; if (game.model.won) sawWin = true; };
  for (const side of game.sides ?? [undefined]) {
    if (side !== undefined) game.setSide(side);
    for (let round = 0; round < 3; round += 1) {
      game.reset();
      game.model.events.length = 0;
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "d", "n", "q", "e", "c", "g", "g", "n"]) {
        run(1 / 60, { keys: { x: 0, y: 0 }, lampDown: false, lampTap: false, keyDirection: 1, drift: 1, bounce: 1 });
        run(1 / 60, { keyDirection: -1, drift: -1, bounce: -1 });
        run(1 / 60, { turn: 1, thrust: 1, fire: true });
        run(1 / 60, { turn: -1, launch: true, aim: { x: 200, y: 200 } });
        run(1 / 60, { lampDown: true, lampTap: true });
        run(1 / 60, { lampDown: false, lampTap: false });
        run(1 / 60, { bounce: -1, drift: -1 });
      }
      for (let tick = 0; tick < 240; tick += 1) {
        run(1 / 60, { lampDown: tick % 40 < 2, lampTap: tick % 40 === 0, fire: tick % 12 === 0, launch: tick % 20 === 0 });
        if (game.model.gameOver || game.model.won) break;
      }
    }
  }
  return { seen, sawWin };
};

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

test("every sound has an emitter, and every emitter has a sound", () => {
  // A recipe nothing ever emits is a sound that can never be heard, and an event
  // with no recipe is a silence. Both were true on the first pass -- five games
  // could lose in complete silence -- and neither shows up in a run that only
  // checks the events one drive happens to reach.
  //
  // This cross-references the two sets of literals rather than driving the games,
  // because driving can only prove a sound happens on the paths it takes. Reaching
  // a coin or an exit is not something a generic driver can be relied on to do.
  const declared = new Set();
  for (const [id] of Object.entries(GAMES)) {
    const model = readFileSync(new URL(`../src/games/${id}/model.js`, import.meta.url), "utf8");
    for (const [, name] of model.matchAll(/\.emit\("([^"]+)"\)/g)) declared.add(`${id}:${name}`);
    // The host ends every run by setting gameOver on the facade, so a loss is
    // declared for every game even where the model has no losing branch.
    declared.add(`${id}:lose`);
  }
  const recipes = Object.keys(RECIPES);
  assert.deepEqual(recipes.filter((name) => !declared.has(name)), [], "these sounds can never be heard");
  assert.deepEqual([...declared].filter((name) => !recipes.includes(name)), [], "these events have nothing to play them");
});

test("a game with no win to hear has no win recipe", () => {
  // Starfall is an endless runner: a run ends by running out of lives and never by
  // clearing a board, so the facade's win sound could never play for it. Its
  // absence is asserted rather than left to be discovered as dead code.
  assert.equal(RECIPES["starfall:win"], undefined);
  const model = readFileSync(new URL("../src/games/starfall/model.js", import.meta.url), "utf8");
  assert.equal(/this\.won = true/.test(model), false, "because Starfall never wins");
});

test("every game can lose out loud", () => {
  // The host ends a run by setting gameOver on the facade, so "lose" is emitted
  // for every game whether or not its model has a losing branch of its own.
  for (const [id, game] of Object.entries(GAMES)) {
    const instance = new game();
    instance.reset();
    instance.model.events.length = 0;
    instance.gameOver = true;
    assert.ok(instance.model.events.includes("lose"), `${id} could lose in silence`);
    assert.ok(RECIPES[`${id}:lose`], `${id} has nothing to play its loss`);
  }
});

test("Missile Command's two best moments are audible", () => {
  // Both had a recipe and no emitter, which is the same defect as a silent loss
  // wearing a different hat: the recipe exists, so a reading of the map says the
  // game is sounded.
  assert.ok(RECIPES["missile:intercept"]);
  assert.ok(RECIPES["missile:city"]);
  const model = new MissileModel();
  model.reset();
  // Nothing is in the air until the first wave has spawned.
  for (let tick = 0; tick < 300 && !model.enemyMissiles.length; tick += 1) model.update(1 / 60, {});
  const city = model.cities.find((entry) => entry.alive);
  const enemy = model.enemyMissiles[0];
  assert.ok(city, "there is a city to lose");
  assert.ok(enemy, "and a missile to lose it to");
  enemy.targetObject = city;
  enemy.kind = "city";
  model.events.length = 0;
  model.impactEnemy(enemy);
  assert.ok(model.events.includes("city"), "a city going up is heard");
});

test("the queue cannot grow without bound", () => {
  // The nonvisual panel steps the model directly and never goes through the
  // facade, so on a long assisted session nothing ever drains it.
  const model = installEvents({});
  for (let index = 0; index < 5000; index += 1) model.emit("coin");
  assert.ok(model.events.length <= 256, `the queue grew to ${model.events.length}`);
  assert.equal(model.events.at(-1), "coin", "and the newest event is still there");
});

test("the reminder does not outlive the run", () => {
  // update() returns early once a run is over, so a countdown left to decay
  // froze on screen for ever -- and a run that ended inside the first seven
  // seconds showed the banner over the maze reveal from then on.
  const model = new LampModel();
  model.reset();
  assert.ok(model.hintRemaining > 0);
  model.won = true;
  model.update(1 / 60, {});
  assert.equal(model.hintRemaining, 0, "winning puts the reminder away");
  const lost = new LampModel();
  lost.reset();
  lost.gameOver = true;
  lost.update(1 / 60, {});
  assert.equal(lost.hintRemaining, 0, "and so does losing");
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
