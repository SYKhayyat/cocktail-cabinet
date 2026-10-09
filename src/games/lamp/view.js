import { CANVAS_PALETTE, drawText } from "../../rendering.js";
import { BOARD_WIDTH, BOARD_HEIGHT } from "./model.js";

// Colours that are drawn rather than announced. The contract for text is the
// shared palette and its 4.5:1 threshold; these only ever fill shapes, so they
// are free to be as bright as the entity needs to be.
const WALL_LIT = "#3b4a6b";
const FLOOR_LIT = "#0d1220";
const EXIT = "#5ce89a";
const COIN = "#ffcc55";
const COIN_CORE = "#fff3c4";
const WISP = "#8ad8ff";
const HAZARD = "#ff4455";
const WALKER = "#fffae0";

function blend(from, to, amount) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channel = (shift) => {
    const left = (a >> shift) & 255;
    const right = (b >> shift) & 255;
    return Math.round(left + (right - left) * amount);
  };
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

const TAU = Math.PI * 2;

export function draw(model, context) {
  context.fillStyle = CANVAS_PALETTE.background;
  context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  // After the run ends the maze is shown whole, and the pickups that are gone
  // are drawn back in, so the end of a run is the one time the board can be
  // read as a map rather than a glimpse.
  const over = model.revealed();
  const brightness = over ? 1 : model.brightness();
  const { tile, originX, originY } = model.layout();
  const point = (wx, wy) => ({ x: originX + wx * tile, y: originY + wy * tile });

  // Nothing at all is remembered between pulses: at the end of a fade the maze
  // is indistinguishable from the background it was drawn on.
  if (brightness > 0.01) {
    const wall = blend(CANVAS_PALETTE.background, WALL_LIT, brightness);
    const floor = blend(CANVAS_PALETTE.background, FLOOR_LIT, brightness);
    const size = tile + 1;
    for (let y = 0; y < model.rows; y += 1) {
      for (let x = 0; x < model.cols; x += 1) {
        const cell = point(x, y);
        context.fillStyle = model.maze[y][x] === 1 ? wall : floor;
        context.fillRect(Math.floor(cell.x), Math.floor(cell.y), size, size);
      }
    }
    drawExit(context, model, point, tile, brightness);
    for (const coin of model.coins) if (over || !coin.taken) drawCoin(context, point(coin.x, coin.y), tile);
    for (const wisp of model.wisps) if (over || !wisp.taken) drawWisp(context, point(wisp.x, wisp.y), tile);
    for (const hazard of model.hazards) drawHazard(context, point(hazard.x, hazard.y), tile);
  }

  drawWalker(context, point(model.player.x, model.player.y), tile, brightness);
  drawReadouts(context, model);
}

// A doorway, not a dot. Coins and wisps are both small round pickups, so a
// round green speck was the least identifiable thing on the board during the
// second and a half you had to look at it. The arch shape, the wide halo and
// the two jambs are readable at a glance from across the maze.
function drawExit(context, model, point, tile, brightness) {
  const centre = point(model.exit.x, model.exit.y);
  const halo = tile * 2.2;
  for (let ring = 4; ring >= 1; ring -= 1) {
    const radius = (halo / 4) * ring;
    context.fillStyle = `rgba(92, 232, 154, ${0.09 * brightness})`;
    context.beginPath();
    context.arc(centre.x, centre.y, radius, 0, TAU);
    context.fill();
  }
  const half = tile * 0.34;
  const top = centre.y - tile * 0.42;
  const bottom = centre.y + tile * 0.42;
  context.fillStyle = EXIT;
  context.beginPath();
  // The arch itself: a filled round head over two jambs, so the silhouette
  // reads as an opening at any tile size.
  context.arc(centre.x, top + half, half, 0, TAU);
  context.fill();
  context.fillRect(centre.x - half, top + half, tile * 0.14, bottom - top);
  context.fillRect(centre.x + half - tile * 0.14, top + half, tile * 0.14, bottom - top);
  context.fillStyle = blend(CANVAS_PALETTE.background, EXIT, brightness);
  context.fillRect(centre.x - half + tile * 0.14, top + half * 0.4, tile * 0.52, bottom - top);
}

function drawCoin(context, centre, tile) {
  context.fillStyle = COIN;
  context.beginPath();
  context.arc(centre.x, centre.y, tile * 0.24, 0, TAU);
  context.fill();
  context.fillStyle = COIN_CORE;
  context.beginPath();
  context.arc(centre.x - tile * 0.06, centre.y - tile * 0.06, tile * 0.09, 0, TAU);
  context.fill();
}

function drawWisp(context, centre, tile) {
  for (let ring = 3; ring >= 1; ring -= 1) {
    context.fillStyle = `rgba(138, 216, 255, ${0.1 * ring})`;
    context.beginPath();
    context.arc(centre.x, centre.y, (tile * 0.7 / 3) * ring, 0, TAU);
    context.fill();
  }
  context.fillStyle = WISP;
  context.beginPath();
  context.arc(centre.x, centre.y, tile * 0.18, 0, TAU);
  context.fill();
}

function drawHazard(context, centre, tile) {
  const reach = tile * 0.34;
  context.fillStyle = HAZARD;
  context.beginPath();
  context.arc(centre.x, centre.y, reach, 0, TAU);
  context.fill();
  // Four spikes: unlike the pickups, a hazard is spiky rather than round.
  context.fillRect(centre.x - tile * 0.06, centre.y - reach * 1.5, tile * 0.12, reach * 3);
  context.fillRect(centre.x - reach * 1.5, centre.y - tile * 0.06, reach * 3, tile * 0.12);
}

function drawWalker(context, centre, tile, brightness) {
  const dim = brightness > 0.05 ? 1 : 0.7;
  for (let ring = 3; ring >= 1; ring -= 1) {
    context.fillStyle = `rgba(255, 244, 200, ${0.13 * ring * dim})`;
    context.beginPath();
    context.arc(centre.x, centre.y, (tile * 0.8 / 3) * ring, 0, TAU);
    context.fill();
  }
  context.fillStyle = WALKER;
  context.beginPath();
  context.arc(centre.x, centre.y, tile * 0.16, 0, TAU);
  context.fill();
}

// The light meter and the wisp count live on the canvas, because the cabinet's
// Score readout is already spent on coins. Neither line shows a total: the
// player learns how many they have, never how many exist.
function drawReadouts(context, model) {
  const left = 20;
  const barWidth = 190;
  const barY = 32;
  context.fillStyle = CANVAS_PALETTE.background;
  context.fillRect(left, barY - 8, barWidth + 8, 20);
  context.fillStyle = "#1e293b";
  context.fillRect(left, barY, barWidth, 8);
  const share = Math.max(0, Math.min(1, model.light / model.lightMax));
  context.fillStyle = share < 0.25 ? HAZARD : CANVAS_PALETTE.warning;
  context.fillRect(left, barY, barWidth * share, 8);
  drawText(context, `Light ${Math.round(model.light)} of ${model.lightMax}`, left, 22, 13, CANVAS_PALETTE.warning);
  // The maze count is the headline of a chained run, so it shares the readout
  // rather than hiding in a corner. Score stays coins, as it is everywhere.
  const cleared = model.side === "continue" ? `Mazes ${model.mazesCleared} · ` : "";
  drawText(context, `${cleared}Wisps ${model.wispsCollected}`, BOARD_WIDTH - 20, 22, 13, CANVAS_PALETTE.accent, "right");
  if (share <= 0 && !model.revealed()) drawText(context, "NO LIGHT", BOARD_WIDTH / 2, BOARD_HEIGHT - 36, 14, HAZARD, "center");
  drawText(context, model.statusText(), left, BOARD_HEIGHT - 14, 13, CANVAS_PALETTE.secondary);
  const hint = model.lit() ? "Standing still — the lamp is lit." : "Dark — arrows or WASD to walk.";
  drawText(context, hint, BOARD_WIDTH / 2, 22, 12, CANVAS_PALETTE.muted, "center");
}