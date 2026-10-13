import { CANVAS_PALETTE, drawText } from "../../rendering.js";
import { BOARD_WIDTH, BOARD_HEIGHT, EMPTY, X, O, TWIST_TUNING } from "./model.js";

// Colours that are drawn rather than announced. The contract for text is the
// shared palette and its 4.5:1 threshold; these only ever fill shapes.
const CELL_EMPTY = "#101a2e";
const CELL_TAKEN = "#16233c";
const GRID = "#243349";
const WIN = "#fbbf24";
const LAST_MOVE = "#f8fafc";

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
  drawLastMove(context, model, layout, tile);
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
    context.save();
    context.translate(centreX, centreY);
    context.rotate(Math.PI / 4);
    context.fillRect(-reach, -tile * 0.055, reach * 2, tile * 0.11);
    context.restore();
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

// A dot in the corner of the cell just played, so the eye has somewhere to
// return to. Deliberately small: it is a memory aid, not a highlight.
function drawLastMove(context, model, layout, tile) {
  if (model.lastMove < 0) return;
  const rect = cellRect(layout, model.lastMove, model);
  context.fillStyle = LAST_MOVE;
  context.globalAlpha = 0.85;
  context.beginPath();
  context.arc(rect.x + rect.size * 0.19, rect.y + rect.size * 0.19, Math.max(2, tile * 0.045), 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

// Corner brackets rather than an outline. An outline would look like the win
// highlight and the cell border, and a dashed one needs a drawing call no other
// view in the cabinet makes. Brackets are the conventional "this is selected"
// shape and read as a cursor from across the board.
function drawCursor(context, model, layout) {
  if (model.cells[model.cursor] !== EMPTY || model.lastMove === model.cursor) return;
  const rect = cellRect(layout, model.cursor, model);
  context.fillStyle = CANVAS_PALETTE.secondary;
  const arm = Math.max(3, rect.size * 0.26);
  const edge = Math.max(2, rect.size * 0.045);
  const near = 4;
  const far = rect.size - near;
  for (const [x, y, dx, dy] of [
    [near, near, 1, 1], [far, near, -1, 1],
    [near, far, 1, -1], [far, far, -1, -1]
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
    drawText(context, "Placing a mark turns over every diagonal neighbour", centreX, centreY - 6, 17, CANVAS_PALETTE.warning, "center");
    // Stated without naming X or O, because the human is not always X and the
    // rule is about whose mark it is, not which letter is on the board.
    drawText(context, "yours become theirs and theirs become yours — empty cells stay empty", centreX, centreY + 20, 13, CANVAS_PALETTE.secondary, "center");
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