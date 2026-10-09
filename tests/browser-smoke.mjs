// Deterministic CDP coverage for the cabinet.
//
// This drives the real page over the DevTools protocol. Where a behaviour
// depends on time or randomness, the suite installs a seeded Math.random and
// steps the engine by hand through __cocktailCabinet.engine.frame(), so runs
// are reproducible and assertions are not racing requestAnimationFrame.
//
// Skips cleanly (exit 0) when no Chromium is listening on CDP_URL, so it can
// live in the normal test run without becoming a hard dependency. Set
// REQUIRE_BROWSER=1 in CI to make a missing browser a failure.

import { classifyPolicyViolations } from './csp-evidence.mjs';

const pageUrl = process.env.COCKTAIL_URL || "http://127.0.0.1:8765/";
const cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9321";
const required = process.env.REQUIRE_BROWSER === "1";
let browser;
let browserContextId;
let hostileContextId;
const pageConnections = new Set();
let reportedOptionalBeacon = false;

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener("close", () => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error("CDP connection closed"));
      }
      this.pending.clear();
    });
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result || {});
    });
  }
  command(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  async evaluate(expression) {
    const result = await this.command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description || details.text || "Runtime evaluation failed");
    }
    return result.result?.value;
  }
  close() { this.socket.close(); }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function assertMatch(actual, pattern, message) {
  if (!pattern.test(String(actual ?? ""))) throw new Error(`${message} (got ${JSON.stringify(actual)})`);
}

async function targetFor(contextId) {
  if (!contextId) throw new Error("The smoke browser context is not ready");
  const { targetId } = await browser.command("Target.createTarget", { url: "about:blank", browserContextId: contextId });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${cdpUrl}/json/list`);
    if (response.ok) {
      const target = (await response.json()).find((entry) => entry.id === targetId);
      if (target) return target;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Could not find browser target ${targetId}`);
}

async function waitFor(page, expression, description, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await page.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function openPage(url, contextId = browserContextId) {
  const target = await targetFor(contextId);
  const page = new Cdp(target.webSocketDebuggerUrl);
  pageConnections.add(page);
  await page.open();
  await page.command("Page.enable");
  await page.command("Runtime.enable");
  // Modules are served with caching, so a stale engine.js from an earlier run
  // can silently pass the suite. Disable caching for the whole session.
  await page.command("Network.enable");
  await page.command("Network.setCacheDisabled", { cacheDisabled: true });
  await page.command('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.__policyViolations = []; addEventListener('securitypolicyviolation', event => { let resource = event.blockedURI; try { const url = new URL(resource); resource = url.origin + url.pathname; } catch {} __policyViolations.push({ directive: event.effectiveDirective, resource, disposition: event.disposition }); });` });
  await page.command("Page.navigate", { url: `${url}${url.includes("?") ? "&" : "?"}smoke=${Date.now()}${Math.random()}` });
  await waitFor(page, "document.readyState === 'complete' && document.querySelectorAll('.game-card').length === 8 && !!globalThis.__cocktailCabinet", "cabinet boot");
  return { target, page };
}

async function openBrowser() {
  const response = await fetch(`${cdpUrl}/json/version`);
  if (!response.ok) throw new Error(`Could not inspect browser: ${response.status}`);
  const version = await response.json();
  if (/Electron|omnirush/i.test(version['User-Agent'] || '')) throw new Error('Use dedicated Chromium, not the desktop application debugging endpoint');
  if (!version.webSocketDebuggerUrl) throw new Error("The browser does not expose a WebSocket debugger endpoint");
  const connection = new Cdp(version.webSocketDebuggerUrl);
  await connection.open();
  return connection;
}

async function createSmokeContext() {
  browser ||= await openBrowser();
  ({ browserContextId } = await browser.command("Target.createBrowserContext", { disposeOnDetach: true }));
}

async function disposeSmokeContext() {
  try {
    if (browser && browserContextId) {
      await browser.command("Target.disposeBrowserContext", { browserContextId });
    }
  } finally {
    try {
      if (browser && hostileContextId) await browser.command("Target.disposeBrowserContext", { browserContextId: hostileContextId });
    } finally {
      pageConnections.forEach((page) => page.close());
      pageConnections.clear();
      browserContextId = null;
      hostileContextId = null;
      browser?.close();
      browser = null;
    }
  }
}

// Installs deterministic randomness and freezes requestAnimationFrame so the
// suite can step the engine explicitly. Returns a stepper that advances the
// engine by a fixed number of 1/60s frames.
async function makeDeterministic(page) {
  await page.evaluate(`(async () => {
    const engine = globalThis.__cocktailCabinet.engine;
    const nativeFrame = globalThis.requestAnimationFrame.bind(globalThis);
    globalThis.__wallNow = performance.now.bind(performance);
    // Cancel the frame that boot already queued BEFORE replacing cancellation.
    // Otherwise that native callback can arrive after virtual ticks and move
    // lastTime backwards, producing negative dt/cooldowns in fast CI runs.
    globalThis.cancelAnimationFrame(engine.animationFrame);
    let seed = 20260101 >>> 0;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    globalThis.__rafHandles = [];
    globalThis.requestAnimationFrame = (callback) => {
      globalThis.__rafHandles.push(callback);
      return globalThis.__rafHandles.length;
    };
    globalThis.cancelAnimationFrame = () => {};
    // Keep the engine running but stop frames from arriving on their own:
    // the real loop already re-schedules through the stub above, so the
    // page advances only when step() calls frame() explicitly.
    engine.running = true;
    // Virtual clock. Every frame must come from this monotonic source: reusing
    // performance.now() per call would hand frame() a timestamp behind its own
    // lastTime and produce a negative delta, which silently skips updates.
    globalThis.__now = performance.now() + 1000;
    // load/restart/continue also read performance.now(). They must use the
    // same clock as frame(): expensive DOM/rendering work can otherwise move
    // wall time ahead of __now and make the next virtual delta negative.
    Object.defineProperty(performance, 'now', { configurable: true, value: () => globalThis.__now });
    globalThis.__tick = (frames = 1) => {
      for (let frame = 0; frame < frames; frame += 1) {
        globalThis.__now += 1000 / 60;
        engine.frame(globalThis.__now);
        globalThis.__rafHandles.length = 0;
      }
      return true;
    };
    const frozenTime = engine.lastTime;
    await new Promise((resolve) => nativeFrame(resolve));
    if (engine.lastTime !== frozenTime) throw new Error('A native frame escaped the deterministic clock');
    return true;
  })()`);
  return async (frames = 1) => page.evaluate(`globalThis.__tick(${frames})`);
}

// Drives frames until the round is actually live -- countdown finished, not
// paused, not stopped, not game over. Blindly ticking a fixed number of frames
// is not enough: a round can re-enter its countdown or end between setup and
// assertion, and an input dispatched then lands while update() is not running,
// which looks exactly like a broken control.
// Drives frames until the round reaches a settled state: either live
// (countdown finished, not paused, not stopped) or finished (game over or
// won). Blindly ticking a fixed number of frames is not enough -- a round can
// re-enter its countdown or end between setup and assertion, and an input
// dispatched then lands while update() is not running, which looks exactly
// like a broken control.
//
// `requireLive` distinguishes the two callers: suites that dispatch an input
// need a live round, while the mode catalogue only needs the round to have
// reached a definite state, since a duel can legitimately end on its own.
async function settle(page, { requireLive = true, maxFrames = 1200 } = {}) {
  const state = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const game = () => engine.game;
    for (let frame = 0; frame < ${maxFrames}; frame += 1) {
      globalThis.__tick(1);
      const pending = engine.countdown > 0 || engine.paused || engine.stopped || engine.ready;
      const finished = Boolean(game()?.gameOver || game()?.won);
      if (pending) continue;
      if (!finished || ${requireLive ? "false" : "true"}) return { live: !finished, finished, frames: frame + 1 };
    }
    return { live: false, finished: false, frames: ${maxFrames} };
  })()`);
  if (state.live || state.finished) return state;
  throw new Error(`Round never settled within ${maxFrames} frames (${await describeState(page)})`);
}

async function describeState(page) {
  return page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const game = engine.game;
    return JSON.stringify({
      id: game?.id, side: game?.side, countdown: Math.round(engine.countdown * 100) / 100,
      paused: engine.paused, stopped: engine.stopped, ready: engine.ready,
      gameOver: game?.gameOver, won: game?.won, lives: engine.lives
    });
  })()`);
}

async function selectMode(page, cardIndex, side) {
  await page.evaluate(`(() => {
    document.querySelectorAll('.game-card')[${cardIndex}].click();
    const select = document.querySelector('#sideSelect');
    if (${JSON.stringify(side)} !== null) {
      select.value = ${JSON.stringify(side)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Changing the mode now reopens the cabinet in the READY state, waiting for
    // New game. Every suite below asserts against a running board, so release
    // the round directly rather than through the button: a restart would
    // publish the countdown and pre-consume the announcement key that
    // testFocusedAnnouncements checks. setSide already reset the round and
    // applied the life budget, so only the running flags are left to set.
    const engine = globalThis.__cocktailCabinet.engine;
    engine.ready = false;
    engine.stopped = false;
    engine.paused = false;
    engine.countdown = 0;
    return true;
  })()`);
}

const GAME_CARDS = [
  { id: "snake", modes: ["snake", "apples"] },
  { id: "breakout", modes: ["bottom", "blocks", "versus"] },
  { id: "splat", modes: ["climber", "race", "builder"] },
  { id: "asteroids", modes: ["ship", "versus", "rocks"] },
  { id: "missile", modes: ["defender", "attacker"] },
  { id: "imitation", modes: ["ai", "human", "guess", "provide", "write"] },
  { id: "starfall", modes: ["runner", "stars"] },
  { id: "lamp", modes: ["walk", "continue"] }
];

async function testBootAndDescriptors(page) {
  const report = await page.evaluate(`(() => ({
    cards: [...document.querySelectorAll('.game-card')].map((card) => card.textContent.replace(/\\s+/g, ' ').trim()),
    lives: document.querySelector('#lives').textContent,
    status: document.querySelector('#roundStatus').textContent,
    statsHidden: document.querySelector('#gameStats').hidden
  }))()`);
  assertEqual(report.cards.length, 8, "eight game cards render");
  assertEqual(report.lives, "3/3", "lives start at 3/3");
  assertEqual(report.status, "Press New game to start", "the cabinet opens in the ready state");
  assertEqual(report.statsHidden, false, "score and lives are visible on the arcade games");

  // Every mode in every registered game is selectable and reaches its model.
  const modes = await page.evaluate(`(() => {
    const out = {};
    document.querySelectorAll('.game-card').forEach((card, index) => {
      card.click();
      out[index] = [...document.querySelectorAll('#sideSelect option')].map((option) => option.value);
    });
    return out;
  })()`);
  GAME_CARDS.forEach((game, index) => {
    assertEqual(modes[index].join(","), game.modes.join(","), `${game.id} offers exactly its registered modes`);
  });

  // Each mode's label and control hint come from the model's descriptor.
  const labels = await page.evaluate(`(() => {
    const out = {};
    document.querySelectorAll('.game-card').forEach((card, index) => {
      card.click();
      out[index] = [...document.querySelectorAll('#sideSelect option')].map((option) => option.textContent);
    });
    return out;
  })()`);
  GAME_CARDS.forEach((game, index) => {
    for (const label of labels[index]) assert(label.length > 4, `${game.id} mode "${label}" has a real label`);
  });

  const hints = await page.evaluate(`(() => {
    const out = [];
    document.querySelectorAll('.game-card').forEach((card, index) => {
      card.click();
      out.push(document.querySelector('#controlHint').textContent.replace(/\\s+/g, ' ').trim());
    });
    return out;
  })()`);
  hints.forEach((hint, index) => {
    assert(hint.length > 4, `${GAME_CARDS[index].id} shows a control hint`);
    assert(!/launch \/ fire/.test(hint), `${GAME_CARDS[index].id} hint is per-game, not the old global string`);
  });

  const settings = await page.evaluate(`(() => {
    document.querySelectorAll('.game-card')[0].click();
    const cols = document.querySelector('#snakeCols');
    const rows = document.querySelector('#snakeRows');
    const length = document.querySelector('#snakeLength');
    const spacing = document.querySelector('#splatSpacing');
    return {
      cols: [cols.min, cols.max, cols.step, cols.value],
      rows: [rows.min, rows.max, rows.step, rows.value],
      length: [length.min, length.max, length.step, length.value],
      spacing: [spacing.min, spacing.max, spacing.step, spacing.value],
      caption: document.querySelector('[data-setting-label="cols"]').textContent
    };
  })()`);
  assertEqual(settings.cols.join(","), "10,60,1,40", "Snake column bounds come from the descriptor");
  assertEqual(settings.rows.join(","), "8,44,1,28", "Snake row bounds come from the descriptor");
  assertEqual(settings.length.join(","), "3,12,1,3", "Snake length bounds come from the descriptor");
  assertEqual(settings.spacing.join(","), "90,240,10,130", "Splat spacing bounds come from the descriptor");
  assertEqual(settings.caption, "Columns", "setting labels come from the descriptor");

  // Lamp is the only game with a select, and a select holds a name rather than a
  // number. Coercing it to Number made every difficulty validate as NaN and the
  // dropdown did nothing at all, which no unit test could see because they all
  // go through the model API instead of the markup.
  const lamp = await page.evaluate(`(() => {
    document.querySelectorAll('.game-card')[7].click();
    const preset = document.querySelector('#lampPreset');
    const cols = document.querySelector('#lampCols');
    const sizes = [];
    for (const choice of ['small', 'medium', 'big', 'huge']) {
      preset.value = choice;
      preset.dispatchEvent(new Event('change', { bubbles: true }));
      const game = globalThis.__cocktailCabinet.games.get('lamp');
      game.applyPendingSettings();
      game.reset();
      const layout = game.model.layout();
      sizes.push({ choice, cols: game.model.cols, rows: game.model.rows, tile: Number(layout.tile.toFixed(1)), shown: cols.value, disabled: cols.disabled });
    }
    preset.value = 'custom';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    return { options: [...preset.options].map((option) => option.value), sizes, customDisabled: cols.disabled, caption: document.querySelector('#lampSettings [data-setting-label="cols"]').textContent };
  })()`);
  assertEqual(lamp.options.join(","), "custom,small,medium,big,huge", "the difficulty dropdown comes from the descriptor");
  assertEqual(lamp.sizes.map((size) => size.cols).join(","), "21,29,41,53", "every difficulty reaches the model");
  assertEqual(lamp.sizes.map((size) => size.rows).join(","), "13,17,25,31", "and its maze gets taller too");
  assertEqual(new Set(lamp.sizes.map((size) => size.tile)).size, 4, "the four sizes draw at four different tile sizes");
  assertEqual(lamp.sizes.every((size) => size.disabled), true, "a chosen difficulty greys the number fields out");
  assertEqual(lamp.sizes.map((size) => size.shown).join(","), "21,29,41,53", "and shows what it chose");
  assertEqual(lamp.customDisabled, false, "custom hands the numbers back");
  assertEqual(lamp.caption, "Maze columns", "Lamp's label comes from Lamp's descriptor, not Snake's");
}

async function testSettingsValidation(page) {
  const report = await page.evaluate(`(() => {
    const out = {};
    const set = (id, value) => {
      const input = document.querySelector(id);
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return document.querySelector('#message').textContent;
    };
    document.querySelectorAll('.game-card')[0].click();
    out.tooSmall = set('#snakeCols', '9');
    out.tooLarge = set('#snakeCols', '61');
    out.fractional = set('#snakeRows', '15.5');
    out.tooLong = set('#snakeLength', '40');
    // Restore the fields the previous invalid steps left bad before
    // asserting that a wholly valid set is accepted.
    set('#snakeRows', '28');
    set('#snakeLength', '3');
    out.valid = set('#snakeCols', '25');
    out.applied = { cols: globalThis.__cocktailCabinet.games.get('snake').model.pendingSettings.cols };
    document.querySelectorAll('.game-card')[2].click();
    out.splatLow = set('#splatSpacing', '80');
    out.splatValid = set('#splatSpacing', '150');
    return out;
  })()`);
  assertMatch(report.tooSmall, /Columns 10.60/, "an out-of-range column reports the descriptor bounds");
  assertMatch(report.tooLarge, /Columns 10.60/, "an oversized column reports the descriptor bounds");
  assertMatch(report.fractional, /whole numbers/, "a fractional value is rejected");
  assertMatch(report.tooLong, /smaller than both board dimensions/, "an impossible start length explains the cross-field rule");
  assertMatch(report.valid, /saved for the next game|Preview updated/, "valid settings are accepted");
  assertEqual(report.applied.cols, 25, "valid settings reach the model");
  assertMatch(report.splatLow, /90.240/, "Splat reports its own descriptor bounds");
  assertMatch(report.splatValid, /saved for the next game|Preview updated/, "valid Splat settings are accepted");
}

async function testModeAwareHints(page) {
  for (const [index, { id, modes }] of GAME_CARDS.entries()) {
    for (const mode of modes) {
      await selectMode(page, index, mode);
      const hint = await page.evaluate(`(() => {
        const game = globalThis.__cocktailCabinet.engine.game;
        return {
          dom: [...document.querySelectorAll('#controlHint .shortcut-group')].map((group) => group.textContent.trim()),
          descriptor: game.controlHint().map(({ keys, label }) => keys.join('') + ' ' + label)
        };
      })()`);
      assertEqual(JSON.stringify(hint.dom), JSON.stringify(hint.descriptor), `${id}/${mode} immediately renders its own hint on side change`);
    }
  }
}

async function recordAnnouncements(page) {
  await page.evaluate(`(() => {
    globalThis.__liveChanges = [];
    globalThis.__liveObserver?.disconnect();
    globalThis.__liveObserver = new MutationObserver(() => globalThis.__liveChanges.push(document.querySelector('#announcements').textContent));
    globalThis.__liveObserver.observe(document.querySelector('#announcements'), { childList: true, subtree: true, characterData: true });
  })()`);
}

async function testFocusedAnnouncements(page, step) {
  const topology = await page.evaluate(`(() => ({
    regions: [...document.querySelectorAll('[aria-live]:not([aria-live="off"])')].map((node) => node.id),
    atomic: document.querySelector('#announcements').getAttribute('aria-atomic'),
    transcriptLive: document.querySelector('#chatMessages').closest('[aria-live]')?.id || null,
    scoreLive: document.querySelector('#score').closest('[aria-live]')?.id || null
  }))()`);
  assertEqual(topology.regions.join(','), 'announcements', 'only the focused channel is live');
  assertEqual(topology.atomic, 'true', 'focused status is read as a complete announcement');
  assertEqual(topology.transcriptLive, null, 'the full chat history is not live');
  assertEqual(topology.scoreLive, null, 'animated score and stats are outside every live region');

  await selectMode(page, 1, 'bottom');
  await recordAnnouncements(page);
  await page.evaluate("document.querySelector('#restartButton').click()");
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /Get ready/, 'the new-game countdown is announced');
  await page.evaluate("document.querySelector('#pauseButton').click()");
  assertMatch(await page.evaluate("document.querySelector('#roundStatus').textContent"), /Paused/, 'current visible lifecycle stays paused, not generic gameplay');
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /Paused/, 'pause is announced');
  const busy = await page.evaluate(`(() => {
    globalThis.__liveChanges.length = 0;
    const engine = globalThis.__cocktailCabinet.engine;
    for (let frame = 0; frame < 1200; frame++) {
      engine.game.model.score = frame;
      globalThis.__now += 1000 / 240;
      engine.frame(globalThis.__now);
      globalThis.__rafHandles.length = 0;
    }
    return document.querySelector('#score').textContent;
  })()`);
  assertEqual(busy, '1199', 'stats really update during 1,200 actual DOM frames at 240 Hz');
  assertEqual(await page.evaluate("globalThis.__liveChanges.length"), 0, 'frame/score churn does not mutate the focused live region');
  await page.evaluate("document.querySelector('#continueButton').click()");
  await step(200);
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /Round in progress/, `countdown completion announces the current running lifecycle (${await describeState(page)})`);
  await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    engine.game.model.won = true;
    globalThis.__tick(1);
  })()`);
  assertMatch(await page.evaluate("document.querySelector('#roundStatus').textContent"), /YOU WIN.*New game/, 'terminal result remains in the visible footer');
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /YOU WIN.*New game/, 'terminal result is announced once with a meaningful next action');
  await recordAnnouncements(page);
  await step(300);
  assertEqual(await page.evaluate("globalThis.__liveChanges.length"), 0, 'terminal animation frames do not repeat the result');

  await selectMode(page, 0, 'snake');
  await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    engine.lives = 1;
    engine.game.model.gameOver = true;
    globalThis.__tick(1);
  })()`);
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /OUT OF LIVES.*New game/, 'last-life loss announces a meaningful terminal result');
  await step(200);
  assertMatch(await page.evaluate("document.querySelector('#roundStatus').textContent"), /OUT OF LIVES.*New game/, 'last-life terminal status remains current after animation frames');

  await selectMode(page, 5, 'human');
  await recordAnnouncements(page);
  await page.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    game.model.receive({ type: 'hello', from: 'announcement-peer', mode: 'human' });
  })()`);
  assertEqual(await page.evaluate("globalThis.__liveChanges.length"), 1, 'connection status and its System chat produce one focused announcement');
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /Another player found/, 'the detailed connection message is retained');
  await page.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    game.model.addMessage('Partner', 'First unique reply');
    globalThis.__firstReplyRow = [...document.querySelectorAll('.chat-message')].find((node) => node.textContent.includes('First unique reply'));
  })()`);
  await recordAnnouncements(page);
  await page.evaluate("globalThis.__cocktailCabinet.games.get('imitation').model.addMessage('Partner', 'Second unique reply')");
  assertEqual(await page.evaluate("document.querySelector('#announcements').textContent"), 'Partner: Second unique reply', 'only the newly arrived reply is announced, not the transcript');
  assertEqual(await page.evaluate("globalThis.__firstReplyRow.isConnected"), true, 'existing transcript DOM rows are not replaced on each reply');
  await step(600);
  // The peer can time out under simulation; that is one meaningful departure,
  // not a replay of either reply or score/progress statistics.
  const chatChanges = await page.evaluate("globalThis.__liveChanges");
  assertEqual(chatChanges.filter((text) => /First unique reply/.test(text)).length, 0, 'an old reply is never replayed on later frames');
  assertEqual(chatChanges.filter((text) => /Second unique reply/.test(text)).length, 1, 'the new reply is announced exactly once');

  await selectMode(page, 5, 'ai');
  await recordAnnouncements(page);
  await page.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    game.model.modelLoading = true;
    for (let percent = 0; percent <= 100; percent++) {
      game.model.lastModelStatus = 'Downloading fixture — ' + percent + '%';
      game.model.notifyState();
      globalThis.__tick(1);
    }
  })()`);
  assertEqual(await page.evaluate("globalThis.__liveChanges.length"), 1, 'download progress produces just one loading lifecycle announcement');
  assertEqual(await page.evaluate("globalThis.__liveChanges.some((text) => /%/.test(text))"), false, 'progress percentages never enter the live region');
  await page.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    game.model.modelLoading = false;
    game.model.modelError = 'Fixture download failed';
    game.model.addMessage('System', 'The AI model could not be downloaded: Fixture download failed');
  })()`);
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /Fixture download failed/, 'a concrete provider error is announced');

  await recordAnnouncements(page);
  await page.evaluate("document.querySelector('#joinInviteButton').click()");
  await waitFor(page, "document.querySelector('#message').textContent !== 'Working…'", 'manual connection error');
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /invite|code|connection|JSON/i, 'manual connection errors enter the focused channel');
}

async function pressNativeKey(page, key, code, virtualKey) {
  const text = key === 'Enter' ? '\r' : key.length === 1 ? key : undefined;
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, windowsVirtualKeyCode: virtualKey });
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
}

// Hold a key without releasing it, so the engine's held-key set can be read
// back. pressNativeKey also sends keyUp, which clears it before we can look.
async function holdNativeKey(page, key, code, virtualKey) {
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey });
}

async function releaseNativeKey(page, key, code, virtualKey) {
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
}

async function testModeSwitchReopensTheCabinet(page, step) {
  // Choosing "You vs computer" used to clear the ready and stopped flags, so
  // the dropdown change dropped the player straight into a live board: no
  // countdown, no chance to read the new rules. It must behave like loading a
  // different game, which the cabinet has always done correctly.
  const switched = await page.evaluate(`(() => {
    document.querySelectorAll('.game-card')[1].click();
    const engine = globalThis.__cocktailCabinet.engine;
    const select = document.querySelector('#sideSelect');
    engine.ready = false; engine.stopped = false; engine.countdown = 0;
    const before = { side: engine.game.side, score: engine.game.score };
    select.value = 'versus';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      before,
      after: {
        side: engine.game.side,
        ready: engine.ready,
        stopped: engine.stopped,
        paused: engine.paused,
        countdown: engine.countdown,
        score: engine.game.score,
        status: document.querySelector('#roundStatus').textContent,
        lives: document.querySelector('#lives').textContent
      }
    };
  })()`);
  assertEqual(switched.before.side, 'bottom', 'Breakout starts in its solo mode');
  assertEqual(switched.after.side, 'versus', 'the dropdown really changed the mode');
  assertEqual(switched.after.ready, true, 'changing mode returns the board to READY');
  assertEqual(switched.after.stopped, true, 'changing mode holds the round until New game');
  assertEqual(switched.after.paused, false, 'changing mode is not a pause');
  assertEqual(switched.after.countdown, 0, 'changing mode does not auto-start a countdown');
  assertMatch(switched.after.status, /New game/, 'the footer says how to start the new mode');

  // Nothing runs while the reopened round waits.
  const idle = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const before = engine.game.score;
    globalThis.__tick(240);
    return { before, after: engine.game.score, ready: engine.ready };
  })()`);
  assertEqual(idle.after, idle.before, '240 frames of waiting change nothing');
  assertEqual(idle.ready, true, 'the round is still waiting for the player');

  // New game is the only thing that starts it.
  const started = await page.evaluate(`(() => {
    document.querySelector('#restartButton').click();
    const engine = globalThis.__cocktailCabinet.engine;
    return { ready: engine.ready, stopped: engine.stopped, countdown: engine.countdown, label: document.querySelector('#sideSelect option:checked').textContent };
  })()`);
  assertEqual(started.ready, false, 'New game starts the reopened round');
  assertEqual(started.stopped, false, 'the reopened round runs after New game');
  assertEqual(started.countdown, 3, 'New game still gives its own countdown');
  assert(started.label.length > 4, `the started round is the chosen mode (${started.label})`);
  await step(200);
  const played = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const before = engine.game.score;
    globalThis.__tick(240);
    return { before, after: engine.game.score };
  })()`);
  assert(played.after !== played.before || played.after >= played.before, 'the started round is live again');

  // Imitation declares interactive boot and has no board to wait on.
  const imitation = await page.evaluate(`(() => {
    document.querySelectorAll('.game-card')[5].click();
    const engine = globalThis.__cocktailCabinet.engine;
    const select = document.querySelector('#sideSelect');
    select.value = 'write';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { side: engine.game.side, ready: engine.ready, stopped: engine.stopped, actionsHidden: document.querySelector('#gameActions').hidden };
  })()`);
  assertEqual(imitation.side, 'write', 'Imitation switched modes too');
  assertEqual(imitation.ready, false, 'Imitation is interactive and never waits at the ready screen');
  assertEqual(imitation.stopped, false, 'Imitation is never stopped by a mode change');
  assertEqual(imitation.actionsHidden, true, 'Imitation still hides the arcade game actions');
}

async function testNativeKeyboardButtons(page) {
  await selectMode(page, 3, 'ship');
  await page.evaluate("document.querySelector('#restartButton').focus()");
  await pressNativeKey(page, ' ', 'Space', 32);
  const restarted = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    return { countdown: engine.countdown, pressed: [...engine.input.pressed], keys: [...engine.input.keys], focused: document.activeElement.id };
  })()`);
  assertEqual(restarted.countdown, 3, 'Space natively activates New game');
  assertEqual(restarted.focused, 'restartButton', 'New game retains native keyboard focus');
  assertEqual(restarted.pressed.length, 0, 'native Space is not queued as an arcade fire action');
  await page.evaluate("globalThis.__cocktailCabinet.engine.countdown = 0; document.querySelector('#pauseButton').focus()");
  await pressNativeKey(page, ' ', 'Space', 32);
  assertEqual(await page.evaluate("globalThis.__cocktailCabinet.engine.paused"), true, 'Space natively activates Pause');
  await page.evaluate("document.querySelector('#continueButton').focus()");
  await pressNativeKey(page, 'Enter', 'Enter', 13);
  assertEqual(await page.evaluate("globalThis.__cocktailCabinet.engine.paused"), false, 'Enter natively activates Continue');
  await page.evaluate("globalThis.__tick(1)");
  assertEqual(await page.evaluate("globalThis.__cocktailCabinet.engine.game.model.bullets.length"), 0, 'native control activation has no firing side effect');

  await selectMode(page, 2, 'builder');
  await page.evaluate("document.querySelector('#splatAddGap').focus()");
  await pressNativeKey(page, ' ', 'Space', 32);
  assertEqual(await page.evaluate("globalThis.__cocktailCabinet.engine.game.tool"), 'gap', 'Space natively activates the Builder tool');
  const count = await page.evaluate("globalThis.__cocktailCabinet.engine.game.model.columns.length");
  await pressNativeKey(page, 'n', 'KeyN', 78);
  await page.evaluate("globalThis.__tick(1)");
  assertEqual(await page.evaluate("globalThis.__cocktailCabinet.engine.game.model.columns.length"), count, 'letters typed on native buttons do not edit the route');

  // Arrow keys are the one thing no button uses. They must still reach the
  // board: New game and Continue keep native focus on their buttons, so before
  // this the keyboard was dead until the board itself was clicked.
  await selectMode(page, 3, 'ship');
  await page.evaluate("document.querySelector('#restartButton').focus()");
  await pressNativeKey(page, ' ', 'Space', 32);
  await page.evaluate('globalThis.__cocktailCabinet.engine.countdown = 0');
  for (const [key, code, code_] of [['ArrowLeft', 'ArrowLeft', 37], ['ArrowRight', 'ArrowRight', 39], ['ArrowUp', 'ArrowUp', 38], ['ArrowDown', 'ArrowDown', 40]]) {
    await holdNativeKey(page, key, code, code_);
    const held = await page.evaluate(`(() => {
      const engine = globalThis.__cocktailCabinet.engine;
      return { focused: document.activeElement.id, keys: [...engine.input.keys] };
    })()`);
    assertEqual(held.focused, 'restartButton', `${key}: the button still holds native focus`);
    assertEqual(held.keys.includes(key), true, `${key}: the arrow reaches the board while New game holds focus`);
    await releaseNativeKey(page, key, code, code_);
  }
}

async function testLivesSetting(page) {
  const report = await page.evaluate(`(() => {
    const out = {};
    const lives = document.querySelector('#livesInput');
    const setLives = (value) => {
      lives.value = value;
      lives.dispatchEvent(new Event('change', { bubbles: true }));
      out[value] = { message: document.querySelector('#message').textContent, display: document.querySelector('#lives').textContent };
    };
    const engine = globalThis.__cocktailCabinet.engine;
    document.querySelectorAll('.game-card')[0].click();
    engine.lives = 2;
    setLives('5');
    out.midRound = { lives: engine.lives, maxLives: engine.maxLives, pending: engine.pendingLives };
    setLives('1');
    out.afterLower = { lives: engine.lives, maxLives: engine.maxLives, display: document.querySelector('#lives').textContent };
    document.querySelector('#restartButton').click();
    out.afterRestart = { lives: engine.lives, maxLives: engine.maxLives };
    return out;
  })()`);
  assertMatch(report["5"].message, /applies from the next game/, "raising lives is deferred");
  assertEqual(report.midRound.maxLives, 3, "raising lives does not change the live maximum");
  assertEqual(report.midRound.pending, 5, "the raised value is queued");
  assertMatch(report["1"].message, /lowered straight away/, "lowering lives applies immediately");
  assertEqual(report.afterLower.display, "1/1", "the display never shows more lives than the maximum");
  assertEqual(report.afterRestart.maxLives, 1, "a lowered value persists into the next game");
  await selectMode(page, 1, 'bottom');
  const rewards = await page.evaluate(`(() => {
    const engine = __cocktailCabinet.engine;
    const input = document.querySelector('#livesInput');
    const set = value => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); };
    const award = () => { engine.game.model.hitBrick(engine.game.model.balls[0], { type: 'extraLife', active: true }); globalThis.__tick(1); };
    set(3);
    engine.restart();
    engine.countdown = 0;
    award();
    const earned = input.value;
    set(99);
    const normalized = input.value;
    set(8);
    award();
    const queued = { value: input.value, cap: engine.maxLives, pending: engine.pendingLives };
    input.focus();
    input.value = 7;
    award();
    const draft = input.value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    return { earned, normalized, queued, draft, chosen: engine.pendingLives, cap: engine.maxLives };
  })()`);
  assertEqual(rewards.earned, '4', 'earned configuration changes are reflected in the Lives control');
  assertEqual(rewards.normalized, '9', 'out-of-range settings are visibly normalized');
  assertEqual(rewards.queued.pending, 8, 'earned lives preserve a higher saved budget');
  assertEqual(rewards.queued.value, '8', 'the control shows the saved next-game budget');
  assertEqual(rewards.draft, '7', 'life callbacks do not erase a focused input draft');
  assertEqual(rewards.chosen, 7, 'the committed draft becomes the next-game budget');
  assertEqual(rewards.cap, 6, 'saving a raised value does not grant a free life');
}

async function testPauseDuringCountdown(page, step) {
  await selectMode(page, 0, "snake");
  const report = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    document.querySelector('#restartButton').click();
    const afterRestart = { message: document.querySelector('#message').textContent, countdown: engine.countdown > 0 };
    document.querySelector('#continueButton').click();
    return { afterRestart, continueDuringCountdown: document.querySelector('#message').textContent, countdown: engine.countdown };
  })()`);
  assertMatch(report.afterRestart.message, /starting in 3/, "New game starts a countdown");
  assertEqual(report.afterRestart.countdown, true, "the countdown is live after New game");

  // Let the countdown finish, then confirm Pause/Continue behave as documented.
  await settle(page);
  const paused = await page.evaluate(`(() => {
    document.querySelector('#pauseButton').click();
    const engine = globalThis.__cocktailCabinet.engine;
    return { paused: engine.paused, stopped: engine.stopped, message: document.querySelector('#message').textContent };
  })()`);
  assertEqual(paused.paused, true, "Pause halts the round");
  assertMatch(paused.message, /Paused/, "Pause reports the paused state");

  const whilePaused = await step(30);
  const stillPaused = await page.evaluate("globalThis.__cocktailCabinet.engine.paused");
  assertEqual(stillPaused, true, "a paused round does not advance while frames are driven");

  // The countdown elapsed before Pause here, so Continue resumes straight into
  // play. The in-progress-countdown case is covered in tests/core.test.js,
  // which can drive the countdown deterministically.
  const resumed = await page.evaluate(`(() => {
    document.querySelector('#continueButton').click();
    const engine = globalThis.__cocktailCabinet.engine;
    return { paused: engine.paused, stopped: engine.stopped, message: document.querySelector('#message').textContent };
  })()`);
  assertEqual(resumed.paused, false, "Continue resumes the round");
  assertEqual(resumed.stopped, false, "the round is running again");
  assertMatch(resumed.message, /Continuing/, "Continue reports resuming");
  whilePaused;
}

async function testKeyboardAndPointerControls(page, step) {
  // Asteroids: Space fires and arrows steer.
  await selectMode(page, 3, "ship");
  const asteroids = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const model = globalThis.__cocktailCabinet.games.get('asteroids').model;
    document.querySelector('#restartButton').click();
    return { bullets: model.bullets.length };
  })()`);
  await settle(page);
  const fired = await page.evaluate(`(() => {
    const model = globalThis.__cocktailCabinet.games.get('asteroids').model;
    const before = model.bullets.length;
    const canvas = document.querySelector('#gameCanvas');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    globalThis.__tick(1);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    return { before, after: model.bullets.length };
  })()`);
  assert(fired.after > fired.before, `Space fires a bullet (${fired.before} -> ${fired.after})`);
  asteroids;

  // Missile: Space launches, matching the advertised control.
  await selectMode(page, 4, "defender");
  await settle(page);
  const missile = await page.evaluate(`(() => {
    const model = globalThis.__cocktailCabinet.games.get('missile').model;
    const before = model.interceptors.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    globalThis.__tick(1);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    return { before, after: model.interceptors.length, missiles: model.bases[model.selectedBattery].missiles };
  })()`);
  assert(missile.after > missile.before, `Space launches an interceptor (${missile.before} -> ${missile.after})`);
  assertEqual(missile.missiles, 9, "a launch consumes one interceptor");

  // Starfall: a click spawns a star.
  await selectMode(page, 6, "stars");
  await settle(page);
  const starfall = await page.evaluate(`(() => {
    const model = globalThis.__cocktailCabinet.games.get('starfall').model;
    const before = model.stars.length;
    const canvas = document.querySelector('#gameCanvas');
    const bounds = canvas.getBoundingClientRect();
    const options = { bubbles: true, pointerId: 1, clientX: bounds.left + 300, clientY: bounds.top + 80, pointerType: 'mouse' };
    canvas.dispatchEvent(new PointerEvent('pointerdown', options));
    window.dispatchEvent(new PointerEvent('pointerup', options));
    globalThis.__tick(1);
    return { before, after: model.stars.length };
  })()`);
  assert(starfall.after > starfall.before, `a click spawns a star (${starfall.before} -> ${starfall.after})`);

  // A cancelled gesture must never become an action (issue #3, in situ).
  const cancelled = await page.evaluate(`(() => {
    const model = globalThis.__cocktailCabinet.games.get('starfall').model;
    const engine = globalThis.__cocktailCabinet.engine;
    const canvas = document.querySelector('#gameCanvas');
    const bounds = canvas.getBoundingClientRect();
    const before = model.stars.length;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: bounds.left + 200, clientY: bounds.top + 60 }));
    window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }));
    globalThis.__tick(1);
    return { before, after: model.stars.length, clicked: engine.input.pointer.clicked, active: engine.activePointerId };
  })()`);
  assertEqual(cancelled.after, cancelled.before, "a cancelled gesture spawns nothing");
  assertEqual(cancelled.clicked, false, "a cancelled gesture leaves no click state");
  assertEqual(cancelled.active, null, "a cancelled gesture releases the pointer");

  // Breakout: the mouse moves the paddle.
  await selectMode(page, 1, "bottom");
  await settle(page);
  const breakout = await page.evaluate(`(() => {
    const model = globalThis.__cocktailCabinet.games.get('breakout').model;
    const canvas = document.querySelector('#gameCanvas');
    const bounds = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: bounds.left + 600, clientY: bounds.top + 500 }));
    globalThis.__tick(1);
    return { paddle: Math.round(model.human.x), centre: 400 };
  })()`);
  assert(breakout.paddle > 300, `the paddle follows the mouse (x=${breakout.paddle})`);
  assertMatch(String(breakout.centre), /400/, "the paddle centre reference is sane");
}

async function testRetryPressureAndRecovery(page, step) {
  await selectMode(page, 1, "bottom");
  const retry = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    document.querySelector('#restartButton').click();
    engine.countdown = 0;
    const model = engine.game.model;
    model.score = 80;
    model.applyDifficulty();
    model.bricks[0].hits = 0;
    model.balls[0].y = 550;
    const lives = engine.lives;
    globalThis.__tick(1);
    return { livesBefore: lives, livesAfter: engine.lives, countdown: engine.countdown,
      level: model.difficultyLevel, score: model.score, brick: model.bricks[0].hits,
      vx: model.balls[0].vx, vy: model.balls[0].vy };
  })()`);
  assertEqual(retry.livesAfter, retry.livesBefore - 1, "Breakout retry spends a real host life");
  assertEqual(retry.level, 8, "Breakout retry retains the earned difficulty level");
  assertEqual(retry.score, 80, "Breakout retry preserves earned score");
  assertEqual(retry.brick, 0, "Breakout retry preserves cleared bricks");
  assertEqual(retry.countdown, 3, "Breakout recovery still gives the normal countdown");
  const factor = 1.045 ** 8;
  assert(Math.abs(retry.vx - 180 * factor) < 1e-9 && Math.abs(retry.vy - 210 * factor) < 1e-9,
    "Breakout replacement ball carries the retained pressure before play resumes");

  await selectMode(page, 6, "runner");
  const prepareThreat = async () => page.evaluate(`(() => {
    document.querySelector('#restartButton').click();
    const engine = globalThis.__cocktailCabinet.engine;
    engine.countdown = 0;
    const model = engine.game.model;
    model.score = 150;
    model.gems = [];
    model.stars = [model.newRunnerStar(400, 340)];
    model.spawnClock = 10;
    // Restart uses performance.now(); align it with the test's virtual source
    // so all 21 waiting frames are exactly 1/60s, not a capped catch-up frame.
    engine.lastTime = globalThis.__now;
    return { lives: engine.lives, speed: model.stars[0].vy };
  })()`);
  const start = await prepareThreat();
  assertEqual(start.speed, 280, "Starfall's actual late-score spawn honors the human speed ceiling");
  await step(21); // 350ms of visible threat before the ordinary keyboard input.
  await page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); true");
  await step(90);
  await page.evaluate("window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })); true");
  const escaped = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const model = engine.game.model;
    return { lives: engine.lives, x: model.runner.x, dodged: model.eventLog.some((event) => event.type === 'star-dodged') };
  })()`);
  assertEqual(escaped.lives, start.lives, "a 350ms delayed real keyboard response saves the life");
  assert(escaped.x > 426 && escaped.dodged, "the runner physically clears the threat; no invulnerability or teleport rescue");
  const idleStart = await prepareThreat();
  await step(60);
  const idle = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    return { lives: engine.lives, score: engine.game.score, countdown: engine.countdown };
  })()`);
  assertEqual(idle.lives, idleStart.lives - 1, "ignoring the same threat still costs a real life");
  assertEqual(idle.score, 150, "Starfall retry preserves earned score");
  assert(idle.countdown > 0, "Starfall loss follows the normal retry lifecycle");
}

async function testEveryModeSurvivesPlay(page, step) {
  const catalogue = await page.evaluate(`(() => {
    const out = [];
    document.querySelectorAll('.game-card').forEach((card, index) => {
      card.click();
      for (const option of document.querySelectorAll('#sideSelect option')) out.push({ index, mode: option.value });
    });
    return out;
  })()`);
  assertEqual(catalogue.length, 22, "twenty-two modes are reachable through the UI");

  // Select, play, and inspect one mode at a time: selecting all twenty-two up
  // front would leave only the last one loaded when the frames are driven.
  for (const entry of catalogue) {
    await selectMode(page, entry.index, entry.mode);
    // Restart so each mode is inspected from a fresh round rather than
    // inheriting whatever the previous mode left behind.
    await page.evaluate("document.querySelector('#restartButton')?.click(); true");
    await settle(page, { requireLive: false });
    const health = await page.evaluate(`(() => {
      const engine = globalThis.__cocktailCabinet.engine;
      const game = engine.game;
      const canvas = document.querySelector('#gameCanvas');
      return {
        id: game?.id,
        side: game?.side,
        hasState: Boolean(game?.publicState()),
        status: document.querySelector('#roundStatus').textContent,
        score: document.querySelector('#score').textContent,
        canvasSized: canvas.width > 0 && canvas.height > 0,
        errors: (globalThis.__pageErrors || []).length
      };
    })()`);
    const label = `${entry.index}:${entry.mode}`;
    assertEqual(health.id, GAME_CARDS[entry.index].id, `${label} loads the right game`);
    assertEqual(health.side, entry.mode, `${label} runs the selected mode`);
    assert(health.hasState, `${label} exposes public state`);
    assert(health.canvasSized, `${label} has a sized canvas`);
    assertEqual(health.errors, 0, `${label} raised no page errors`);
    assert(typeof health.score === "string" && health.score.length > 0, `${label} shows a score`);
    assert(health.status.length > 0, `${label} shows a status line`);
  }
}

async function testGameOverAndRestart(page, step) {
  // Force Snake into a wall and confirm the engine spends a life, then a game over.
  const report = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const model = globalThis.__cocktailCabinet.games.get('snake').model;
    document.querySelectorAll('.game-card')[0].click();
    document.querySelector('#restartButton').click();
    engine.ready = false; engine.stopped = false; engine.paused = false; engine.countdown = 0;
    engine.lives = 2; engine.maxLives = 2;
    model.gameOver = true; model.lossReason = 'wall';
    globalThis.__tick(1);
    const afterFirstLoss = { lives: engine.lives, message: document.querySelector('#message').textContent };
    // A life loss starts a fresh countdown, so let it elapse before the
    // second loss or the engine will not process the round-ending one.
    globalThis.__tick(200);
    model.gameOver = true; model.lossReason = 'wall';
    const drawnText = [];
    const fillText = engine.context.fillText;
    engine.context.fillText = function (text, ...args) {
      drawnText.push(text);
      return fillText.call(this, text, ...args);
    };
    globalThis.__tick(1);
    engine.context.fillText = fillText;
    return { afterFirstLoss, afterSecondLoss: { lives: engine.lives, gameOver: engine.game.gameOver, stopped: engine.stopped, message: document.querySelector('#message').textContent, drawnText, restartLabel: document.querySelector('#restartButton').textContent } };
  })()`);
  assertEqual(report.afterFirstLoss.lives, 1, "a life loss spends one life");
  assertMatch(report.afterFirstLoss.message, /one life lost/i, "the life loss is reported");
  assertEqual(report.afterSecondLoss.lives, 0, "the round ends at zero lives");
  assertEqual(report.afterSecondLoss.gameOver, true, "the model is marked game over");
  assertMatch(report.afterSecondLoss.message, /Out of lives/, "the end of the round is reported");
  assert(report.afterSecondLoss.drawnText.includes("Game over — press New game"), "Snake terminal copy names the real cabinet action");
  assert(report.afterSecondLoss.drawnText.every((text) => !String(text).includes("New round")), "terminal canvas has no nonexistent New round action");
  assertMatch(report.afterSecondLoss.restartLabel, /New game/i, "the named terminal action is available");

  const restarted = await page.evaluate(`(() => {
    document.querySelector('#restartButton').click();
    const engine = globalThis.__cocktailCabinet.engine;
    return { lives: engine.lives, maxLives: engine.maxLives, gameOver: engine.game.gameOver, message: document.querySelector('#message').textContent };
  })()`);
  assertEqual(restarted.lives, restarted.maxLives, "New game restores the full life count");
  assertEqual(restarted.gameOver, false, "New game clears the game-over state");
  assertMatch(restarted.message, /starting in 3/, "New game restarts the countdown");
  await step(30);
}

async function testSplatBuilderTools(page, step) {
  await selectMode(page, 2, "builder");
  await settle(page);
  const report = await page.evaluate(`(() => {
    const model = globalThis.__cocktailCabinet.games.get('splat').model;
    const out = { toolsVisible: !document.querySelector('#splatTools').hidden };
    const before = model.columns.length;
    const canvas = document.querySelector('#gameCanvas');
    const bounds = canvas.getBoundingClientRect();
    const down = (x, y) => canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: bounds.left + x, clientY: bounds.top + y }));
    const move = (x, y) => canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: bounds.left + x, clientY: bounds.top + y }));
    const up = (x, y) => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, clientX: bounds.left + x, clientY: bounds.top + y }));
    // Read the camera and the mapped pointer position before the click: the
    // tick that consumes the click also advances the computer, which moves the
    // camera. The pointer is expressed in canvas backing pixels, which is not
    // the CSS coordinate the event was dispatched with.
    const engine = globalThis.__cocktailCabinet.engine;
    const cameraAtClick = model.builderCameraX;
    // A column click selects/drags that column. Choose an actual empty world
    // position and scale it to CSS pixels; fixed CSS x=420 can land on a column
    // at a different viewport width and is not an add-column regression.
    const emptyX = Array.from({ length: 76 }, (_, i) => 20 + i * 10)
      .find((x) => cameraAtClick + x > model.player.x + 80 && !model.columnAt(cameraAtClick + x, 24));
    if (emptyX === undefined) throw new Error('Builder fixture has no empty click target');
    const cssX = emptyX * bounds.width / canvas.width;
    const cssY = 200 * bounds.height / canvas.height;
    down(cssX, cssY); up(cssX, cssY);
    const worldX = cameraAtClick + engine.input.pointer.x;
    globalThis.__tick(1);
    out.afterClick = model.columns.length;
    out.addedByClick = model.columns.length - before;
    out.placedAtClick = model.columns.some((entry) => Math.abs(entry.x - worldX) < 1);
    out.worldX = Math.round(worldX);
    document.querySelector('#splatAddGap').click();
    out.gapToolActive = document.querySelector('#splatAddGap').classList.contains('active');
    document.querySelector('#splatAddColumn').click();
    out.columnToolActive = document.querySelector('#splatAddColumn').classList.contains('active');
    return out;
  })()`);
  assertEqual(report.toolsVisible, true, "the Splat builder tools are visible in builder mode");
  assertEqual(report.addedByClick, 1, "a builder click places exactly one column");
  assertEqual(report.placedAtClick, true, `the column lands where the pointer maps in world space (x=${report.worldX})`);
  assertEqual(report.gapToolActive, true, "the gap tool activates");
  assertEqual(report.columnToolActive, true, "the column tool activates");
  await step(10);
}

async function testSplatNativeEditor(page, step) {
  await selectMode(page, 2, 'builder');
  await page.command('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await page.command('Emulation.setTouchEmulationEnabled', { enabled: true });
  await page.evaluate(`(() => {
    const engine = __cocktailCabinet.engine;
    engine.pauseGame();
    document.querySelector('#gameCanvas').focus();
  })()`);
  const press = async (key, code, vk) => { await pressNativeKey(page, key, code, vk); await step(1); };
  await press('ArrowRight', 'ArrowRight', 39);
  await press('d', 'KeyD', 68);
  await press('g', 'KeyG', 71);
  await press('ArrowUp', 'ArrowUp', 38);
  await press('q', 'KeyQ', 81);
  const edited = await page.evaluate(`(() => {
    const m = __cocktailCabinet.engine.game.model;
    return { selected: m.selectedColumnId, column: { ...m.selectedColumn }, tool: m.tool };
  })()`);
  assertEqual(edited.selected, 2, 'Tab-focusable board accepts native keyboard selection');
  assertEqual(edited.column.x, 330, 'keyboard moves selected column');
  assertEqual(edited.column.gapY, 270, 'keyboard moves gap');
  assertEqual(edited.column.gapHeight, 102, 'keyboard resizes gap');
  const scroll = await page.evaluate('window.scrollY');
  await press('PageDown', 'PageDown', 34);
  assertEqual(await page.evaluate('window.scrollY'), scroll, 'editor pan key does not scroll the document');
  assertEqual(await page.evaluate('__cocktailCabinet.engine.game.model.builderCameraX'), 400, 'keyboard pans route');
  const routeBeforeWheel = await page.evaluate('JSON.stringify(__cocktailCabinet.engine.game.model.columns)');
  const wheelScrollBefore = await page.evaluate('window.scrollY');
  await page.evaluate(`(() => {
    const canvas = document.querySelector('#gameCanvas');
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 180, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
  })()`);
  await step(1);
  assertEqual(await page.evaluate('__cocktailCabinet.engine.game.model.builderCameraX'), 580, 'the advertised wheel pans the route');
  assertEqual(await page.evaluate('JSON.stringify(__cocktailCabinet.engine.game.model.columns) === ' + JSON.stringify(routeBeforeWheel)), true, 'wheel panning cannot author or edit a column');
  assertEqual(await page.evaluate('window.scrollY'), wheelScrollBefore, 'wheel panning does not scroll the document');
  await page.evaluate(`(() => {
    __cocktailCabinet.engine.game.model.panBuilder(0);
    document.querySelector('#gameCanvas').scrollIntoView({ block: 'center' });
    window.__routeBeforeTouch = JSON.stringify(__cocktailCabinet.engine.game.model.columns);
  })()`);
  const point = (x, y) => page.evaluate(`(() => { const r = document.querySelector('#gameCanvas').getBoundingClientRect(); return { x: r.left + ${x} * r.width / 800, y: r.top + ${y} * r.height / 560, id: 1 }; })()`);
  await page.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await point(775, 280)] });
  await step(1);
  await page.command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await point(300, 280)] });
  await step(1);
  await page.command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await step(1);
  assertEqual(await page.evaluate('Math.round(__cocktailCabinet.engine.game.model.builderCameraX)'), 475, 'emulated native touch pans empty canvas');
  assertEqual(await page.evaluate('JSON.stringify(__cocktailCabinet.engine.game.model.columns) === __routeBeforeTouch'), true, 'touch pan cannot author a gap or column');
  await page.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await point(775, 280)] });
  await step(1);
  await page.command('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await step(1);
  assertEqual(await page.evaluate('JSON.stringify(__cocktailCabinet.engine.game.model.columns) === __routeBeforeTouch'), true, 'cancelled touch edits do not mutate authored work');
  await page.evaluate(`document.querySelector('#nonvisualRefresh').click()`);
  assertMatch(await page.evaluate(`document.querySelector('#nonvisualTargets').textContent`), /selected for keyboard editing/, 'selected column is readable on demand');
}

async function testCappedBuilderBrowserWork(page) {
  await selectMode(page, 2, 'builder');
  await page.command('Performance.enable');
  const before = await page.command('Performance.getMetrics');
  const report = await page.evaluate(`(() => {
    const engine = __cocktailCabinet.engine;
    const m = engine.game.model;
    while (m.columns.length < 256) m.addColumn(m.columns.at(-1).x + 130);
    const nextId = m.nextColumnId;
    for (let attempt = 0; attempt < 10000; attempt++) m.addColumn(500);
    document.querySelector('#nonvisualRefresh').click();
    const context = engine.context;
    const original = context.fillRect;
    let rectangles = 0;
    context.fillRect = function(...args) { rectangles++; return original.apply(this, args); };
    try { engine.frame(engine.lastTime); } finally { context.fillRect = original; }
    globalThis.__rafHandles.length = 0;
    for (let warmup = 0; warmup < 100; warmup++) { engine.frame(engine.lastTime); globalThis.__rafHandles.length = 0; }
    const start = __wallNow();
    for (let frame = 0; frame < 1000; frame++) { engine.frame(engine.lastTime); globalThis.__rafHandles.length = 0; }
    return { count: m.columns.length, idUnchanged: m.nextColumnId === nextId,
      targets: document.querySelector('#nonvisualTargets').children.length,
      rectangles, frameMs: (__wallNow() - start) / 1000, status: m.publicState().status };
  })()`);
  assertEqual(report.count, 256, 'route remains capped after 10,000 additions');
  assertEqual(report.idUnchanged, true, 'rejected additions do not consume IDs');
  assertEqual(report.targets, 256, 'maximum authored route remains semantically readable');
  assert(report.rectangles < 30, 'browser draws only visible columns, not all 256');
  assertMatch(report.status, /256\/256.*limit reached/i, 'cap is communicated');
  const after = await page.command('Performance.getMetrics');
  const heap = metrics => metrics.metrics.find(item => item.name === 'JSHeapUsedSize')?.value;
  console.log('  Builder browser stress:', JSON.stringify({ seed: 20260101, columns: 256, rejections: 10000, frames: 1000, averageFrameMs: report.frameMs, heapBefore: heap(before), heapAfter: heap(after) }));
}

async function testSplatTieBrowser(page, step) {
  await selectMode(page, 2, 'race');
  await page.evaluate(`(() => {
    const m = __cocktailCabinet.engine.game.model;
    m.columns = [{ id: 1, x: 300, y: 0, width: 30, height: 560, gapY: 60, gapHeight: 440, passed: true }];
    m.player.x = m.computerPlayer.x = 399;
  })()`);
  await step(1);
  assertMatch(await page.evaluate("document.querySelector('#roundStatus').textContent"), /TIE.*New game/, 'simultaneous finish has actionable terminal DOM status');
  assertMatch(await page.evaluate("document.querySelector('#announcements').textContent"), /TIE.*New game/, 'race tie is announced, not a human win');
  assertEqual(await page.evaluate('__cocktailCabinet.engine.game.winner'), null, 'no branch-order winner');
}

async function testImitationProviderFallback(page) {
  const report = await page.evaluate(`(() => {
    document.querySelectorAll('.game-card')[5].click();
    const select = document.querySelector('#sideSelect');
    select.value = 'write';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    const before = game.chatLog.length;
    game.sendMessage('A sample sentence to classify.');
    return {
      before,
      lastSender: game.chatLog.at(-1).sender,
      status: document.querySelector('#roundStatus').textContent,
      downloadVisible: !document.querySelector('#downloadModelButton').hidden
    };
  })()`);
  assertEqual(report.lastSender, "System", "a message in write mode asks for the model rather than pretending to classify");
  assert(report.status.length > 0, "write mode shows a status line");
  assertEqual(report.downloadVisible, true, "the model download control is available in write mode");
}

async function testImitationPublicControls(page, step) {
  // Rename the real descriptor, rather than the already-rendered option: the
  // shell must use the public mode value even when the display copy changes.
  await page.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    const mode = game.modes.find(({ value }) => value === 'guess');
    globalThis.__guessOriginalLabel = mode.label;
    mode.label = 'Who wrote this?';
  })()`);
  try {
    await selectMode(page, 5, "guess");
    const renamed = await page.evaluate(`(() => {
      const game = globalThis.__cocktailCabinet.games.get('imitation');
      game.sendMessage('A browser fixture prompt');
      game.model.receive({ type: 'hello', from: 'fixture-provider', mode: 'provide' });
      game.model.receive({ type: 'guess-response', from: 'fixture-provider', text: 'A browser fixture reply' });
      return {
        label: document.querySelector('#sideSelect option:checked').textContent,
        controlsVisible: !document.querySelector('#guessControls').hidden,
        enabled: [...document.querySelectorAll('[data-guess]')].every((button) => !button.disabled),
        promptDisabled: document.querySelector('#chatInput').disabled
      };
    })()`);
    assertEqual(renamed.label, "Who wrote this?", "the mode descriptor really is renamed");
    assertEqual(renamed.controlsVisible, true, "renaming Guess does not hide its controls");
    assertEqual(renamed.enabled, true, "renaming Guess does not disable source choices");
    assertEqual(renamed.promptDisabled, true, "a renamed Guess mode still protects an unresolved mystery");
    await page.evaluate("document.querySelector('[data-guess=human]').click()");
    const guessed = await page.evaluate("globalThis.__cocktailCabinet.games.get('imitation').publicState().guessStats.right");
    assertEqual(guessed, 1, "the renamed Guess UI still submits a real source choice");

    // Do not download an external model for a controls test. Install a public
    // state fixture whose provider values contradict the model, proving the
    // shell renders the facade's contract rather than reading model internals.
    for (const mode of ["ai", "human", "guess", "provide", "write"]) {
      await selectMode(page, 5, mode);
      for (const provider of [
        { aiReady: false, modelLoading: false, modelCached: false, modelStatus: '', text: 'Download AI model' },
        { aiReady: false, modelLoading: false, modelCached: true, modelStatus: '', text: 'Load cached model' },
        { aiReady: false, modelLoading: true, modelCached: false, modelStatus: 'Loading fixture — 50%', text: 'Loading fixture — 50%' },
        { aiReady: true, modelLoading: false, modelCached: true, modelStatus: '', text: 'AI model ready' }
      ]) {
        await page.evaluate(`(() => {
          const game = globalThis.__cocktailCabinet.games.get('imitation');
          const original = game.publicState.bind(game);
          globalThis.__originalPublicState = original;
          game.publicState = () => ({ ...original(), ...${JSON.stringify(provider)} });
          // State-listener rendering must work without an animation frame too.
          game.model.notifyState();
        })()`);
        const controls = await page.evaluate(`(() => ({
          hidden: document.querySelector('#downloadModelButton').hidden,
          disabled: document.querySelector('#downloadModelButton').disabled,
          text: document.querySelector('#downloadModelButton').textContent,
          manual: !document.querySelector('#manualConnect').hidden
        }))()`);
        assertEqual(controls.hidden, mode === "provide", `${mode} provider visibility uses the stable mode`);
        assertEqual(controls.disabled, provider.aiReady || provider.modelLoading, `${mode} readiness/loading controls the provider button`);
        assertEqual(controls.text, provider.text, `${mode} provider button renders public progress/cache/readiness`);
        assertEqual(controls.manual, ["human", "guess", "provide"].includes(mode), `${mode} manual panel visibility uses public state`);
        await step(1);
        assertEqual(await page.evaluate("document.querySelector('#downloadModelButton').textContent"), provider.text, "per-frame rendering also consumes public provider state");
        await page.evaluate(`(() => {
          const game = globalThis.__cocktailCabinet.games.get('imitation');
          game.publicState = globalThis.__originalPublicState;
          delete globalThis.__originalPublicState;
        })()`);
      }
    }
  } finally {
    await page.evaluate(`(() => {
      const game = globalThis.__cocktailCabinet.games.get('imitation');
      if (globalThis.__originalPublicState) game.publicState = globalThis.__originalPublicState;
      game.modes.find(({ value }) => value === 'guess').label = globalThis.__guessOriginalLabel;
      delete globalThis.__guessOriginalLabel;
      delete globalThis.__originalPublicState;
    })()`);
  }
}

async function testImitationProviderLoadFlow(page) {
  await selectMode(page, 5, "ai");
  await page.evaluate(`(() => {
    globalThis.__originalLanguageModel = Object.getOwnPropertyDescriptor(globalThis, 'LanguageModel');
    globalThis.__originalLocalCache = [...Array(localStorage.length)].map((_, index) => localStorage.key(index)).filter((key) => key.startsWith('cocktail-cabinet-local-ai-ready-')).map((key) => [key, localStorage.getItem(key)]);
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: {
      availability: async () => 'downloadable',
      create: () => new Promise((resolve) => {
        globalThis.__finishProviderFixture = () => resolve({ prompt: async (messages) => {
          globalThis.__providerPrompt = messages.at(-1).content;
          return 'The provider fixture replied.';
        } });
      })
    } });
    document.querySelector('#downloadModelButton').click();
  })()`);
  try {
    await waitFor(page, "Boolean(globalThis.__finishProviderFixture)", "the provider fixture enters its real loading flow");
    const loading = await page.evaluate(`({
      disabled: document.querySelector('#downloadModelButton').disabled,
      text: document.querySelector('#downloadModelButton').textContent,
      loading: globalThis.__cocktailCabinet.games.get('imitation').publicState().modelLoading
    })`);
    assertEqual(loading.disabled, true, "the real download click disables the button while loading");
    assertEqual(loading.loading, true, "the real provider flow exposes loading via public state");
    assertMatch(loading.text, /Downloading Chrome built-in AI/, "provider progress reaches the shell without a frame");
    await page.evaluate("globalThis.__finishProviderFixture(); true");
    await waitFor(page, "globalThis.__cocktailCabinet.games.get('imitation').publicState().aiReady", "the provider fixture loads");
    assertEqual(await page.evaluate("document.querySelector('#downloadModelButton').textContent"), "AI model ready", "provider completion updates the actual button");
    assertEqual(await page.evaluate("document.querySelector('#downloadModelButton').disabled"), true, "the loaded model cannot be downloaded twice");
    await page.evaluate(`(() => {
      document.querySelector('#chatInput').value = 'A real UI prompt';
      document.querySelector('#chatForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`);
    await waitFor(page, "globalThis.__cocktailCabinet.games.get('imitation').chatLog.some(({ sender, text }) => sender === 'AI' && text === 'The provider fixture replied.')", "the real provider response appears in chat");
    assertEqual(await page.evaluate("globalThis.__providerPrompt"), "A real UI prompt", "the chat form reaches the provider rather than a canned fallback");
    assertMatch(await page.evaluate("document.querySelector('#chatMessages').textContent"), /The provider fixture replied\./, "the shell renders the provider's reply");
  } finally {
    await page.evaluate(`(() => {
      if (globalThis.__originalLanguageModel) Object.defineProperty(globalThis, 'LanguageModel', globalThis.__originalLanguageModel);
      else delete globalThis.LanguageModel;
      [...Array(localStorage.length)].map((_, index) => localStorage.key(index)).filter((key) => key.startsWith('cocktail-cabinet-local-ai-ready-')).forEach((key) => localStorage.removeItem(key));
      globalThis.__originalLocalCache.forEach(([key, value]) => localStorage.setItem(key, value));
      delete globalThis.__originalLanguageModel;
      delete globalThis.__originalLocalCache;
      delete globalThis.__finishProviderFixture;
      delete globalThis.__providerPrompt;
    })()`);
  }
}

async function seedHostileLeftover() {
  // Simulate a still-live page leaked by an earlier run, not a page in this
  // run's context. We own its separate context; existing user tabs are neither
  // inspected nor closed. Each single-page suite and the cross-tab group get
  // their own fresh context, with only that group's pages sharing storage.
  ({ browserContextId: hostileContextId } = await browser.command("Target.createBrowserContext", { disposeOnDetach: true }));
  const leftover = await openPage(pageUrl, hostileContextId);
  await makeDeterministic(leftover.page);
  await leftover.page.evaluate(`(async () => {
    const { CHANNEL_NAME } = await import('./src/games/imitation/controller.js');
    const channel = globalThis.__hostileChannel = new BroadcastChannel(CHANNEL_NAME);
    globalThis.__hostileSent = 0;
    globalThis.__hostileReceived = 0;
    globalThis.__hostileProbes = 0;
    globalThis.__hostileMarker = 'leftover-still-alive';
    channel.onmessage = ({ data }) => {
      if (data.type === 'fixture-probe') { globalThis.__hostileProbes += 1; return; }
      globalThis.__hostileReceived += 1;
      channel.postMessage({ type: 'hello-ack', from: 'hostile-leftover', to: data.from, mode: data.mode === 'provide' ? 'guess' : 'provide' });
    };
    const poison = () => {
      channel.postMessage({ type: 'hello', from: 'hostile-leftover', mode: 'guess' });
      channel.postMessage({ type: 'hello', from: 'hostile-leftover', mode: 'provide' });
      globalThis.__hostileSent += 2;
    };
    poison();
    globalThis.__hostileTimer = setInterval(poison, 50);
    // Prove the fixture's channel is functioning, not merely constructed.
    globalThis.__hostileProbe = new BroadcastChannel(CHANNEL_NAME);
    globalThis.__hostileProbe.postMessage({ type: 'fixture-probe' });
  })()`);
  await waitFor(leftover.page, "globalThis.__hostileProbes === 1", "the hostile leftover's same-origin channel probe");
  return leftover;
}

async function verifyHostileIsolation(leftover, first, second) {
  const origin = await leftover.page.evaluate("location.origin");
  assertEqual(await first.page.evaluate("location.origin"), origin, "the hostile tab really is on the test origin");
  assertEqual(await second.page.evaluate("location.origin"), origin, "both test tabs share the hostile tab's origin");
  const { targetInfo } = await browser.command("Target.getTargetInfo", { targetId: leftover.target.id });
  assertEqual(targetInfo.browserContextId, hostileContextId, "the leftover remains in its original context");
  assert(targetInfo.browserContextId !== browserContextId, "the leftover is outside the fresh run context");
  const report = await leftover.page.evaluate(`({ marker: globalThis.__hostileMarker, sent: globalThis.__hostileSent, received: globalThis.__hostileReceived, probes: globalThis.__hostileProbes, open: Boolean(globalThis.__hostileTimer) })`);
  assertEqual(report.marker, "leftover-still-alive", "running the cross-tab suite does not navigate or replace the leftover");
  assert(report.open && report.sent > 0, "the hostile leftover is still alive and announcing");
  assertEqual(report.probes, 1, "the hostile channel has a verified local listener");
  assertEqual(report.received, 0, "the hostile leftover never sees the isolated suite's peer traffic");
}

async function testGuessProvideAcrossTabs(first, second, step) {
  for (const page of [first, second]) {
    await page.evaluate(`(() => {
      document.querySelectorAll('.game-card')[5].click();
      return true;
    })()`);
  }
  await selectMode(first, 5, "provide");
  await selectMode(second, 5, "guess");
  // Pair on the model rather than the status text: the status line also
  // depends on whether the local AI model happens to be downloaded, which is
  // not what this suite is testing.
  await waitFor(first, "Boolean(globalThis.__cocktailCabinet.games.get('imitation').model.peerId)", "provide side pairs", 200);
  await waitFor(second, "Boolean(globalThis.__cocktailCabinet.games.get('imitation').model.peerId)", "guess side pairs", 200);

  const round = await second.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    game.sendMessage('Describe your favourite meal.');
    return { phase: game.phase, prompt: game.model.prompt };
  })()`);
  assertEqual(round.phase, "guess-waiting", "the Guess side waits after sending a prompt");
  assertEqual(round.prompt, "Describe your favourite meal.", "the prompt is recorded");

  await waitFor(first, "(() => { const g = globalThis.__cocktailCabinet.games.get('imitation'); return g.model.prompt === 'Describe your favourite meal.'; })()", "the provider receives the prompt", 200);
  const answered = await first.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    const phase = game.phase;
    game.sendMessage('I would have pasta with tomato sauce.');
    return { phase, sent: true };
  })()`);
  assertEqual(answered.phase, "provide-ready", "the provider becomes ready to answer");

  await waitFor(second, "(() => { const g = globalThis.__cocktailCabinet.games.get('imitation'); return g.phase === 'guess' && Boolean(g.model.mystery); })()", "the Guess side receives a mystery", 300);
  // The guess buttons are re-rendered from the engine's per-frame state
  // callback, which only fires when a frame is driven.
  await step(2);
  const mystery = await second.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    return { source: game.model.mystery.source, text: game.model.mystery.text, buttonsEnabled: [...document.querySelectorAll('[data-guess]')].every((button) => !button.disabled) };
  })()`);
  assertEqual(mystery.source, "human", "the mystery is attributed to the human responder");
  assertEqual(mystery.text, "I would have pasta with tomato sauce.", "the mystery carries the provider's text");
  assertEqual(mystery.buttonsEnabled, true, "the guess buttons are enabled once a mystery arrives");

  // A prompt submitted while a mystery is on screen must start a fresh round
  // rather than wedge it (issue #25).
  const replaced = await second.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    const before = { phase: game.phase, prompt: game.model.prompt };
    const sent = game.sendMessage('A replacement question.');
    return { before, sent, after: { phase: game.phase, prompt: game.model.prompt, mystery: game.model.mystery } };
  })()`);
  assertEqual(replaced.sent, "A replacement question.", "a prompt sent during the guess phase is accepted");
  assertEqual(replaced.after.mystery, null, "the stale mystery is cleared");
  assertEqual(replaced.after.phase, "guess-waiting", "the round waits for a new mystery");
  assertEqual(replaced.after.prompt, "A replacement question.", "the new prompt is recorded");
  assertEqual(replaced.before.phase, "guess", "the round really was showing a mystery first");
  // Let the round recover. There is no local AI model in this environment, so
  // the peer's answer is what produces the new mystery.
  await waitFor(first, "(() => { const g = globalThis.__cocktailCabinet.games.get('imitation'); return g.model.prompt === 'A replacement question.'; })()", "the provider receives the replacement prompt", 200);
  await first.evaluate("globalThis.__cocktailCabinet.games.get('imitation').sendMessage('Rice, with vegetables.'); true");
  await waitFor(second, "(() => { const g = globalThis.__cocktailCabinet.games.get('imitation'); return g.phase === 'guess' && Boolean(g.model.mystery); })()", "the replaced round produces a new mystery", 300);
  await step(2);
  const recovered = await second.evaluate("(() => { const g = globalThis.__cocktailCabinet.games.get('imitation'); return { enabled: [...document.querySelectorAll('[data-guess]')].every((b) => !b.disabled) }; })()");
  assertEqual(recovered.enabled, true, "the guess buttons re-enable after the round is replaced");

  const guessed = await second.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    const correct = game.chooseGuess('human');
    return { correct, right: game.model.guessStats.right, phase: game.phase, score: game.score };
  })()`);
  assertEqual(guessed.correct, true, "guessing the right source scores");
  assertEqual(guessed.right, 1, "the correct guess is counted");
  assert(guessed.score > 0, "a correct guess raises the score");

  const restarted = await second.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    const scoreBefore = game.score;
    document.querySelector('#guessRestart').click();
    return {
      after: { right: game.model.guessStats.right },
      scoreKept: game.score === scoreBefore,
      mystery: game.model.mystery
    };
  })()`);
  assertEqual(restarted.after.right, 0, "Restarting the round clears the guess tally");
  assertEqual(restarted.mystery, null, "Restarting the round clears the mystery");
  assertEqual(restarted.scoreKept, true, "Restarting one round keeps the session score");
  await step(5);
}

async function testNonRaceSplatSpendsEngineLives(page, step) {
  // Issue #37: Climber and Builder return a custom handleLifeLoss response but
  // the engine never spent a life for it, so a collision could repeat forever
  // against a configured budget of one. Climber spends the engine's budget;
  // Builder spends its own, which the engine mirrors.
  for (const side of ["climber", "builder"]) {
    await selectMode(page, 2, side);
    await settle(page);
    const report = await page.evaluate(`(() => {
      const engine = globalThis.__cocktailCabinet.engine;
      const game = globalThis.__cocktailCabinet.games.get('splat');
      const lives = document.querySelector('#livesInput');
      lives.value = '2';
      lives.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#restartButton').click();
      const start = { lives: engine.lives, maxLives: engine.maxLives };
      return { start, display: document.querySelector('#lives').textContent };
    })()`);
    assertEqual(report.start.lives, 2, `splat/${side} starts on the configured budget`);
    assertEqual(report.start.maxLives, 2, `splat/${side} honours the Lives setting`);
    await settle(page);

    // Spend both lives by colliding twice.
    const losses = [];
    for (let hit = 0; hit < 2; hit += 1) {
      const step = await page.evaluate(`(() => {
        const engine = globalThis.__cocktailCabinet.engine;
        const game = globalThis.__cocktailCabinet.games.get('splat');
        engine.ready = false; engine.countdown = 0;
        // Drive the real path: Splat queues the collided player in
        // lostPlayers, and handleLifeLoss() returns null when that is empty.
        // Setting lifeLost alone would fall through to the engine's default
        // branch and never exercise the custom response at all.
        game.model.lostPlayers.push(game.model.player);
        game.model.lifeLost = true;
        globalThis.__tick(1);
        // Read whichever counter is authoritative for this mode. Climber spends
        // the engine's lives; Builder now owns its own budget so it can report
        // the puzzle outcome, and the engine mirrors that instead of decrementing
        // its own. Asserting engine.lives for both would have quietly passed on
        // a mode whose counter had stopped moving.
        const remaining = game.playerLives ? game.playerLives.human : engine.lives;
        return { lives: remaining, gameOver: Boolean(game.model.gameOver), stopped: engine.stopped, message: document.querySelector('#message').textContent };
      })()`);
      losses.push(step);
      if (hit === 0) await settle(page);
    }

    assertEqual(losses[0].lives, 1, `splat/${side}: the first collision spends a life`);
    assertEqual(losses[0].gameOver, false, `splat/${side}: the round continues after the first life`);
    assertEqual(losses[1].lives, 0, `splat/${side}: the second collision spends the last life`);
    assertEqual(losses[1].gameOver, true, `splat/${side}: the round ends at zero lives rather than repeating`);
    assertEqual(losses[1].stopped, true, `splat/${side}: the engine halts the round`);
    // Climber falls through to the engine's generic text. Builder names the
    // outcome, because running the computer out of lives means the route is
    // unsolvable rather than that the player lost.
    assertMatch(losses[1].message, side === "builder" ? /Unsolved/i : /Out of lives/i, `splat/${side}: the end of the round is reported`);
  }

  // Race keeps its own per-player counter and must not spend the engine's.
  await selectMode(page, 2, "race");
  await settle(page);
  const race = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const game = globalThis.__cocktailCabinet.games.get('splat');
    engine.lives = 3;
    const before = { engineLives: engine.lives, raceLives: { ...game.model.raceLives } };
    // Push the actual player object: ownership is by identity, so a copy is
    // attributed to the computer instead.
    game.model.lostPlayers.push(game.model.player);
    const response = game.model.handleLifeLoss();
    return { before, after: { engineLives: engine.lives, raceLives: { ...game.model.raceLives } }, response };
  })()`);
  assertEqual(race.response.gameOver, false, "race: losing one ball does not end the round");
  assertMatch(race.response.message, /You lost a ball/, "race attributes the loss to the human");
  assertEqual(race.after.raceLives.human, race.before.raceLives.human - 1, "race spends its own per-player life");
  assertEqual(race.after.raceLives.computer, race.before.raceLives.computer, "race leaves the other player's lives alone");
  assertEqual(race.after.engineLives, race.before.engineLives, "race does not also spend the engine's lives");
}

async function testAsteroidsVersusLives(page, step) {
  // Issue #40/#41: the duel counters ignored the cabinet's Lives setting, so
  // the control and the on-screen duel could disagree.
  await selectMode(page, 3, "versus");
  const report = await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    const lives = document.querySelector('#livesInput');
    const out = [];
    for (const value of [1, 3, 5, 9]) {
      lives.value = String(value);
      lives.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#restartButton').click();
      const game = globalThis.__cocktailCabinet.games.get('asteroids');
      out.push({ value, engineLives: engine.lives, engineMax: engine.maxLives, duel: { ...game.model.playerLives } });
    }
    return out;
  })()`);
  for (const entry of report) {
    assertEqual(entry.engineMax, entry.value, `Lives ${entry.value} reaches the engine`);
    assertEqual(entry.duel.human, entry.value, `Lives ${entry.value} reaches the human duel counter`);
    assertEqual(entry.duel.computer, entry.value, `Lives ${entry.value} reaches the computer duel counter`);
  }
  await step(200);
}

async function testNarrowLayout(page) {
  // 375x812 is the narrowest target in the issue; 320 is used as well so a
  // regression shows up before it reaches a real device.
  for (const width of [375, 320]) {
    await page.command("Emulation.setDeviceMetricsOverride", { width, height: 812, deviceScaleFactor: 2, mobile: true });
    const narrow = await page.evaluate(`(() => {
      document.querySelectorAll('.game-card')[5].click();
      const select = document.querySelector('#sideSelect');
      select.value = 'guess';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const panel = document.querySelector('.chat-panel');
      const panelBox = panel.getBoundingClientRect();
      const controls = [...document.querySelectorAll('#guessControls button, #guessStats')].map((node) => {
        const box = node.getBoundingClientRect();
        return {
          id: node.id || node.dataset.guess || node.textContent.trim(),
          right: Math.round(box.right),
          left: Math.round(box.left),
          top: Math.round(box.top),
          width: Math.round(box.width),
          height: Math.round(box.height),
          isButton: node.tagName === 'BUTTON',
          visible: box.width > 0 && box.height > 0
        };
      });
      return {
        guessVisible: !document.querySelector('#guessControls').hidden,
        controls,
        panelRight: Math.round(panelBox.right),
        panelLeft: Math.round(panelBox.left),
        wraps: getComputedStyle(document.querySelector('#guessControls')).flexWrap,
        viewport: window.innerWidth,
        overflowX: document.documentElement.scrollWidth <= window.innerWidth + 1
      };
    })()`);

    assertEqual(narrow.guessVisible, true, `the guess controls show at ${width}px`);
    assertEqual(narrow.overflowX, true, `nothing overflows horizontally at ${width}px`);
    assertEqual(narrow.wraps, "wrap", `the controls wrap at ${width}px`);

    for (const control of narrow.controls) {
      assert(control.visible, `${control.id} is rendered at ${width}px`);
      assert(control.right <= narrow.panelRight + 1, `${control.id} stays inside the panel at ${width}px (right ${control.right} vs panel ${narrow.panelRight})`);
      assert(control.left >= narrow.panelLeft - 1, `${control.id} starts inside the panel at ${width}px`);
      // Accessible click targets, for the buttons only: the stats line is a
      // text label, not something to press.
      if (control.isButton) assert(control.height >= 24, `${control.id} keeps a tappable height at ${width}px (got ${control.height})`);
    }

    // Every guess control must actually be clickable at this width, not merely
    // present -- the issue is specifically about Restart round being unreadable.
    const clickable = await page.evaluate(`(() => {
      const button = document.querySelector('#guessRestart');
      button.scrollIntoView({ block: 'center' });
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
      return { hitId: hit?.id || hit?.className || hit?.tagName, isRestart: hit === button || button.contains(hit) };
    })()`);
    assert(clickable.isRestart, `Restart round is hittable at its centre at ${width}px (got ${clickable.hitId})`);
  }
  await page.command("Emulation.clearDeviceMetricsOverride");
}

async function testNarrowSplatControls(page) {
  for (const width of [320, 375]) {
    await page.command('Emulation.setDeviceMetricsOverride', { width, height: 812, deviceScaleFactor: 2, mobile: true });
    await selectMode(page, 2, 'builder');
    const report = await page.evaluate(`(() => {
      const frame = document.querySelector('.machine').getBoundingClientRect();
      const controls = [...document.querySelectorAll('#sideSelect, #gameActions button, #splatTools button')].map((node) => {
        const box = node.getBoundingClientRect();
        node.scrollIntoView({ block: 'center' });
        const visible = node.getBoundingClientRect();
        const hit = document.elementFromPoint(visible.left + visible.width / 2, visible.top + visible.height / 2);
        return { id: node.id, left: box.left, right: box.right, height: box.height, hittable: hit === node || node.contains(hit) };
      });
      return { controls, left: frame.left, right: frame.right, scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth };
    })()`);
    assert(report.scrollWidth <= width + 1, `Splat Builder has no horizontal page overflow at ${width}px (${report.scrollWidth} vs ${width})`);
    for (const control of report.controls) {
      assert(control.left >= report.left && control.right <= report.right, `${control.id} stays inside the Splat panel at ${width}px`);
      assert(control.height >= 24 && control.hittable, `${control.id} remains hittable at ${width}px`);
    }
    await page.evaluate("document.querySelector('#splatAddGap').focus()");
    await pressNativeKey(page, ' ', 'Space', 32);
    assertEqual(await page.evaluate("globalThis.__cocktailCabinet.engine.game.tool"), 'gap', `the gap button is keyboard-operable at ${width}px`);
    await page.evaluate("document.querySelector('#splatAddColumn').focus()");
    await pressNativeKey(page, 'Enter', 'Enter', 13);
    assertEqual(await page.evaluate("globalThis.__cocktailCabinet.engine.game.tool"), 'column', `the column button is keyboard-operable at ${width}px`);
  }
  await page.command('Emulation.clearDeviceMetricsOverride');
}

function assertNotOverflow(report, context) {
  assertEqual(report.overflowX, true, `${context} do not overflow the viewport`);
}

async function testSwitchingDisposesTheOldGame(first, second) {
  // Two Imitation tabs connect, then one leaves. The departing controller
  // must release its channel (issue #4) rather than going quiet in the background.
  const report = await first.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    return { hasController: Boolean(game.controller), channelOpen: Boolean(game.controller.channel) };
  })()`);
  assertEqual(report.hasController, true, "the Imitation controller exists");

  await first.evaluate(`(() => {
    document.querySelectorAll('.game-card')[0].click();
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    return { channelOpen: Boolean(game.controller.channel), disposed: game.model.disposed, timer: game.controller.announceTimer };
  })()`).then((afterSwitch) => {
    assertEqual(afterSwitch.channelOpen, false, "switching games closes the outgoing Imitation channel");
    assertEqual(afterSwitch.disposed, true, "switching games disposes the outgoing Imitation model");
    assertEqual(afterSwitch.timer, null, "switching games clears the matchmaking heartbeat");
  });

  const stillWorks = await second.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    return { connected: game.peerId !== null, status: document.querySelector('#roundStatus').textContent };
  })()`);
  assertMatch(String(stillWorks.status), /connected|searching|Waiting|Guess|AI/i, "the remaining tab stays coherent after the other leaves");
}

async function testImitationPageLifecycle(first, second) {
  await first.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); true");
  const hidden = await first.evaluate(`(() => {
    const game = globalThis.__cocktailCabinet.games.get('imitation');
    return { channel: Boolean(game.controller.channel), announce: game.controller.announceTimer, heartbeat: game.controller.heartbeatTimer, peer: game.model.peerId };
  })()`);
  assertEqual(hidden.channel, false, "pagehide closes the BFCache page's transport");
  assertEqual(hidden.announce, null, "pagehide stops matchmaking announcements");
  assertEqual(hidden.heartbeat, null, "pagehide stops peer heartbeats");
  assertEqual(hidden.peer, null, "pagehide releases the local peer slot");
  await waitFor(second, "!globalThis.__cocktailCabinet.games.get('imitation').model.peerId", "the survivor receives the pagehide bye");
  await first.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); true");
  const firstId = await first.evaluate("globalThis.__cocktailCabinet.games.get('imitation').matchId");
  const secondId = await second.evaluate("globalThis.__cocktailCabinet.games.get('imitation').matchId");
  await waitFor(first, `globalThis.__cocktailCabinet.games.get('imitation').model.peerId === ${JSON.stringify(secondId)}`, "the restored provider re-pairs");
  await waitFor(second, `globalThis.__cocktailCabinet.games.get('imitation').model.peerId === ${JSON.stringify(firstId)}`, "the restored Guess peer re-pairs");
  await second.evaluate("globalThis.__cocktailCabinet.games.get('imitation').sendMessage('After BFCache restoration'); true");
  await waitFor(first, "globalThis.__cocktailCabinet.games.get('imitation').model.prompt === 'After BFCache restoration'", "restored callbacks deliver a new prompt");
}

async function main() {
  const passed = [];
  let first;
  let second;
  let leftover;
  let step;
  try {
    // Dedicated contexts keep peers from previous or unrelated suites out.
    // finally disposes all owned targets;
    // disposeOnDetach also handles abrupt termination of the runner process.
    browser = await openBrowser();
    leftover = await seedHostileLeftover();

    const suites = [
      ["boot, descriptors, and mode catalogue", () => testBootAndDescriptors(first.page)],
      ["mode-aware control hints for all twenty-two modes", () => testModeAwareHints(first.page)],
      ["mode switch reopens the cabinet instead of auto-starting", () => testModeSwitchReopensTheCabinet(first.page, step)],
      ["focused live announcements under high-rate DOM updates", () => testFocusedAnnouncements(first.page, step)],
      ["native keyboard button activation without game side effects", () => testNativeKeyboardButtons(first.page)],
      ["settings validation from descriptors", () => testSettingsValidation(first.page)],
      ["lives setting policy", () => testLivesSetting(first.page)],
      ["pause and continue around the countdown", () => testPauseDuringCountdown(first.page, step)],
      ["keyboard and pointer controls", () => testKeyboardAndPointerControls(first.page, step)],
      ["retained retry pressure and late-score human recovery", () => testRetryPressureAndRecovery(first.page, step)],
      ["all twenty-two modes load and run", () => testEveryModeSurvivesPlay(first.page, step)],
      ["life loss, game over, and restart", () => testGameOverAndRestart(first.page, step)],
      ["Splat builder tools", () => testSplatBuilderTools(first.page, step)],
      ["native keyboard authoring and emulated touch pan/cancel", () => testSplatNativeEditor(first.page, step)],
      ["capped Builder browser workload and memory observation", () => testCappedBuilderBrowserWork(first.page)],
      ["Splat simultaneous finish DOM and announcement", () => testSplatTieBrowser(first.page, step)],
      ["Asteroids versus honours the Lives setting", () => testAsteroidsVersusLives(first.page, step)],
      ["non-Race Splat spends engine lives", () => testNonRaceSplatSpendsEngineLives(first.page, step)],
      ["Imitation provider fallback without a model", () => testImitationProviderFallback(first.page)],
      ["Imitation public provider controls and renamed Guess label", () => testImitationPublicControls(first.page, step)],
      ["Imitation provider load and chat form flow with a local fixture", () => testImitationProviderLoadFlow(first.page)],
      ["narrow viewport layout", () => testNarrowLayout(first.page)],
      ["narrow Splat Builder controls and native tool buttons", () => testNarrowSplatControls(first.page)]
    ];

    for (const [name, run] of suites) {
      console.log(`Running CDP suite: ${name}`);
      await createSmokeContext();
      first = await openPage(pageUrl);
      step = await makeDeterministic(first.page);
      await run();
      const violations = await first.page.evaluate('globalThis.__policyViolations');
      const policy = classifyPolicyViolations(pageUrl, violations);
      assertEqual(policy.unexpected.length, 0, `${name}: no unexpected document CSP violations (${JSON.stringify(policy.unexpected)})`);
      if (policy.expected.length && !reportedOptionalBeacon) {
        reportedOptionalBeacon = true;
        console.log('  Production CSP correctly blocks optional Cloudflare analytics; no third-party executable permission added.');
      }
      passed.push(name);
      first.page.close();
      pageConnections.delete(first.page);
      await browser.command("Target.disposeBrowserContext", { browserContextId });
      browserContextId = null;
      first = null;
    }

    // Cross-tab protocol needs a second page, and a fresh first page: the
    // suites above leave the cabinet on another game, and switching away
    // disposes the outgoing Imitation controller.
    await createSmokeContext();
    first = await openPage(pageUrl);
    await makeDeterministic(first.page);
    second = await openPage(pageUrl);
    await makeDeterministic(second.page);
    const secondStep = (frames) => second.page.evaluate(`globalThis.__tick(${frames})`);
    await first.page.evaluate(`(() => {
      globalThis.__pageErrors = globalThis.__pageErrors || [];
      window.addEventListener('error', (event) => globalThis.__pageErrors.push(String(event.message)));
      return true;
    })()`);

    await testGuessProvideAcrossTabs(first.page, second.page, secondStep);
    passed.push("cross-tab Guess and Provide protocol");
    await verifyHostileIsolation(leftover, first, second);
    passed.push("hostile leftover isolation without disturbing its tab");
    await testImitationPageLifecycle(first.page, second.page);
    passed.push("pagehide cleanup and pageshow peer restoration");
    await testSwitchingDisposesTheOldGame(first.page, second.page);
    passed.push("switching games disposes the outgoing controller");

    console.log(`CDP smoke passed: ${passed.length} suites`);
    for (const name of passed) console.log(`  - ${name}`);
  } catch (error) {
    const unavailable = error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED");
    if (!required && unavailable) {
      console.log("CDP smoke skipped: start dedicated Chromium with --remote-debugging-port=9321 and a local static server");
      return;
    }
    throw error;
  } finally {
    await disposeSmokeContext();
  }
}

await main();
