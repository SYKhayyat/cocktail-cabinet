import { GameEngine } from "./engine.js";
import { Announcements } from "./announcements.js";
import { SnakeGame } from "./games/snake.js";
import { BreakoutGame } from "./games/breakout.js";
import { SplatGame } from "./games/splat.js";
import { AsteroidsGame } from "./games/asteroids.js";
import { MissileCommandGame } from "./games/missile.js";
import { ImitationGame } from "./games/imitation.js";
import { StarfallGame } from "./games/starfall.js";
import { LampGame } from "./games/lamp.js";
import { NonvisualPanel } from "./nonvisual-panel.js";
import { isAudioMuted, setAudioMuted, setAudioSuppressed, unlockAudio } from "./audio.js";

const gameFactories = [
  ["snake", "Snake", "Grow or feed the snake", () => new SnakeGame()],
  ["breakout", "Breakout", "Paddle duel", () => new BreakoutGame()],
  ["splat", "Splat", "Boost through column gaps", () => new SplatGame()],
  ["asteroids", "Asteroids", "Fly or launch rocks", () => new AsteroidsGame()],
  ["missile", "Missile Command", "Defend or attack", () => new MissileCommandGame()],
  ["imitation", "Imitation", "Chat with AI or a second tab", () => new ImitationGame()],
  ["starfall", "Starfall", "Dodge or send stars", () => new StarfallGame()],
  ["lamp", "Lamp", "Walk blind by lantern light", () => new LampGame()]
];

const canvas = document.querySelector("#gameCanvas");
const gameCards = document.querySelector("#gameCards");
const title = document.querySelector("#gameTitle");
const description = document.querySelector("#gameDescription");
const score = document.querySelector("#score");
const lives = document.querySelector("#lives");
const livesInput = document.querySelector("#livesInput");
let displayedPendingLives = Number(livesInput.value);
const status = document.querySelector("#roundStatus");
const message = document.querySelector("#message");
const sideSelect = document.querySelector("#sideSelect");
const restartButton = document.querySelector("#restartButton");
const pauseButton = document.querySelector("#pauseButton");
const continueButton = document.querySelector("#continueButton");
const gameActions = document.querySelector("#gameActions");
const gameSideControls = document.querySelector("#gameSideControls");
const gameStats = document.querySelector("#gameStats");
const screenFrame = document.querySelector("#screenFrame");
const downloadModelButton = document.querySelector("#downloadModelButton");
const splatTools = document.querySelector("#splatTools");
const splatAddColumn = document.querySelector("#splatAddColumn");
const splatAddGap = document.querySelector("#splatAddGap");
const chatPanel = document.querySelector("#chatPanel");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const guessControls = document.querySelector("#guessControls");
const controlHint = document.querySelector("#controlHint");
const guessButtons = [...document.querySelectorAll("[data-guess]")];
const guessStats = document.querySelector("#guessStats");
const guessRestart = document.querySelector("#guessRestart");
const manualConnect = document.querySelector("#manualConnect");
const createInviteButton = document.querySelector("#createInviteButton");
const joinInviteButton = document.querySelector("#joinInviteButton");
const finishConnectionButton = document.querySelector("#finishConnectionButton");
const signalText = document.querySelector("#signalText");
const settingsPanel = document.querySelector("#settingsPanel");
const settingsTitle = document.querySelector("#settingsTitle");
const snakeSettings = document.querySelector("#snakeSettings");
const splatSettings = document.querySelector("#splatSettings");
const splatSpacing = document.querySelector("#splatSpacing");
const snakeCols = document.querySelector("#snakeCols");
const snakeRows = document.querySelector("#snakeRows");
const snakeLength = document.querySelector("#snakeLength");
const snakeWrap = document.querySelector("#snakeWrap");
const lampSettings = document.querySelector("#lampSettings");
const lampPreset = document.querySelector("#lampPreset");
const lampCols = document.querySelector("#lampCols");
const lampRows = document.querySelector("#lampRows");
const lampCoins = document.querySelector("#lampCoins");
const lampHazards = document.querySelector("#lampHazards");
const lampWisps = document.querySelector("#lampWisps");
const lampPatrol = document.querySelector("#lampPatrol");
const soundButton = document.querySelector("#soundButton");
let lastChatRevision = -1;
const announcements = new Announcements(document.querySelector("#announcements"));
const chatRows = new Map();
const announcedChat = new WeakSet();

// The engine gives Space and Enter to a focused native control and only lets
// the arrow keys reach the board, which is right for a select or a text field --
// and wrong for a game whose primary verb is Space. Clicking New game left that
// button focused, so the next Space pressed New game again and Lamp's lamp never
// lit.
//
// So a pointer click hands the board the focus, and a keyboard activation
// (detail 0) deliberately does not: a keyboard player must still be able to
// press Space on the button again, and in that state the arrow keys already
// reach the board.
function focusBoardAfterPointerClick(event) {
  if (event.detail === 0) return;
  canvas.focus({ preventScroll: true });
}

// Browsers refuse to start audio until the page has been interacted with, so the
// context is built on the first real gesture and never before. This runs once.
window.addEventListener("pointerdown", () => unlockAudio(), { once: true });
window.addEventListener("keydown", () => unlockAudio(), { once: true });

function renderSoundButton() {
  const muted = isAudioMuted();
  soundButton.textContent = muted ? "Sound off" : "Sound on";
  soundButton.setAttribute("aria-pressed", String(!muted));
}

function showMessage(text) {
  message.textContent = text;
  announcements.publish("notice", text, text);
}

function renderRoundStatus(state) {
  if (activeId === "imitation") {
    const result = state.guessResult;
    const source = result && (result.correct ? result.choice : result.choice === "ai" ? "human" : "ai");
    const text = state.phase === "result" && result ? `${result.correct ? "Correct" : "Not quite"} — the response was ${source.toUpperCase()}. Press Restart round to play again.` : state.phase === "guess" ? "Choose AI or Human for this reply" : state.status;
    status.textContent = text;
    announcements.publish("status", `${activeId}/${state.mode}/${state.phase}/${text}`, text);
    return;
  }
  const result = engine.lifecycle.resultState();
  const phase = engine.ready ? "ready" : result.ended ? "ended" : engine.paused ? "paused" : engine.countdown > 0 ? "countdown" : "playing";
  const text = phase === "ready" ? "Press New game to start" : phase === "ended" ? `${result.heading}. ${result.instruction}.` : phase === "paused" ? "Paused — press Continue to resume" : phase === "countdown" ? "Get ready…" : "Round in progress";
  status.textContent = phase === "playing" ? state.status : text;
  announcements.publish("status", `${activeId}/${engine.game.side}/${phase}/${phase === "ended" ? result.heading : ""}`, `${state.title}: ${text}`);
}

const settingsInputs = {
  snake: { cols: snakeCols, rows: snakeRows, startingLength: snakeLength, wrap: snakeWrap },
  splat: { columnSpacing: splatSpacing },
  lamp: { preset: lampPreset, cols: lampCols, rows: lampRows, coins: lampCoins, hazards: lampHazards, wisps: lampWisps, patrol: lampPatrol }
};

// A setting key is only unique within a game. Snake and Lamp both have `cols`
// and `rows`, so the label lookup has to be scoped to that game's own group --
// searching the whole panel found Snake's caption for Lamp's descriptor and
// renamed it, because the settings panel is shared and both groups are in it.
// The browser suite caught this; no unit test could, since nothing else reads
// the markup.
const settingsGroups = { snake: snakeSettings, splat: splatSettings, lamp: lampSettings };

function readSettingsInputs(id) {
  const values = {};
  for (const [key, input] of Object.entries(settingsInputs[id] || {})) {
    if (input.type === "checkbox") values[key] = input.checked;
    // A select holds a name, not a number. Number("big") is NaN, which every
    // validator then refuses, so Lamp's difficulty dropdown was silently
    // ignored and the maze stayed whatever it was before. Nothing else in the
    // cabinet had a select, which is why no test covered it.
    else if (input.tagName === "SELECT") values[key] = input.value;
    else values[key] = Number(input.value);
  }
  return values;
}

// Applied once at boot. Bounds and labels are static per game, and the
// default must only seed the input once -- re-running this on every game
// load would discard values the player has already typed.
function applySettingDescriptors() {
  for (const [id, inputs] of Object.entries(settingsInputs)) {
    const descriptors = games.get(id)?.settings;
    if (!descriptors) continue;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      const input = inputs[key];
      if (!input) continue;
      const caption = (settingsGroups[id] || settingsPanel).querySelector(`[data-setting-label="${key}"]`);
      if (caption && descriptor.label) caption.textContent = descriptor.label;
      if (descriptor.type === "checkbox") {
        input.checked = Boolean(descriptor.default);
        continue;
      }
      // A select is declared, not hand-written: the dropdown's options come
      // from the descriptor so the list of difficulties cannot drift from the
      // bundles the model actually has.
      if (descriptor.type === "select") {
        if (!input.options.length) {
          for (const option of descriptor.options) {
            const element = document.createElement("option");
            element.value = option.value;
            element.textContent = option.label;
            input.append(element);
          }
        }
        input.value = descriptor.default;
        continue;
      }
      input.min = descriptor.min;
      input.max = descriptor.max;
      input.step = descriptor.step ?? 1;
      if (descriptor.default !== undefined) input.value = descriptor.default;
    }
  }
}

function describeInvalidSettings(id) {
  const game = games.get(id);
  const descriptors = game?.settings || {};
  const parts = Object.entries(descriptors)
    .filter(([, descriptor]) => descriptor.type !== "checkbox" && descriptor.type !== "select")
    .map(([, descriptor]) => `${descriptor.label} ${descriptor.min}–${descriptor.max}`);
  const snakeLengthRule = id === "snake" ? ", start length must be smaller than both board dimensions" : "";
  // The maze is carved on a two-cell lattice, so an even width is a maze the
  // generator cannot build rather than one it will round for you.
  const lampRule = id === "lamp" ? ", maze columns and rows must be odd numbers" : "";
  return `Use whole numbers within range: ${parts.join(", ")}${snakeLengthRule}${lampRule}.`;
}

const LAMP_NUMBER_KEYS = ["cols", "rows", "coins", "hazards", "wisps"];
// What the player last typed under Custom. Choosing a difficulty fills the fields
// with that difficulty's numbers, which is the whole point -- but it used to
// destroy a hand-built maze with no way back, so the draft is kept and restored.
let lampCustomDraft = null;
// Which difficulty was last in force. Saving and restoring the draft happen only
// on a change of difficulty: doing it on every change meant that typing a number
// under Custom was overwritten by the draft before the next keystroke.
let lastLampPreset = null;

// A difficulty that owns the numbers greys the number fields out and shows what
// it set, rather than leaving stale custom values on screen looking editable.
function syncPresetAvailability(id) {
  if (id !== "lamp") return;
  const inputs = settingsInputs.lamp;
  const preset = inputs.preset.value;
  const chosen = preset !== "custom";
  const custom = preset === "custom";
  // The patrol is a checkbox, not part of a difficulty bundle, so it stays
  // editable whichever difficulty is chosen.
  for (const [key, input] of Object.entries(inputs)) {
    input.disabled = key === "preset" || key === "patrol" ? false : chosen;
  }
  const changed = preset !== lastLampPreset;
  lastLampPreset = preset;
  if (custom) {
    // Coming back to Custom hands the player their own numbers again -- once, on
    // the way in, and never while they are typing into the fields.
    if (changed && lampCustomDraft) for (const [key, value] of Object.entries(lampCustomDraft)) inputs[key].value = value;
    return;
  }
  // Leaving Custom: remember what was on screen before the preset overwrites it.
  if (changed) lampCustomDraft = Object.fromEntries(LAMP_NUMBER_KEYS.map((key) => [key, inputs[key].value]));
  const validated = games.get(id)?.validateSettings?.(readSettingsInputs(id));
  if (!validated) return;
  for (const key of LAMP_NUMBER_KEYS) inputs[key].value = validated[key];
}

function applySettings(id) {
  if (activeId !== id) return;
  const game = games.get(id);
  const settings = game.validateSettings?.(readSettingsInputs(id));
  if (!settings) {
    showMessage(describeInvalidSettings(id));
    return;
  }
  game.setSettings(settings);
  if (engine.ready) {
    if (game.refreshSettingsPreview) showMessage(game.refreshSettingsPreview());
    else {
      game.applyPendingSettings();
      game.reset();
      showMessage("Preview updated. Press New game when ready.");
    }
  } else showMessage("Settings saved for the next game.");
  nonvisual.refresh();
}

function renderChat(game) {
  if (!game) return;
  const log = game.chatLog;
  for (const [entry, row] of chatRows) {
    if (!log.includes(entry)) { row.remove(); chatRows.delete(entry); }
  }
  for (const message of log) {
    let row = chatRows.get(message);
    if (!row) {
      row = document.createElement("div");
      const meta = document.createElement("span");
      meta.className = "chat-meta";
      meta.textContent = `${message.sender} · ${message.time}`;
      row.append(meta, document.createElement("p"));
      chatRows.set(message, row);
      chatMessages.append(row);
    }
    row.className = `chat-message ${message.sender.toLowerCase()}${message.waiting ? " waiting" : ""}`;
    const text = row.querySelector("p");
    if (text.textContent !== message.text) text.textContent = message.text;
    if (!announcedChat.has(message) && message.text && message.sender !== "You") {
      announcedChat.add(message);
      announcements.publish("chat", message, `${message.sender}: ${message.text}`);
    }
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderGuessControls(state) {
  const isGuess = state.mode === "guess";
  guessControls.hidden = !isGuess;
  const stats = state.guessStats || { right: 0, wrong: 0 };
  guessStats.textContent = `Right ${stats.right} · Wrong ${stats.wrong}`;
  for (const button of guessButtons) {
    const choice = button.dataset.guess;
    const result = state.guessResult;
    button.classList.toggle("is-correct", Boolean(result?.correct && result.choice === choice));
    button.classList.toggle("is-incorrect", Boolean(result && !result.correct && result.choice === choice));
    button.classList.toggle("is-answer", Boolean(result?.correct && result.choice !== choice));
    button.disabled = state.phase !== "guess" || Boolean(result);
  }
  // While a mystery is on screen the round belongs to the guess, not to the
  // prompt box. A message sent here would replace the prompt mid-round, which
  // is why the model treats a new prompt as starting a fresh round.
  const awaitingGuess = isGuess && state.phase === "guess";
  chatInput.disabled = awaitingGuess;
  chatInput.placeholder = awaitingGuess ? "Choose AI or Human first" : "Type a message · Enter to send";
}

let activeId = "snake";
const games = new Map(gameFactories.map(([id, , , factory]) => [id, factory()]));

function renderCards() {
  gameCards.replaceChildren();
  gameFactories.forEach(([id, name, shortDescription], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game-card${id === activeId ? " active" : ""}`;
    button.innerHTML = `<strong><span class="number">0${index + 1}</span>${name}</strong><small>${shortDescription}</small>`;
    button.addEventListener("click", () => loadGame(id));
    button.addEventListener("click", focusBoardAfterPointerClick);
    gameCards.append(button);
  });
}

function renderSideOptions(game) {
  sideSelect.replaceChildren();
  for (const mode of game.modes.filter((entry) => entry.available !== false)) {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.label;
    sideSelect.append(option);
  }
  sideSelect.value = game.side;
}

function updateSplatTools() {
  const game = games.get("splat");
  const show = activeId === "splat" && game.side === "builder";
  splatTools.hidden = !show;
  splatAddColumn.classList.toggle("active", game.tool === "column");
  splatAddGap.classList.toggle("active", game.tool === "gap");
}

function updateImitationTools() {
  renderImitationControls(games.get("imitation").publicState());
}

function renderImitationControls(state) {
  const isImitation = activeId === "imitation";
  manualConnect.hidden = !isImitation || !["human", "guess", "provide"].includes(state.mode);
  downloadModelButton.hidden = !isImitation || state.mode === "provide";
  downloadModelButton.disabled = state.aiReady || state.modelLoading;
  downloadModelButton.textContent = state.modelLoading ? state.modelStatus || "Loading…" : state.aiReady ? "AI model ready" : state.modelCached ? "Load cached model" : "Download AI model";
  if (isImitation) renderGuessControls(state);
}

let lastControlHint = "";
function renderControlHint(game) {
  const hints = game.controlHint?.() || [];
  const signature = JSON.stringify(hints);
  if (signature === lastControlHint) return;
  lastControlHint = signature;
  controlHint.replaceChildren();
  for (const { keys, label } of hints) {
    const group = document.createElement("span");
    group.className = "shortcut-group";
    for (const key of keys) {
      const element = document.createElement("kbd");
      element.textContent = key;
      group.append(element);
    }
    group.append(document.createTextNode(` ${label} `));
    controlHint.append(group);
  }
}

function loadGame(id) {
  announcements.reset();
  activeId = id;
  const game = games.get(id);
  renderCards();
  title.textContent = game.title;
  description.textContent = game.description;
  renderSideOptions(game);
  gameActions.hidden = id === "imitation";
  gameSideControls.hidden = false;
  gameStats.hidden = id === "imitation";
  screenFrame.hidden = id === "imitation";
  downloadModelButton.hidden = id !== "imitation";
  document.querySelector(".machine").classList.toggle("imitation-layout", id === "imitation");
  settingsPanel.hidden = !["snake", "splat", "lamp"].includes(id);
  settingsTitle.textContent = `${game.title} settings`;
  snakeSettings.hidden = id !== "snake";
  splatSettings.hidden = id !== "splat";
  lampSettings.hidden = id !== "lamp";
  const settings = game.validateSettings?.(readSettingsInputs(id));
  if (settings) game.setSettings(settings);
  syncPresetAvailability(id);
  chatPanel.hidden = id !== "imitation";
  lastChatRevision = -1;
  game.setStateListener?.(() => {
    if (activeId !== "imitation") return;
    const state = game.publicState();
    renderControlHint(game);
    renderRoundStatus(state);
    renderImitationControls(state);
    if (state.chatRevision !== lastChatRevision) {
      lastChatRevision = state.chatRevision;
      renderChat(game);
    }
  });
  renderControlHint(game);
  engine.load(game);
  updateSplatTools();
  updateImitationTools();
  nonvisual.changedGame();
}

const engine = new GameEngine(canvas, {
  onState: (state) => {
    const usesLives = engine.lifecycle.lifeState().owner !== "none";
    livesInput.closest("label").hidden = !usesLives;
    lives.closest("div").hidden = !usesLives;
    renderControlHint(engine.game);
    title.textContent = state.title;
    description.textContent = state.description;
    renderRoundStatus(state);
    // Nonvisual assistance freezes time and asks the player to read the board as
    // text; sound on top of that is noise, so it is suppressed there.
    setAudioSuppressed(engine.assistance);
    if (activeId === "splat") updateSplatTools();
    if (activeId === "imitation") {
      renderImitationControls(state);
    }
    if (state.chatRevision !== undefined && state.chatRevision !== lastChatRevision) {
      lastChatRevision = state.chatRevision;
      renderChat(engine.game);
    }
  },
  onScore: (value) => { score.textContent = value; },
  onLives: (value, maximum) => {
    lives.textContent = `${value}/${maximum}`;
    if (displayedPendingLives !== engine.pendingLives) {
      displayedPendingLives = engine.pendingLives;
      if (document.activeElement !== livesInput) livesInput.value = engine.pendingLives;
    }
  },
  onMessage: (value) => {
    message.textContent = value;
    // Lifecycle callbacks and the following frame describe the same transition.
    // Use the semantic lifecycle once, not both a transient toast and a status.
    renderRoundStatus(engine.game.publicState());
    const ended = engine.lifecycle.resultState().ended;
    if (!ended && !/^(Go!|New game|Paused|Continuing)/.test(value)) announcements.publish("notice", value, value);
    window.clearTimeout(engine.messageTimer);
    engine.messageTimer = window.setTimeout(() => { message.textContent = ""; }, 2600);
  }
});

const nonvisual = new NonvisualPanel(engine, { announce: (text) => announcements.publish("notice", text, text) });

sideSelect.addEventListener("change", () => {
  announcements.reset();
  lastChatRevision = -1;
  engine.setSide(sideSelect.value);
  renderControlHint(engine.game);
  updateSplatTools();
  updateImitationTools();
  nonvisual.changedGame();
});
for (const [id, inputs] of Object.entries(settingsInputs)) {
  for (const control of Object.values(inputs)) {
    control.addEventListener("change", () => {
      applySettings(id);
      syncPresetAvailability(id);
    });
  }
}
soundButton.addEventListener("click", () => {
  // Turning sound back on is itself a gesture, so this is where the context is
  // finally allowed to start for a player who had it muted.
  unlockAudio();
  setAudioMuted(!isAudioMuted());
  renderSoundButton();
});
renderSoundButton();
splatAddColumn.addEventListener("click", () => { games.get("splat").setTool("column"); updateSplatTools(); });
splatAddGap.addEventListener("click", () => { games.get("splat").setTool("gap"); updateSplatTools(); });
restartButton.addEventListener("click", () => { engine.restart(); nonvisual.refresh(); });
for (const control of [restartButton, pauseButton, continueButton]) {
  control.addEventListener("click", focusBoardAfterPointerClick);
}
pauseButton.addEventListener("click", () => { engine.pauseGame(); nonvisual.refresh(); });
continueButton.addEventListener("click", () => { engine.continueGame(); nonvisual.refresh(); });
livesInput.addEventListener("change", () => {
  engine.setLives(livesInput.value);
  displayedPendingLives = engine.pendingLives;
  livesInput.value = engine.pendingLives;
  nonvisual.refresh();
});
livesInput.addEventListener("blur", () => { livesInput.value = engine.pendingLives; });
downloadModelButton.addEventListener("click", () => engine.game.downloadModel?.());
guessRestart.addEventListener("click", () => {
  if (activeId === "imitation") engine.game.restartGuess?.();
});
for (const button of guessButtons) button.addEventListener("click", () => {
  if (activeId === "imitation") engine.game.chooseGuess(button.dataset.guess);
});
async function runManualConnection(action) {
  try {
    showMessage("Working…");
    await action();
  } catch (error) {
    showMessage(error.message || "The connection could not be completed.");
  }
}
createInviteButton.addEventListener("click", () => runManualConnection(async () => {
  signalText.value = await engine.game.createManualInvite();
  showMessage("Copy this invite into the other browser.");
}));
joinInviteButton.addEventListener("click", () => runManualConnection(async () => {
  signalText.value = await engine.game.acceptManualInvite(signalText.value);
  showMessage("Copy this answer back into the first browser.");
}));
finishConnectionButton.addEventListener("click", () => runManualConnection(async () => {
  await engine.game.acceptManualAnswer(signalText.value);
  signalText.value = "";
  showMessage("Connecting…");
}));
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (activeId !== "imitation") return;
  // sendMessage returns null when it refuses the text, so the box is only
  // cleared on a send that happened.
  const sent = engine.game.sendMessage(chatInput.value);
  if (sent) chatInput.value = "";
});
applySettingDescriptors();
syncPresetAvailability("lamp");
loadGame(activeId);

// Exposed for the CDP smoke suite in tests/browser-smoke.mjs. It drives the
// real page rather than a stand-in, but needs a handle on the live engine and
// models to assert on state that never reaches the DOM. Read-only in spirit:
// the suite sets these to install deterministic time and randomness.
globalThis.__cocktailCabinet = {
  engine,
  games,
  loadGame,
  get activeId() { return activeId; }
};
