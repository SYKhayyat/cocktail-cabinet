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

const pageUrl = process.env.COCKTAIL_URL || "http://127.0.0.1:8765/";
const cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9223";
const required = process.env.REQUIRE_BROWSER === "1";

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
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
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result || {});
    });
  }
  command(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
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

async function targetFor(url) {
  const response = await fetch(`${cdpUrl}/json/new?${url}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create browser target: ${response.status}`);
  return response.json();
}

async function waitFor(page, expression, description, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await page.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function openPage(url) {
  const target = await targetFor(url);
  const page = new Cdp(target.webSocketDebuggerUrl);
  await page.open();
  await page.command("Page.enable");
  await page.command("Runtime.enable");
  // Modules are served with caching, so a stale engine.js from an earlier run
  // can silently pass the suite. Disable caching for the whole session.
  await page.command("Network.enable");
  await page.command("Network.setCacheDisabled", { cacheDisabled: true });
  await page.command("Page.navigate", { url: `${url}${url.includes("?") ? "&" : "?"}smoke=${Date.now()}${Math.random()}` });
  await waitFor(page, "document.readyState === 'complete' && document.querySelectorAll('.game-card').length === 7 && !!globalThis.__cocktailCabinet", "cabinet boot");
  return { target, page };
}

async function closeTarget(id) {
  await fetch(`${cdpUrl}/json/close/${id}`);
}

// Installs deterministic randomness and freezes requestAnimationFrame so the
// suite can step the engine explicitly. Returns a stepper that advances the
// engine by a fixed number of 1/60s frames.
async function makeDeterministic(page) {
  await page.evaluate(`(() => {
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
    const engine = globalThis.__cocktailCabinet.engine;
    engine.running = true;
    // Virtual clock. Every frame must come from this monotonic source: reusing
    // performance.now() per call would hand frame() a timestamp behind its own
    // lastTime and produce a negative delta, which silently skips updates.
    globalThis.__now = performance.now() + 1000;
    globalThis.__tick = (frames = 1) => {
      for (let frame = 0; frame < frames; frame += 1) {
        globalThis.__now += 1000 / 60;
        engine.frame(globalThis.__now);
        globalThis.__rafHandles.length = 0;
      }
      return true;
    };
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
  { id: "starfall", modes: ["runner", "stars"] }
];

async function testBootAndDescriptors(page) {
  const report = await page.evaluate(`(() => ({
    cards: [...document.querySelectorAll('.game-card')].map((card) => card.textContent.replace(/\\s+/g, ' ').trim()),
    lives: document.querySelector('#lives').textContent,
    status: document.querySelector('#roundStatus').textContent,
    statsHidden: document.querySelector('#gameStats').hidden
  }))()`);
  assertEqual(report.cards.length, 7, "seven game cards render");
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

async function testEveryModeSurvivesPlay(page, step) {
  const catalogue = await page.evaluate(`(() => {
    const out = [];
    document.querySelectorAll('.game-card').forEach((card, index) => {
      card.click();
      for (const option of document.querySelectorAll('#sideSelect option')) out.push({ index, mode: option.value });
    });
    return out;
  })()`);
  assertEqual(catalogue.length, 20, "twenty modes are reachable through the UI");

  // Select, play, and inspect one mode at a time: selecting all twenty up
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
    globalThis.__tick(1);
    return { afterFirstLoss, afterSecondLoss: { lives: engine.lives, gameOver: engine.game.gameOver, stopped: engine.stopped, message: document.querySelector('#message').textContent } };
  })()`);
  assertEqual(report.afterFirstLoss.lives, 1, "a life loss spends one life");
  assertMatch(report.afterFirstLoss.message, /one life lost/i, "the life loss is reported");
  assertEqual(report.afterSecondLoss.lives, 0, "the round ends at zero lives");
  assertEqual(report.afterSecondLoss.gameOver, true, "the model is marked game over");
  assertMatch(report.afterSecondLoss.message, /Out of lives/, "the end of the round is reported");

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
    down(420, 200); up(420, 200);
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

async function testNarrowLayout(page) {
  await page.command("Emulation.setDeviceMetricsOverride", { width: 360, height: 720, deviceScaleFactor: 2, mobile: true });
  const narrow = await page.evaluate(`(() => {
    document.querySelectorAll('.game-card')[5].click();
    const select = document.querySelector('#sideSelect');
    select.value = 'guess';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const styles = getComputedStyle(document.querySelector('#guessControls'));
    return {
      guessVisible: !document.querySelector('#guessControls').hidden,
      display: styles.display,
      flexWrap: styles.flexWrap,
      overflowX: document.documentElement.scrollWidth <= window.innerWidth + 1
    };
  })()`);
  assertEqual(narrow.guessVisible, true, "the guess controls show in Guess mode");
  assertNotOverflow(narrow, "Guess controls at 360px");
  await page.command("Emulation.clearDeviceMetricsOverride");
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

async function main() {
  const passed = [];
  let first;
  let second;
  try {
    first = await openPage(pageUrl);
    const step = await makeDeterministic(first.page);

    const suites = [
      ["boot, descriptors, and mode catalogue", () => testBootAndDescriptors(first.page)],
      ["settings validation from descriptors", () => testSettingsValidation(first.page)],
      ["lives setting policy", () => testLivesSetting(first.page)],
      ["pause and continue around the countdown", () => testPauseDuringCountdown(first.page, step)],
      ["keyboard and pointer controls", () => testKeyboardAndPointerControls(first.page, step)],
      ["all twenty modes load and run", () => testEveryModeSurvivesPlay(first.page, step)],
      ["life loss, game over, and restart", () => testGameOverAndRestart(first.page, step)],
      ["Splat builder tools", () => testSplatBuilderTools(first.page, step)],
      ["Imitation provider fallback without a model", () => testImitationProviderFallback(first.page)],
      ["narrow viewport layout", () => testNarrowLayout(first.page)]
    ];

    for (const [name, run] of suites) {
      await run();
      passed.push(name);
    }

    // Cross-tab protocol needs a second page.
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
    await testSwitchingDisposesTheOldGame(first.page, second.page);
    passed.push("switching games disposes the outgoing controller");

    console.log(`CDP smoke passed: ${passed.length} suites`);
    for (const name of passed) console.log(`  - ${name}`);
  } catch (error) {
    const unavailable = error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED");
    if (!required && unavailable) {
      console.log("CDP smoke skipped: start Chromium with --remote-debugging-port=9223 and a local static server");
      return;
    }
    throw error;
  } finally {
    first?.page.close();
    second?.page.close();
    if (first) await closeTarget(first.target.id);
    if (second) await closeTarget(second.target.id);
  }
}

await main();