import { CANVAS_PALETTE, drawText } from "../../rendering.js";
import { BOARD_WIDTH, BOARD_HEIGHT, EMPTY, X, O, TWIST_TUNING } from "./model.js";

// Colours that are drawn rather than announced. The contract for text is the
// shared palette and its 4.5:1 threshold; these only ever fill shapes.
const CELL_EMPTY = "#101a2e";
const CELL_TAKEN = "#16233c";
const GRID = "#243349";
const WIN = "#fbbf24";

// The two marks are told apart by hue and by shape, never by colour alone: X is
// drawn as a cross and O as a ring, so the board is still readable to a player
// who cannot separate the two hues.
const MARK_COLOURS = Object.freeze({ [X]: CANVAS_PALETTE.accent, [O]: CANVAS_PALETTE.human });

function markLabel(mark) {
  return mark === X ? "X" : "O";
}

function cellRect(layout, cell, model) {
  return {
    x: layout.originX + (cell % model.cols) * layout.tile,
    y: layout.originY + Math.floor(cell / model.cols) * layout.tile,
    size: layout.tile
  };
}

export function draw(model, context) {
  context.fillStyle = CANVAS_PALETTE.background;
  context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  const layout = model.layout();
  const { tile } = layout;
  const preview = model.previewCell();
  const winning = model.outcome ? new Set(model.outcome.cells) : null;

  for (let cell = 0; cell < model.cells.length; cell += 1) {
    const rect = cellRect(layout, cell, model);
    const mark = model.cells[cell];
    context.fillStyle = mark === EMPTY ? CELL_EMPTY : CELL_TAKEN;
    context.fillRect(rect.x + 1, rect.y + 1, rect.size - 2, rect.size - 2);
    if (mark !== EMPTY) drawMark(context, rect, mark, tile);
  }

  // A translucent tint over the marks rather than under them. Under would be
  // hidden by the cell's own fill, and over at full strength would hide the very
  // letter the player needs to read: that cell, the one about to change hands.
  if (preview >= 0) drawPreview(context, model, layout, preview, tile);

  drawGrid(context, model, layout);
  drawFlashes(context, model, layout);
  if (winning) drawWin(context, model, layout, winning, tile);
  drawCursor(context, model, layout);

  drawHeader(context, model);
  drawFooter(context, model, layout);
}

function drawGrid(context, model, layout) {
  const { tile, originX, originY } = layout;
  context.fillStyle = GRID;
  for (let x = 1; x < model.cols; x += 1) context.fillRect(originX + x * tile - 1, originY, 2, tile * model.rows);
  for (let y = 1; y < model.rows; y += 1) context.fillRect(originX, originY + y * tile - 1, tile * model.cols, 2);
}

// An X as two crossing strokes and an O as a ring, rather than two letters that
// differ only in colour. Glyph text at this size reads as a blob on a phone, and
// the ring is the only one of the four shapes that still reads at a glance.
function drawMark(context, rect, mark, tile) {
  const centreX = rect.x + rect.size / 2;
  const centreY = rect.y + rect.size / 2;
  const reach = tile * 0.28;
  context.fillStyle = MARK_COLOURS[mark];
  if (mark === X) {
    const bar = tile * 0.11;
    // Two bars at right angles, which is what makes it an X. One bar rotated
    // forty-five degrees is a slash. Each bar is drawn at an absolute angle from
    // its own save: rotating twice in sequence would compound them, and a
    // cross drawn that way is a diagonal meeting a horizontal bar.
    for (const turn of [Math.PI / 4, (Math.PI * 3) / 4]) {
      context.save();
      context.translate(centreX, centreY);
      context.rotate(turn);
      context.fillRect(-reach, -bar / 2, reach * 2, bar);
      context.restore();
    }
  } else {
    context.lineWidth = tile * 0.11;
    context.strokeStyle = MARK_COLOURS[mark];
    context.beginPath();
    context.arc(centreX, centreY, reach, 0, Math.PI * 2);
    context.stroke();
  }
}

// What the marked cell would turn over, shown before it happens.
//
// Each affected cell is tinted with the colour it would become rather than a
// single "this will change" colour, because the difference is the whole
// decision: a cell turning to your own mark is a gift and a cell turning away
// from it is the move that lost you the game four turns later.
function drawPreview(context, model, layout, preview, tile) {
  const target = cellRect(layout, preview, model);
  context.strokeStyle = CANVAS_PALETTE.warning;
  context.lineWidth = 2;
  context.strokeRect(target.x + 2, target.y + 2, target.size - 4, target.size - 4);

  for (const near of model.diagonals[preview]) {
    const before = model.cells[near];
    if (before === EMPTY) continue;
    const rect = cellRect(layout, near, model);
    context.fillStyle = MARK_COLOURS[3 - before];
    context.globalAlpha = 0.3;
    context.fillRect(rect.x + 1, rect.y + 1, rect.size - 2, rect.size - 2);
    context.globalAlpha = 1;
  }
  drawMark(context, target, model.turn, tile);
}

// The turns that actually happened, fading out. Drawn over the marks rather
// than under them so a cell is unmistakably the one that just changed.
function drawFlashes(context, model, layout) {
  if (!model.flash.size) return;
  for (const [cell, remaining] of model.flash) {
    const rect = cellRect(layout, cell, model);
    const mark = model.cells[cell];
    const amount = Math.max(0, Math.min(1, remaining / TWIST_TUNING.flipFlash));
    context.fillStyle = MARK_COLOURS[mark];
    context.globalAlpha = amount * 0.55;
    context.fillRect(rect.x + 1, rect.y + 1, rect.size - 2, rect.size - 2);
    context.globalAlpha = 1;
    context.strokeStyle = MARK_COLOURS[mark];
    context.lineWidth = 2;
    context.strokeRect(rect.x + 2, rect.y + 2, rect.size - 4, rect.size - 4);
  }
}

// The winning line, filled and struck through. Filling alone says "these three
// mattered"; the stroke says which way they run, which is the thing a player
// wants to see so they can avoid it next round.
function drawWin(context, model, layout, winning, tile) {
  for (const cell of winning) {
    const rect = cellRect(layout, cell, model);
    context.fillStyle = WIN;
    context.globalAlpha = 0.22;
    context.fillRect(rect.x + 1, rect.y + 1, rect.size - 2, rect.size - 2);
    context.globalAlpha = 1;
    context.strokeStyle = WIN;
    context.lineWidth = 2;
    context.strokeRect(rect.x + 2, rect.y + 2, rect.size - 4, rect.size - 4);
  }
  const ordered = [...winning].sort((a, b) => (a % model.cols) - (b % model.cols) || Math.floor(a / model.cols) - Math.floor(b / model.cols));
  const first = cellRect(layout, ordered[0], model);
  const last = cellRect(layout, ordered[ordered.length - 1], model);
  context.strokeStyle = WIN;
  context.lineWidth = Math.max(2, tile * 0.05);
  context.globalAlpha = 0.85;
  context.beginPath();
  context.moveTo(first.x + first.size / 2, first.y + first.size / 2);
  context.lineTo(last.x + last.size / 2, last.y + last.size / 2);
  context.stroke();
  context.globalAlpha = 1;
}

// The keyboard cursor, and only that. A pointer sitting over the board is the
// cursor already, and marking the cell as well made the centre of a fresh board
// look like a marked-up cell rather than an empty one. Nor is it drawn once the
// round is over, where it would sit exactly where the host draws its result box.
function drawCursor(context, model, layout) {
  if (!model.cursorVisible) return;
  const rect = cellRect(layout, model.cursor, model);
  context.fillStyle = CANVAS_PALETTE.muted;
  const arm = Math.max(3, rect.size * 0.17);
  const edge = Math.max(1.5, rect.size * 0.03);
  const near = rect.x + 5;
  const far = rect.x + rect.size - 5;
  const top = rect.y + 5;
  const bottom = rect.y + rect.size - 5;
  // Each corner is an arm along one edge and a thickness along the other. The
  // x and y are relative to the cell, which is why they are offset by the cell
  // here: drawing them in the cell's own coordinates pins the cursor to the top
  // left of the canvas instead of to the cell it belongs to.
  for (const [x, y, dx, dy] of [
    [near, top, 1, 1], [far, top, -1, 1],
    [near, bottom, 1, -1], [far, bottom, -1, -1]
  ]) {
    context.fillRect(x - (dx < 0 ? arm : 0), y - (dy < 0 ? edge : 0), arm, edge);
    context.fillRect(x - (dx < 0 ? edge : 0), y - (dy < 0 ? arm : 0), edge, arm);
  }
}

function drawHeader(context, model) {
  // Once a line has been taken there is nobody to move, and a board still
  // announcing "X to move" over a finished game reads as a game that has not
  // noticed it ended.
  const over = model.over;
  drawText(context, over ? "Round over" : `${markLabel(model.turn)} to move`, 20, 34, 20,
    over ? CANVAS_PALETTE.warning : MARK_COLOURS[model.turn]);
  drawText(context, `${model.cols}×${model.rows} · ${model.line} in a row`, BOARD_WIDTH - 20, 32, 14, CANVAS_PALETTE.secondary, "right");
}

function drawFooter(context, model, layout) {
  const centreX = BOARD_WIDTH / 2;
  // The rule is invisible until it has cost a mark, so it is said once, on the
  // board, and then it is never said again. An instruction that never goes away
  // stops being read.
  if (model.hintRemaining > 0 && !model.over) {
    const centreY = layout.originY + (layout.tile * model.rows) / 2;
    drawText(context, "A mark turns over every mark diagonally beside it", centreX, centreY - 6, 17, CANVAS_PALETTE.warning, "center");
    drawText(context, "each one becomes the other mark — empty cells stay empty", centreX, centreY + 20, 14, CANVAS_PALETTE.secondary, "center");
  }
  drawText(context, model.statusText(), 20, BOARD_HEIGHT - 16, 13, CANVAS_PALETTE.secondary);
  // Which move is being offered, because with the preview on the placement is
  // two gestures and the player needs to know which one a tap currently is.
  const verb = model.over
    ? ""
    : model.previewEnabled
      ? "tap to pin the flips · hold to place"
      : "click or Space to place";
  if (verb) drawText(context, verb, BOARD_WIDTH - 20, BOARD_HEIGHT - 16, 13, CANVAS_PALETTE.muted, "right");
}