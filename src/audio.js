// Synthesised sound for the whole cabinet.
//
// No files, no licences, nothing to download and nothing for the page's strict
// CSP to object to: every sound is built from oscillators and noise at runtime.
// A future `.wav` can override any single recipe without touching a game -- the
// map below is the only place a sound is named.
//
// This module never throws and never touches a model. Games emit event ids as
// plain data; the facade drains them and asks for a sound. That keeps AudioContext
// out of the models, which the boundary check forbids, and it means a game's
// events are assertable without an audio device anywhere in sight.

// The shortest gap allowed between two plays of the same sound. Without it a
// held key or a wall of bricks turns into a buzz rather than a rhythm.
const MIN_GAP = {
  "asteroids:shoot": 0.05,
  "asteroids:split": 0.04,
  "breakout:bounce": 0.04,
  "splat:bounce": 0.04,
  "snake:eat": 0.03,
  "starfall:star": 0.04,
  "lamp:pulse": 0.1,
  "lamp:coin": 0.03
};
const DEFAULT_GAP = 0.02;
// One call can arrive with a whole frame's worth of events -- a Huge maze seeds
// 46 hazards at once. Distinct sounds are kept, repeats are collapsed, and the
// total is capped so a frame can never allocate a hundred oscillators.
const MAX_PER_CALL = 4;

function tone(context, out, { type = "sine", from, to = from, at = 0, duration = 0.12, gain = 0.18, attack = 0.006 }) {
  const start = context.currentTime + at;
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env);
  env.connect(out);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noise(context, out, buffer, { at = 0, duration = 0.1, gain = 0.12, from = 2400, to = 2400, q = 1 }) {
  const start = context.currentTime + at;
  if (!buffer) return;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const env = context.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), start + duration);
  filter.Q.value = q;
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(env);
  env.connect(out);
  source.start(start);
  source.stop(start + duration + 0.02);
}

// One oscillator and one noise burst, used by most of the cabinet. Everything
// here is a recipe over those two, so the whole game reads as a list of pitches.
// Used directly as a recipe, so the options have to have defaults of their own.
const blip = (ctx, out, noiseBuffer, o = {}) => {
  const shape = { type: "sine", from: 660, to: 990, duration: 0.1, gain: 0.15, ...o };
  tone(ctx, out, shape);
  noise(ctx, out, noiseBuffer, { duration: shape.duration * 0.5, gain: 0.05, from: 2600, to: 900 });
};
const arpeggio = (notes, { type = "triangle", duration = 0.13, gain = 0.16 } = {}) => (ctx, out) => {
  notes.forEach((frequency, index) => tone(ctx, out, { type, from: frequency, at: index * duration * 0.72, duration, gain }));
};
const fall = (from, to, o = {}) => (ctx, out, noiseBuffer) => {
  tone(ctx, out, { type: "sawtooth", from, to, duration: 0.42, gain: 0.14, ...o });
  noise(ctx, out, noiseBuffer, { duration: 0.3, gain: 0.08, from: 1600, to: 160 });
};
const rise = (from, to, o = {}) => (ctx, out, noiseBuffer) => {
  tone(ctx, out, { type: "square", from, to, duration: 0.3, gain: 0.1, ...o });
  noise(ctx, out, noiseBuffer, { duration: 0.34, gain: 0.07, from: 400, to: 3200 });
};

export const RECIPES = Object.freeze({
  // ---- Lamp: a struck lamp, a coin, glass, a hit, and a dark that closes in.
  "lamp:pulse": (ctx, out, n) => {
    tone(ctx, out, { type: "sine", from: 220, to: 150, duration: 0.16, gain: 0.16 });
    noise(ctx, out, n, { duration: 0.1, gain: 0.09, from: 3000, to: 500 });
  },
  "lamp:coin": (ctx, out) => {
    tone(ctx, out, { type: "sine", from: 880, duration: 0.07, gain: 0.14 });
    tone(ctx, out, { type: "sine", from: 1320, at: 0.06, duration: 0.09, gain: 0.13 });
  },
  "lamp:wisp": (ctx, out) => {
    [660, 990, 1320].forEach((frequency, index) => tone(ctx, out, { type: "triangle", from: frequency, at: index * 0.05, duration: 0.2, gain: 0.11 }));
  },
  "lamp:hazard": fall(300, 70, { type: "sawtooth" }),
  "lamp:maze": (ctx, out) => {
    tone(ctx, out, { type: "triangle", from: 520, duration: 0.11, gain: 0.13 });
    tone(ctx, out, { type: "triangle", from: 780, at: 0.1, duration: 0.15, gain: 0.12 });
  },
  "lamp:life": arpeggio([392, 330]),
  "lamp:dark": (ctx, out, n) => {
    tone(ctx, out, { type: "sawtooth", from: 150, to: 70, duration: 0.9, gain: 0.13 });
    tone(ctx, out, { type: "sawtooth", from: 151, to: 71, duration: 0.9, gain: 0.1 });
    noise(ctx, out, n, { duration: 0.9, gain: 0.06, from: 1200, to: 120 });
  },
  "lamp:win": arpeggio([523, 659, 784, 1047]),
  "lamp:lose": arpeggio([392, 349, 294, 220], { type: "sawtooth" }),

  // ---- Snake
  "snake:eat": blip,
  "snake:die": fall(420, 90, { type: "square" }),
  "snake:win": arpeggio([523, 659, 784, 1047]),

  // ---- Breakout
  "breakout:bounce": (ctx, out) => tone(ctx, out, { type: "sine", from: 660, to: 880, duration: 0.06, gain: 0.12 }),
  "breakout:brick": blip,
  "breakout:life": fall(380, 110, { type: "square" }),
  "breakout:win": arpeggio([523, 659, 784, 1047]),

  // ---- Splat
  "splat:bounce": (ctx, out) => tone(ctx, out, { type: "sine", from: 520, to: 700, duration: 0.06, gain: 0.11 }),
  "splat:column": (ctx, out, n) => {
    tone(ctx, out, { type: "square", from: 180, to: 120, duration: 0.1, gain: 0.13 });
    noise(ctx, out, n, { duration: 0.12, gain: 0.1, from: 1800, to: 300 });
  },
  "splat:life": fall(360, 100, { type: "square" }),
  "splat:win": arpeggio([523, 659, 784, 1047]),

  // ---- Asteroids
  "asteroids:shoot": (ctx, out) => tone(ctx, out, { type: "square", from: 1200, to: 420, duration: 0.05, gain: 0.07 }),
  "asteroids:split": (ctx, out, n) => noise(ctx, out, n, { duration: 0.16, gain: 0.1, from: 3200, to: 400 }),
  "asteroids:hit": (ctx, out, n) => {
    noise(ctx, out, n, { duration: 0.22, gain: 0.13, from: 2600, to: 200 });
    tone(ctx, out, { type: "square", from: 220, to: 80, duration: 0.18, gain: 0.12 });
  },
  "asteroids:life": fall(340, 90, { type: "sawtooth" }),
  "asteroids:win": arpeggio([523, 659, 784, 1047]),

  // ---- Missile Command
  "missile:launch": rise(300, 1400),
  "missile:intercept": (ctx, out) => {
    tone(ctx, out, { type: "sine", from: 1400, to: 700, duration: 0.14, gain: 0.13 });
    noise(ctx, out, null, { duration: 0.01, gain: 0 });
  },
  "missile:city": fall(240, 60, { type: "sawtooth" }),
  "missile:wave": rise(500, 1900),
  "missile:win": arpeggio([523, 659, 784, 1047]),
  "missile:lose": arpeggio([392, 349, 294, 220], { type: "sawtooth" }),

  // ---- Starfall
  "starfall:gem": (ctx, out) => {
    tone(ctx, out, { type: "sine", from: 1568, duration: 0.09, gain: 0.12 });
    tone(ctx, out, { type: "sine", from: 2093, at: 0.04, duration: 0.14, gain: 0.09 });
  },
  "starfall:star": (ctx, out, n) => noise(ctx, out, n, { duration: 0.08, gain: 0.09, from: 2200, to: 800 }),
  "starfall:life": fall(360, 100, { type: "square" }),
  "starfall:win": arpeggio([523, 659, 784, 1047])
});

// Imitation is a conversation, not a simulation: it has no gameplay events to
// sound, and a chime on every reply would talk over the person you are replying
// to. It is deliberately absent rather than given an arbitrary blip.
export const SOUNDED_GAMES = Object.freeze(["snake", "breakout", "splat", "asteroids", "missile", "starfall", "lamp"]);

function defaultContextFactory() {
  // Absent in the headless suites, in a browser that refuses audio, or before
  // any gesture. Returning null is a normal state, not a failure.
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return null;
  try { return new Ctor(); } catch { return null; }
}

export function createAudio({ contextFactory = defaultContextFactory, masterGain = 0.5 } = {}) {
  let context = null;
  let noiseBuffer = null;
  let out = null;
  let muted = false;
  // Nonvisual assistance freezes time and asks the player to read the board as
  // text. Sound on top of that is noise, so it is suppressed there.
  let suppressed = false;
  const lastPlayed = new Map();

  const ensure = () => {
    if (context) return true;
    context = contextFactory();
    if (!context) return false;
    out = context.createGain();
    out.gain.value = masterGain;
    out.connect(context.destination);
    noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return true;
  };

  const api = {
    // Browsers refuse to start audio until the player has interacted with the
    // page, so the context is only built once a real gesture has happened.
    unlock() {
      if (!ensure()) return false;
      if (context.state === "suspended" && context.resume) context.resume();
      return true;
    },
    isMuted() { return muted; },
    setMuted(value) { muted = Boolean(value); },
    isSuppressed() { return suppressed; },
    setSuppressed(value) { suppressed = Boolean(value); },
    // Plays the sounds named by a game's events for one frame. Unknown names are
    // ignored, so a game can emit an event before anyone has given it a sound.
    play(gameId, events) {
      if (muted || suppressed || !events || !events.length) return 0;
      // Deliberately not ensure(). A context built before the player has touched
      // the page starts suspended and is a thing the browser may refuse, and a
      // game that emitted an event during load would create one with no intent
      // behind it. Nothing is heard until unlock() says a real gesture happened.
      if (!context) return 0;
      let played = 0;
      const seen = new Set();
      for (const event of events) {
        if (played >= MAX_PER_CALL) break;
        const name = `${gameId}:${event}`;
        const recipe = RECIPES[name];
        if (!recipe || seen.has(name)) continue;
        const now = context.currentTime;
        const gap = MIN_GAP[name] ?? DEFAULT_GAP;
        if (now - (lastPlayed.get(name) ?? -Infinity) < gap) continue;
        lastPlayed.set(name, now);
        seen.add(name);
        recipe(context, out, noiseBuffer);
        played += 1;
      }
      return played;
    },
    dispose() {
      lastPlayed.clear();
      if (context && context.close) context.close();
      context = null;
      out = null;
      noiseBuffer = null;
    }
  };
  return api;
}

// One shared instance for the page. Games never import it directly: a facade
// calls playSounds below, which is the only bridge from a model's events to the
// audio hardware.
let shared = null;

export function getAudio() {
  if (!shared) shared = createAudio();
  return shared;
}

export function playSounds(gameId, events) {
  return getAudio().play(gameId, events);
}

export function unlockAudio() {
  return getAudio().unlock();
}

export function setAudioMuted(value) { getAudio().setMuted(value); }
export function isAudioMuted() { return getAudio().isMuted(); }
export function setAudioSuppressed(value) { getAudio().setSuppressed(value); }
