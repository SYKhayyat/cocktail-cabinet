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
  ["splat", "Splat", "Build a rising route", () => new SplatGame()],
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
const chatPanel = document.querySelector("#chatPanel");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const settingsPanel = document.querySelector("#settingsPanel");
const snakeCols = document.querySelector("#snakeCols");
const snakeRows = document.querySelector("#snakeRows");
const snakeLength = document.querySelector("#snakeLength");
const snakeWrap = document.querySelector("#snakeWrap");
let lastChatRevision = -1;

const sideOptions = {
  snake: [["snake", "You vs computer — steer the snake"], ["apples", "Computer vs you — place apples"]],
  breakout: [["bottom", "You vs computer — bottom paddle"], ["blocks", "Computer vs you — drag the blocks"]],
  splat: [["climber", "You vs computer — climb the columns"], ["layout", "Computer vs you — lay out columns"]],
  asteroids: [["ship", "You vs computer — fly the ship"], ["rocks", "Computer vs you — send asteroids"]],
  missile: [["defender", "You vs computer — defend cities"], ["attacker", "Computer vs you — attack cities"]],
  imitation: [["ai", "Chat with the local AI"], ["human", "Chat with a second tab"]],
  starfall: [["runner", "You vs computer — guide the runner"], ["stars", "Computer vs you — send stars"]]
};

function renderChat(game) {
  if (!game) return;
  chatMessages.replaceChildren();
  for (const message of game.chatLog) {
    const row = document.createElement("div");
    row.className = `chat-message ${message.sender.toLowerCase()}`;
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

function loadGame(id) {
  activeId = id;
  const game = games.get(id);
  renderCards();
  title.textContent = game.title;
  description.textContent = game.description;
  renderSideOptions(game);
  gameActions.hidden = id === "imitation";
  settingsPanel.hidden = id !== "snake";
  if (id === "snake") game.setSettings(readSnakeSettings());
  chatPanel.hidden = id !== "imitation";
  lastChatRevision = -1;
  engine.load(game);
  restartButton.blur();
}

const engine = new GameEngine(canvas, {
  onState: (state) => {
    title.textContent = state.title;
    description.textContent = state.description;
    status.textContent = engine.ready ? "Press New game to start" : engine.countdown > 0 ? "Get ready…" : state.status;
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
});
[snakeCols, snakeRows, snakeLength, snakeWrap].forEach((control) => control.addEventListener("change", applySnakeSettings));
restartButton.addEventListener("click", () => engine.restart());
pauseButton.addEventListener("click", () => engine.pauseGame());
continueButton.addEventListener("click", () => engine.continueGame());
livesInput.addEventListener("change", () => engine.setLives(livesInput.value));
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (activeId !== "imitation") return;
  engine.game.sendMessage(chatInput.value);
  chatInput.value = "";
});
loadGame(activeId);
