import { GameEngine } from "./engine.js";
import { SnakeGame } from "./games/snake.js";
import { BreakoutGame } from "./games/breakout.js";
import { SplatGame } from "./games/splat.js";
import { AsteroidsGame } from "./games/asteroids.js";
import { MissileCommandGame } from "./games/missile.js";
import { ImitationGame } from "./games/imitation.js";
import { StarfallGame } from "./games/starfall.js";

const gameFactories = [
  ["snake", "Snake", "Grow or feed the snake", () => new SnakeGame()],
  ["breakout", "Breakout", "Paddle duel", () => new BreakoutGame()],
  ["splat", "Splat", "Boost through column gaps", () => new SplatGame()],
  ["asteroids", "Asteroids", "Fly or launch rocks", () => new AsteroidsGame()],
  ["missile", "Missile Command", "Defend or attack", () => new MissileCommandGame()],
  ["imitation", "Imitation", "Chat with AI or a second tab", () => new ImitationGame()],
  ["starfall", "Starfall", "Dodge or send stars", () => new StarfallGame()]
];

const canvas = document.querySelector("#gameCanvas");
const gameCards = document.querySelector("#gameCards");
const title = document.querySelector("#gameTitle");
const description = document.querySelector("#gameDescription");
const score = document.querySelector("#score");
const lives = document.querySelector("#lives");
const livesInput = document.querySelector("#livesInput");
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
let lastChatRevision = -1;

const sideOptions = {
  snake: [["snake", "Solo — steer the snake"], ["apples", "Computer vs you — place apples"]],
  breakout: [["bottom", "Solo — keep the ball alive"], ["blocks", "Computer vs you — drag the blocks"], ["versus", "You vs computer — central brick duel"]],
  splat: [["climber", "Solo — steer the ball"], ["race", "You vs computer — two-ball race"], ["builder", "Computer navigates — place columns"]],
  asteroids: [["ship", "Solo — fly the ship"], ["versus", "You vs computer — both ships"], ["rocks", "Computer vs you — send asteroids"]],
  missile: [["defender", "You vs computer — defend cities"], ["attacker", "Computer vs you — attack cities"]],
  imitation: [["ai", "Chat with the local AI"], ["human", "Chat with another player"], ["guess", "Guess AI or human"], ["provide", "Provide a guessing message"], ["write", "Write text for AI to classify"]],
  starfall: [["runner", "Solo — guide the runner"], ["stars", "Computer vs you — send stars"]]
};

function renderChat(game) {
  if (!game) return;
  chatMessages.replaceChildren();
  for (const message of game.chatLog) {
    const row = document.createElement("div");
    row.className = `chat-message ${message.sender.toLowerCase()}${message.waiting ? " waiting" : ""}`;
    const meta = document.createElement("span");
    meta.className = "chat-meta";
    meta.textContent = `${message.sender} · ${message.time}`;
    const text = document.createElement("p");
    text.textContent = message.text;
    row.append(meta, text);
    chatMessages.append(row);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderGuessControls(state) {
  const isGuess = state.side === "Guess AI or human";
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
}

function readSnakeSettings() {
  const cols = Number(snakeCols.value);
  const rows = Number(snakeRows.value);
  const startingLength = Number(snakeLength.value);
  if (!Number.isInteger(cols) || cols < 10 || cols > 60 || !Number.isInteger(rows) || rows < 8 || rows > 44 || !Number.isInteger(startingLength) || startingLength < 3 || startingLength > 12 || startingLength >= Math.min(cols, rows)) return null;
  return { cols, rows, startingLength, wrap: snakeWrap.checked };
}

function applySnakeSettings() {
  if (activeId !== "snake") return;
  const settings = readSnakeSettings();
  if (!settings) {
    message.textContent = "Use whole numbers: columns 10–60, rows 8–44, and start length 3–12, smaller than both board dimensions.";
    return;
  }
  const game = games.get("snake");
  game.setSettings(settings);
  if (engine.ready) {
    game.applyPendingSettings();
    game.reset();
    message.textContent = "Preview updated. Press New game when ready.";
  } else message.textContent = "Settings saved for the next game.";
}

function readSplatSettings() {
  const columnSpacing = Number(splatSpacing.value);
  if (!Number.isInteger(columnSpacing) || columnSpacing < 90 || columnSpacing > 240) return null;
  return { columnSpacing };
}

function applySplatSettings() {
  if (activeId !== "splat") return;
  const settings = readSplatSettings();
  if (!settings) {
    message.textContent = "Use a whole number from 90 to 240 pixels for column spacing.";
    return;
  }
  const game = games.get("splat");
  game.setSettings(settings);
  if (engine.ready) {
    game.applyPendingSettings();
    game.reset();
    message.textContent = "Preview updated. Press New game when ready.";
  } else message.textContent = "Settings saved for the next game.";
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
    gameCards.append(button);
  });
}

function renderSideOptions(game) {
  sideSelect.replaceChildren();
  for (const [value, label] of sideOptions[game.id]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; sideSelect.append(option);
  }
  sideSelect.value = game.side;
}

function updateSplatTools() {
  const game = games.get("splat");
  const show = activeId === "splat" && ["builder", "layout"].includes(game.side);
  splatTools.hidden = !show;
  splatAddColumn.classList.toggle("active", game.tool === "column");
  splatAddGap.classList.toggle("active", game.tool === "gap");
}

function updateImitationTools() {
  const game = games.get("imitation");
  manualConnect.hidden = activeId !== "imitation" || !["human", "guess", "provide"].includes(game.side);
}

function loadGame(id) {
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
  settingsPanel.hidden = id !== "snake" && id !== "splat";
  settingsTitle.textContent = id === "splat" ? "Splat settings" : "Snake settings";
  snakeSettings.hidden = id !== "snake";
  splatSettings.hidden = id !== "splat";
  if (id === "snake") {
    const settings = readSnakeSettings();
    if (settings) game.setSettings(settings);
  }
  if (id === "splat") {
    const settings = readSplatSettings();
    if (settings) game.setSettings(settings);
  }
  chatPanel.hidden = id !== "imitation";
  lastChatRevision = -1;
  game.setStateListener?.(() => {
    if (activeId !== "imitation") return;
    const state = game.publicState();
    status.textContent = state.status;
    renderGuessControls(state);
    if (state.chatRevision !== lastChatRevision) {
      lastChatRevision = state.chatRevision;
      renderChat(game);
    }
  });
  engine.load(game);
  updateSplatTools();
  updateImitationTools();
  restartButton.blur();
}

const engine = new GameEngine(canvas, {
  onState: (state) => {
    title.textContent = state.title;
    description.textContent = state.description;
    status.textContent = activeId === "imitation" ? state.status : engine.ready ? "Press New game to start" : engine.countdown > 0 ? "Get ready…" : state.status;
    if (activeId === "imitation") {
      renderGuessControls(state);
      downloadModelButton.hidden = state.side === "Provide a guessing message";
      downloadModelButton.disabled = Boolean(engine.game.model?.aiReady || engine.game.model?.modelLoading);
      downloadModelButton.textContent = engine.game.model?.modelLoading ? state.modelStatus || "Loading…" : engine.game.model?.aiReady ? "AI model ready" : engine.game.model?.modelCached ? "Load cached model" : "Download AI model";
    }
    if (state.chatRevision !== undefined && state.chatRevision !== lastChatRevision) {
      lastChatRevision = state.chatRevision;
      renderChat(engine.game);
    }
  },
  onScore: (value) => { score.textContent = value; },
  onLives: (value, maximum) => { lives.textContent = `${value}/${maximum}`; },
  onMessage: (value) => {
    message.textContent = value;
    window.clearTimeout(engine.messageTimer);
    engine.messageTimer = window.setTimeout(() => { message.textContent = ""; }, 2600);
  }
});

sideSelect.addEventListener("change", () => {
  lastChatRevision = -1;
  engine.setSide(sideSelect.value);
  updateSplatTools();
  updateImitationTools();
});
[snakeCols, snakeRows, snakeLength, snakeWrap].forEach((control) => control.addEventListener("change", applySnakeSettings));
splatSpacing.addEventListener("change", applySplatSettings);
splatAddColumn.addEventListener("click", () => { games.get("splat").setTool("column"); updateSplatTools(); });
splatAddGap.addEventListener("click", () => { games.get("splat").setTool("gap"); updateSplatTools(); });
restartButton.addEventListener("click", () => engine.restart());
pauseButton.addEventListener("click", () => engine.pauseGame());
continueButton.addEventListener("click", () => engine.continueGame());
livesInput.addEventListener("change", () => engine.setLives(livesInput.value));
downloadModelButton.addEventListener("click", () => engine.game.downloadModel?.());
guessRestart.addEventListener("click", () => {
  if (activeId === "imitation") engine.game.restartGuess?.();
});
for (const button of guessButtons) button.addEventListener("click", () => {
  if (activeId === "imitation") engine.game.chooseGuess(button.dataset.guess);
});
async function runManualConnection(action) {
  try {
    message.textContent = "Working…";
    await action();
  } catch (error) {
    message.textContent = error.message || "The connection could not be completed.";
  }
}
createInviteButton.addEventListener("click", () => runManualConnection(async () => {
  signalText.value = await engine.game.createManualInvite();
  message.textContent = "Copy this invite into the other browser.";
}));
joinInviteButton.addEventListener("click", () => runManualConnection(async () => {
  signalText.value = await engine.game.acceptManualInvite(signalText.value);
  message.textContent = "Copy this answer back into the first browser.";
}));
finishConnectionButton.addEventListener("click", () => runManualConnection(async () => {
  await engine.game.acceptManualAnswer(signalText.value);
  signalText.value = "";
  message.textContent = "Connecting…";
}));
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (activeId !== "imitation") return;
  engine.game.sendMessage(chatInput.value);
  chatInput.value = "";
});
loadGame(activeId);
