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
  ["imitation", "Imitation", "Repeat the pattern", () => new ImitationGame()],
  ["starfall", "Starfall", "Dodge or send stars", () => new StarfallGame()]
];

const canvas = document.querySelector("#gameCanvas");
const gameCards = document.querySelector("#gameCards");
const title = document.querySelector("#gameTitle");
const description = document.querySelector("#gameDescription");
const score = document.querySelector("#score");
const status = document.querySelector("#roundStatus");
const message = document.querySelector("#message");
const sideSelect = document.querySelector("#sideSelect");
const restartButton = document.querySelector("#restartButton");

const sideOptions = {
  snake: [["apples", "Place apples"], ["snake", "Steer the snake"]],
  breakout: [["bottom", "Bottom paddle"], ["top", "Top paddle"]],
  splat: [["climber", "Climb columns"], ["layout", "Lay out columns"]],
  asteroids: [["ship", "Fly the ship"], ["rocks", "Send asteroids"]],
  missile: [["defender", "Defend cities"], ["attacker", "Attack cities"]],
  imitation: [["ai", "Play the machine"], ["human", "Play a second tab"]],
  starfall: [["runner", "Guide the runner"], ["stars", "Send the stars"]]
};

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
  engine.load(game);
  restartButton.blur();
}

const engine = new GameEngine(canvas, {
  onState: (state) => {
    title.textContent = state.title;
    description.textContent = state.description;
    status.textContent = state.status;
  },
  onScore: (value) => { score.textContent = value; },
  onMessage: (value) => {
    message.textContent = value;
    window.clearTimeout(engine.messageTimer);
    engine.messageTimer = window.setTimeout(() => { message.textContent = ""; }, 2600);
  }
});

sideSelect.addEventListener("change", () => engine.setSide(sideSelect.value));
restartButton.addEventListener("click", () => engine.restart());
loadGame(activeId);
