import { installEvents } from "../../events.js";

// Tic Tac Toe Twist looks like tic-tac-toe and is not. Placing a mark turns over every cell
// diagonally adjacent to it -- your own marks become your opponent's and theirs
// become yours -- and the line that wins is the one that exists when the move
// settles, whoever happens to be holding it. A move can therefore hand the
// opponent the game, which is the whole game and the reason a preview is worth
// having.

// The drawing surface is the same fixed 800x560 canvas every other game uses,
// which CSS scales. The model works in cells and never learns a pixel size; the
// view converts through layout().
export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 560;

// Bands reserved above and below the board for the turn readout and the hint.
export const TWIST_TOP = 52;
export const TWIST_BOTTOM = 48;

export const EMPTY = 0;
export const X = 1;
export const O = 2;

// Feel, not content. Exported and frozen so a test can assert the model never
// writes to them, and so a designer can reach them without hunting.
export const TWIST_TUNING = Object.freeze({
  // A tap toggles the preview and a hold places, so a press has to be measured
  // rather than read. This is the same threshold Lamp uses for its hold, chosen
  // because it is already the cabinet's idea of "deliberate".
  holdDelay: 0.3,
  // How long a turned-over cell keeps pulsing. Long enough to catch with the eye
  // on the way back to the cell you played, short enough that it never becomes
  // permanent decoration.
  flipFlash: 0.5,
  // The computer waits before it moves even when it has already decided. A move
  // that lands the instant your own lands feels like the board played itself,
  // and the pause is what makes it feel like an opponent thinking.
  computerPause: 0.5,
  // The rule is invisible until it has cost you a mark, so it is stated once, on
  // the board, for the first few seconds of every round. It expires on purpose:
  // an instruction that never goes away stops being read.
  hintSeconds: 8,
  // A win is worth more than any line weight, so the search can tell a forced
  // win from a merely hopeful position without a table lookup.
  winScore: 1_000_000
});

// The three ways to play. The cabinet gives every game one dropdown, so the
// opponent choice and the "who starts" choice are two entries of the same list
// rather than a dropdown plus a second control.
export const TWIST_MODES = [
  { value: "duo", label: "Two players — X and O on this device" },
  { value: "first", label: "Computer is X — you are O" },
  { value: "second", label: "You are X — computer is O" }
];

export const TWIST_SETTINGS = {
  cols: { label: "Board width", min: 3, max: 7, step: 1, default: 3 },
  rows: { label: "Board height", min: 3, max: 7, step: 1, default: 3 },
  // The objective is bounded by the board: a line cannot be longer than the
  // shortest side. validateSettings() clamps rather than refusing, so shrinking
  // the board never leaves the shell showing a number the game cannot honour.
  line: { label: "In a row to win", min: 3, max: 7, step: 1, default: 3 },
  // Off by default. With preview off, a tap places and the flips are a surprise
  // you learn from -- which is the trap the game is built on. Turning it on
  // makes the mechanic inspectable, at the cost of a two-step move.
  preview: { type: "checkbox", label: "Show the flips before you place", default: false }
};

// Worth of a line holding `count` of one mark and none of the other. Rising
// steeply, because a line one mark from completion is worth far more than the
// same number of marks scattered across different lines.
const LINE_WEIGHTS = Object.freeze([0, 1, 4, 18, 60, 200, 620, 1800]);

// How deep the computer looks. One number, for every board.
//
// This is the whole difficulty design, and it is deliberately a shallow one.
// The reference solver proves the small boards exactly: 3x3 with a line of 3 is
// a draw, 4x4 with a line of 3 is a first-player win, and 4x4 with a line of 4
// is a second-player win. A computer that found those would be playing a
// different game from the one the player is playing.
//
// So it is shallow on purpose: two plies, which is just enough to see the
// pattern this game is actually about -- a placement that turns over an
// opponent's threat and builds one of your own in the same move.
//
// Deeper is measurably *worse*, not better, and it is worth saying why rather
// than shipping the first number that was tried. The evaluation counts marks in
// live lines, and here that is not a measure of goodness: a placement can be
// the losing move precisely because it builds a line. Looking further ahead
// trusts that count more, so it walks into positions the shallow search refuses.
// Measured over 400 games of each on the default board, against another engine
// using the same code, depth 2 draws every game and depth 5 draws every game --
// both matching the proven value -- while depths 3, 4, 6 and 7 lose badly.
// Depth 2 is also the cheapest, so the shallow setting wins twice.
//
// Nothing about its imperfection is injected at random: it never picks a worse
// move on purpose, so losing to it still feels like out-thinking it.
const SEARCH_DEPTH = 2;

const DIAGONALS = Object.freeze([[-1, -1], [1, -1], [-1, 1], [1, 1]]);

const markName = (mark) => (mark === X ? "X" : "O");

export class TwistModel {
  constructor() {
    installEvents(this);
    this.id = "twist";
    this.title = "Tic Tac Toe Twist";
    this.description = "It looks like tic-tac-toe and it is not. Place your mark on an empty cell and every cell diagonally adjacent to it turns over: your marks become your opponent's and theirs become yours. Empty cells stay empty. Then look for a line. Whoever is holding a line when the move settles has won -- including when your own flip handed it to them. First to get the chosen number in a row takes the game.";
    this.side = "duo";
    this.gameOver = false;
    this.lifeLost = false;
    this.won = false;
    // A drawn board has no loser. The host reaches gameOver for a draw exactly
    // as it does for a loss, so this is what lets the facade stay quiet.
    this.drew = false;
    this.pendingSettings = { cols: 3, rows: 3, line: 3, preview: false };
    this.roundSettings = { ...this.pendingSettings };
    this.cells = new Uint8Array(9);
    this.turn = X;
    this.lastMove = -1;
    this.cursor = 4;
    this.hover = -1;
    this.pinned = -1;
    this.flash = new Map();
    this.outcome = null;
    this.hintRemaining = TWIST_TUNING.hintSeconds;
    this.computerPause = 0;
    // Positions the last search looked at. Not used to make a decision -- the
    // tree is bounded by the board and the depth, not by a node budget -- but
    // recorded so a test can assert that bound instead of trusting a stopwatch.
    this.searchNodes = 0;
    this.applyPendingSettings();
  }

  get modes() { return TWIST_MODES; }
  get sides() { return TWIST_MODES.map((mode) => mode.value); }
  get settings() { return TWIST_SETTINGS; }
  get over() { return this.gameOver || this.won; }
  get size() { return this.cols * this.rows; }
  // 0 means neither side is the computer, which is the two-player mode.
  get computerMark() {
    if (this.side === "first") return X;
    if (this.side === "second") return O;
    return EMPTY;
  }
  get humanMark() { return this.computerMark ? 3 - this.computerMark : EMPTY; }
  get computerTurn() { return !this.over && this.computerMark !== EMPTY && this.turn === this.computerMark; }

  sideLabel() { return this.modes.find((mode) => mode.value === this.side)?.label || TWIST_MODES[0].label; }
  // The host restarts the round itself when the side changes, so this only
  // records the choice. Changing it mid-game would swap who is sitting where,
  // which is not a thing a board of marks can do halfway through.
  setSide(side) { if (this.sides.includes(side)) this.side = side; }

  // ---------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------

  // The objective is clamped rather than refused. A player who widens the board
  // to 7 while asking for a line of 5 gets a line of 5; a player who then
  // narrows the board to 3 gets a line of 3, and never a board that cannot be
  // won. Refusing would instead leave the shell showing a number the game is
  // quietly ignoring, which is the worse of the two failures.
  validateSettings(values = {}) {
    const read = (name) => {
      const descriptor = TWIST_SETTINGS[name];
      const value = Number(values[name]);
      if (!Number.isInteger(value) || value < descriptor.min || value > descriptor.max) return null;
      return value;
    };
    const cols = values.cols === undefined ? this.pendingSettings.cols : read("cols");
    const rows = values.rows === undefined ? this.pendingSettings.rows : read("rows");
    if (cols === null || rows === null) return null;
    const wanted = values.line === undefined ? this.pendingSettings.line : read("line");
    if (wanted === null) return null;
    const line = Math.min(wanted, cols, rows);
    const preview = values.preview === undefined ? this.pendingSettings.preview : Boolean(values.preview);
    return { cols, rows, line, preview };
  }

  setSettings(settings = {}) {
    const validated = this.validateSettings({ ...this.pendingSettings, ...settings });
    if (!validated) return false;
    this.pendingSettings = validated;
    return true;
  }

  applyPendingSettings() {
    this.roundSettings = { ...this.pendingSettings };
    this.cols = this.roundSettings.cols;
    this.rows = this.roundSettings.rows;
    this.line = this.roundSettings.line;
    this.previewEnabled = this.roundSettings.preview;
    this.cells = new Uint8Array(this.cols * this.rows);
    this.buildGeometry();
  }

  // ---------------------------------------------------------------
  // Board geometry
  // ---------------------------------------------------------------

  index(x, y) { return y * this.cols + x; }
  columnOf(cell) { return cell % this.cols; }
  rowOf(cell) { return Math.floor(cell / this.cols); }

  buildGeometry() {
    const { cols, rows, line } = this;
    const size = cols * rows;
    const diagonals = [];
    for (let cell = 0; cell < size; cell += 1) {
      const x = this.columnOf(cell);
      const y = this.rowOf(cell);
      const near = [];
      for (const [dx, dy] of DIAGONALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) near.push(this.index(nx, ny));
      }
      diagonals.push(near);
    }
    this.diagonals = diagonals;

    // Every contiguous run of `line` cells along each of the four directions,
    // kept as index arrays. A board is at most 7x7, so a plain array is both
    // simpler and fast enough -- there is no reason to reach for a bitmask.
    const lines = [];
    const run = (x, y, dx, dy) => {
      const cells = [];
      for (let step = 0; step < line; step += 1) cells.push(this.index(x + dx * step, y + dy * step));
      lines.push(cells);
    };
    for (let y = 0; y < rows; y += 1) for (let x = 0; x + line <= cols; x += 1) run(x, y, 1, 0);
    for (let x = 0; x < cols; x += 1) for (let y = 0; y + line <= rows; y += 1) run(x, y, 0, 1);
    for (let y = 0; y + line <= rows; y += 1) for (let x = 0; x + line <= cols; x += 1) run(x, y, 1, 1);
    for (let y = 0; y + line <= rows; y += 1) for (let x = line - 1; x < cols; x += 1) run(x, y, -1, 1);
    this.lines = lines;

    // The reverse index that makes a terminal check cheap: after a move, only
    // the lines through the played cell and through the cells it turned over can
    // have changed, and this says which those are.
    const through = Array.from({ length: size }, () => []);
    lines.forEach((cells, number) => {
      for (const cell of cells) through[cell].push(number);
    });
    this.linesThrough = through;

    // Centrality, used to order the computer's moves. A centre cell turns over
    // four neighbours and sits on more lines than a corner, so it is both the
    // most powerful cell on the board and the most dangerous one.
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const centrality = new Float64Array(size);
    for (let cell = 0; cell < size; cell += 1) {
      const dx = this.columnOf(cell) - cx;
      const dy = this.rowOf(cell) - cy;
      centrality[cell] = -(dx * dx + dy * dy);
    }
    this.centrality = centrality;

    // A stamp per line rather than a Set per check: the search asks this
    // question tens of thousands of times and allocating for it would dominate.
    this.lineStamp = new Int32Array(lines.length);
    this.stamp = 0;

    this.cursor = this.index(Math.floor(cols / 2), Math.floor(rows / 2));
    this.hover = -1;
    this.pinned = -1;
  }

  layout() {
    const width = BOARD_WIDTH - 48;
    const height = BOARD_HEIGHT - TWIST_TOP - TWIST_BOTTOM;
    const tile = Math.min(width / this.cols, height / this.rows);
    return {
      tile,
      width,
      height,
      originX: (BOARD_WIDTH - tile * this.cols) / 2,
      originY: TWIST_TOP + (height - tile * this.rows) / 2
    };
  }

  // The cell under a canvas point, or -1 outside the board. Lives in the model
  // so that "does a click land where it looks like it lands" is a question a
  // test can ask of one implementation rather than two that might disagree.
  cellAt(x, y) {
    const { tile, originX, originY } = this.layout();
    if (tile <= 0) return -1;
    const col = Math.floor((x - originX) / tile);
    const row = Math.floor((y - originY) / tile);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    return this.index(col, row);
  }

  // The cells the pointer is over, for the keyboard cursor.
  moveCursor(dx, dy) {
    if (!dx && !dy) return;
    const col = Math.max(0, Math.min(this.cols - 1, this.columnOf(this.cursor) + dx));
    const row = Math.max(0, Math.min(this.rows - 1, this.rowOf(this.cursor) + dy));
    this.cursor = this.index(col, row);
  }

  // Which cell the preview is showing, if any. A pinned cell wins over a hover,
  // so a player can tap a cell and then move the pointer away to think about it.
  // With nothing pinned the pointer wins, and with no pointer over the board the
  // keyboard cursor is previewed instead -- otherwise turning the preview on
  // would help exactly the players it is least needed by.
  previewCell() {
    if (this.pinned >= 0) return this.pinned;
    if (!this.previewEnabled) return -1;
    if (this.hover >= 0 && this.isEmpty(this.hover)) return this.hover;
    return this.isEmpty(this.cursor) ? this.cursor : -1;
  }

  isEmpty(cell) { return cell >= 0 && cell < this.cells.length && this.cells[cell] === EMPTY; }

  // ---------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------

  // Puts a mark down and turns over the diagonal neighbours. Returns the cells
  // that changed other than the one played, which is what the flash animates
  // and what the terminal check has to look at.
  applyMove(cells, cell, mark) {
    cells[cell] = mark;
    const turned = [];
    for (const near of this.diagonals[cell]) {
      if (cells[near] === EMPTY) continue;
      cells[near] = 3 - cells[near];
      turned.push(near);
    }
    return turned;
  }

  undoMove(cells, cell, turned) {
    cells[cell] = EMPTY;
    // The cells are holding the opposite of what they held, so turning them
    // over again puts them back.
    for (const near of turned) cells[near] = 3 - cells[near];
  }

  // Every line the move could have disturbed: those through the played cell and
  // through each cell it turned over. Lines elsewhere did not change, so they
  // cannot have changed their answer.
  touchedLines(changed) {
    this.stamp += 1;
    const stamp = this.stamp;
    const numbers = [];
    for (const cell of changed) {
      for (const number of this.linesThrough[cell]) {
        if (this.lineStamp[number] === stamp) continue;
        this.lineStamp[number] = stamp;
        numbers.push(number);
      }
    }
    return numbers;
  }

  lineHeldBy(cells, numbers, mark) {
    for (const number of numbers) {
      const cellsInLine = this.lines[number];
      let held = true;
      for (const cell of cellsInLine) {
        if (cells[cell] !== mark) { held = false; break; }
      }
      if (held) return cellsInLine;
    }
    return null;
  }

  // The winner is whoever is holding a line, not whoever played the move.
  //
  // That is the rule the flips force: a turn-over can complete your opponent's
  // row as easily as your own, and deciding it any other way would make the
  // most interesting move in the game a free one for the other side. Where a
  // single move leaves both sides holding a line, the player who moved is
  // credited with it -- they completed the line the game ended on, and crediting
  // the opponent for a line the mover could equally have made is a coin toss
  // dressed up as a rule.
  checkOutcome(cells, changed, mover) {
    const numbers = this.touchedLines(changed);
    const own = this.lineHeldBy(cells, numbers, mover);
    if (own) return { winner: mover, cells: own };
    const other = this.lineHeldBy(cells, numbers, 3 - mover);
    if (other) return { winner: 3 - mover, cells: other };
    return null;
  }

  // ---------------------------------------------------------------
  // Play
  // ---------------------------------------------------------------

  reset() {
    this.clearEvents();
    this.applyPendingSettings();
    this.turn = X;
    this.lastMove = -1;
    this.hover = -1;
    this.pinned = -1;
    this.flash.clear();
    this.outcome = null;
    this.gameOver = false;
    this.lifeLost = false;
    this.won = false;
    this.drew = false;
    this.hintRemaining = TWIST_TUNING.hintSeconds;
    // The computer does not move the instant the board appears, even when it
    // opens the game.
    this.computerPause = this.computerTurn ? TWIST_TUNING.computerPause : 0;
  }

  place(cell, mark = this.turn) {
    if (this.over || !this.isEmpty(cell)) return false;
    const turned = this.applyMove(this.cells, cell, mark);
    this.lastMove = cell;
    this.pinned = -1;
    // The hover is cleared because it described a board that no longer exists:
    // the flips it showed have already happened.
    this.hover = -1;
    this.emit("place");

    if (turned.length) {
      for (const near of turned) this.flash.set(near, TWIST_TUNING.flipFlash);
      // A centre cell rearranging four marks is a different event from one or
      // two turning over, and the player should hear the difference as well as
      // see it: the size of the change is the decision being made.
      if (turned.length >= 3) this.emit("turn");
      else this.emit("flip");
    }

    const changed = [cell, ...turned];
    const outcome = this.checkOutcome(this.cells, changed, mark);
    if (outcome) {
      this.settle(outcome);
      return true;
    }

    let filled = true;
    for (const value of this.cells) if (value === EMPTY) { filled = false; break; }
    if (filled) {
      this.settle(null);
      return true;
    }

    this.turn = 3 - mark;
    if (this.computerTurn) this.computerPause = TWIST_TUNING.computerPause;
    return true;
  }

  settle(outcome) {
    this.outcome = outcome ? { ...outcome } : null;
    this.hintRemaining = 0;
    const winner = outcome ? outcome.winner : EMPTY;
    // The outcome is announced here rather than left to the facade's won/gameOver
    // setters, because a model setting its own flags never passes through them:
    // the host's setters only fire on a false-to-true transition that this method
    // has already made.
    //
    // The sound follows who was playing. With the computer in the game, winning
    // and losing are the player's own and are told apart. With two players on
    // one device there is no "you" to lose, and the honest reading of a line
    // appearing is that the game was won -- so both outcomes are a win here, and
    // the result headline names the mark that took it.
    if (!winner) {
      this.drew = true;
      this.emit("draw");
      this.gameOver = true;
      return;
    }
    if (this.humanMark && winner === this.humanMark) {
      this.won = true;
      this.emit("win");
      return;
    }
    this.emit(this.humanMark ? "lose" : "win");
    this.gameOver = true;
  }

  // The host asks for this when it ends a round, and the answer replaces its own
  // "Out of lives" wording, which would be nonsense for a board with no lives.
  handleLifeLoss() {
    return { gameOver: true, message: this.outcomeMessage() };
  }

  // The one clause that names the result, with no instruction attached. The host
  // prints its own "press New game" line underneath the overlay, so repeating it
  // here just says the same thing twice in the same box.
  outcomeLine() {
    if (this.drew || !this.outcome) return "The board filled with no line";
    return `${markName(this.outcome.winner)} takes ${this.describeLine(this.outcome.cells)}`;
  }

  // One sentence naming what ended the game. A player who has just lost needs to
  // know which row betrayed them, not which three cells did.
  outcomeMessage() {
    const line = this.outcomeLine();
    if (!this.outcome) return `${line}. Nobody wins — press New game to try again.`;
    const yours = this.humanMark ? (this.outcome.winner === this.humanMark ? "you win" : "you lose") : "";
    return `${line}${yours ? ` — ${yours}` : ""}. Press New game to play again.`;
  }

  // Names the line in words rather than coordinates, so a player who has just lost
  // knows which row betrayed them. The whole game is about noticing lines, so a
  // result the player has to decode from numbers is a result they will forget.
  describeLine(cells) {
    const col = this.columnOf(cells[0]);
    const row = this.rowOf(cells[0]);
    const across = Math.abs(this.columnOf(cells[cells.length - 1]) - col);
    const down = Math.abs(this.rowOf(cells[cells.length - 1]) - row);
    // Equal non-zero steps in both axes is a diagonal. Testing for a single step
    // would only ever be true for a line of two cells and would report every
    // real diagonal as a column.
    if (across === down && across > 0) {
      return this.rowOf(cells[cells.length - 1]) > row
        ? `the diagonal from column ${col + 1}, row ${row + 1}`
        : `the diagonal from column ${this.columnOf(cells[cells.length - 1]) + 1}, row ${row + 1}`;
    }
    if (row === this.rowOf(cells[cells.length - 1])) return `row ${row + 1}`;
    return `column ${col + 1}`;
  }

  winMessage() {
    if (!this.outcome) return "";
    return `You take ${this.describeLine(this.outcome.cells)}.`;
  }

  // ---------------------------------------------------------------
  // The computer
  // ---------------------------------------------------------------

  searchDepth() {
    return SEARCH_DEPTH;
  }

  // Live lines only: a line already holding both marks can never be completed,
  // so counting it would inflate the board in a way no player believes in.
  liveLineCount(cells, mark) {
    const other = 3 - mark;
    let total = 0;
    for (const cellsInLine of this.lines) {
      let mine = 0;
      let theirs = 0;
      for (const cell of cellsInLine) {
        if (cells[cell] === mark) mine += 1;
        else if (cells[cell] === other) theirs += 1;
      }
      if (mine > 0 && theirs > 0) continue;
      total += LINE_WEIGHTS[Math.min(mine, LINE_WEIGHTS.length - 1)] - LINE_WEIGHTS[Math.min(theirs, LINE_WEIGHTS.length - 1)];
    }
    return total;
  }

  // How close an empty cell is to completing one of my lines. This is both the
  // evaluation of a single move and the move ordering for the search, which is
  // why the computer plays sensibly even one ply deep.
  moveRank(cells, cell, mark) {
    const other = 3 - mark;
    let rank = 0;
    for (const number of this.linesThrough[cell]) {
      let mine = 0;
      let theirs = 0;
      for (const inside of this.lines[number]) {
        if (cells[inside] === mark) mine += 1;
        else if (cells[inside] === other) theirs += 1;
      }
      if (theirs > 0) continue;
      rank += LINE_WEIGHTS[Math.min(mine, LINE_WEIGHTS.length - 1)];
    }
    return rank;
  }

  orderedMoves(cells, mark) {
    const scored = [];
    for (let cell = 0; cell < cells.length; cell += 1) {
      if (cells[cell] !== EMPTY) continue;
      // Centrality first, then threat. The centre turns over four neighbours,
      // so on this board the most powerful cell is also the most dangerous one
      // and the computer should look there early.
      scored.push({ cell, rank: this.centrality[cell] + this.moveRank(cells, cell, mark) });
    }
    scored.sort((a, b) => b.rank - a.rank);
    return scored.map((entry) => entry.cell);
  }

  negamax(cells, mark, depth, alpha, beta) {
    this.searchNodes += 1;
    const moves = this.orderedMoves(cells, mark);
    // No empty cell left is a draw, and it is a draw at any depth.
    if (!moves.length) return 0;
    if (depth <= 0) return this.liveLineCount(cells, mark);
    let best = -Infinity;
    for (const cell of moves) {
      const turned = this.applyMove(cells, cell, mark);
      const changed = [cell, ...turned];
      const outcome = this.checkOutcome(cells, changed, mark);
      let score;
      if (outcome) score = outcome.winner === mark ? TWIST_TUNING.winScore : -TWIST_TUNING.winScore;
      else score = -this.negamax(cells, 3 - mark, depth - 1, -beta, -alpha);
      this.undoMove(cells, cell, turned);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Picks the computer's move.
  //
  // The search runs on a copy of the board. Make/unmake on the live one would be
  // faster and is the usual choice, but it puts the game's own state one bug
  // away from being corrupted by a search that gave up early. A board is at
  // most 49 cells and the depth is 2 or 3, so the whole tree is bounded by a few
  // thousand positions -- fast enough to run inside a single frame with nothing
  // to budget, no timer and no way to overrun.
  chooseMove(mark = this.turn) {
    const cells = Uint8Array.from(this.cells);
    const depth = this.searchDepth();
    const scored = [];
    let alpha = -Infinity;
    this.searchNodes = 0;
    for (const cell of this.orderedMoves(cells, mark)) {
      const turned = this.applyMove(cells, cell, mark);
      const changed = [cell, ...turned];
      const outcome = this.checkOutcome(cells, changed, mark);
      let score;
      if (outcome) score = outcome.winner === mark ? TWIST_TUNING.winScore : -TWIST_TUNING.winScore;
      else score = -this.negamax(cells, 3 - mark, depth - 1, -Infinity, -alpha);
      this.undoMove(cells, cell, turned);
      scored.push({ cell, score });
      if (score > alpha) alpha = score;
      // Nothing beats a forced win, so the rest of the root is not worth
      // looking at. This is also what keeps the opening move cheap.
      if (alpha >= TWIST_TUNING.winScore) break;
    }
    if (!scored.length) return -1;
    // Equal-scoring moves are genuinely equal and the computer takes one of them
    // at random. That is the only randomness in its play: it never chooses a
    // worse move on purpose, so a loss to it is a loss, not a gift.
    let best = -Infinity;
    for (const entry of scored) if (entry.score > best) best = entry.score;
    const tied = scored.filter((entry) => entry.score === best);
    return tied[Math.floor(Math.random() * tied.length)].cell;
  }

  stepComputer(dt) {
    if (!this.computerTurn) return;
    this.computerPause = Math.max(0, this.computerPause - dt);
    if (this.computerPause > 0) return;
    const cell = this.chooseMove();
    // A full board has no move for anyone, and choosing -1 would be a write
    // into the cells array.
    if (cell < 0) return;
    this.place(cell, this.turn);
  }

  // ---------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------

  // The one act the controller can ask for. Keeping tap-versus-hold out of the
  // model is what lets the input be tested without a pointer and the rules
  // without a gesture.
  act(kind, cell) {
    if (this.over) return false;
    if (kind === "preview") {
      if (!this.previewEnabled || !this.isEmpty(cell)) return false;
      this.pinned = this.pinned === cell ? -1 : cell;
      return true;
    }
    if (kind === "place") return this.place(cell, this.turn);
    return false;
  }

  update(dt, input = {}) {
    // The flash decays even after the game is over, so the move that won is
    // still visibly turning over while the result is on screen.
    for (const [cell, remaining] of this.flash) {
      const left = remaining - dt;
      if (left <= 0) this.flash.delete(cell);
      else this.flash.set(cell, left);
    }
    if (this.over) {
      this.hintRemaining = 0;
      return;
    }
    if (this.hintRemaining > 0) this.hintRemaining = Math.max(0, this.hintRemaining - dt);
    if (input.hover !== undefined) this.hover = input.hover;
    if (input.move) this.moveCursor(input.move.x, input.move.y);
    if (input.act) this.act(input.act.kind, input.act.cell);
    this.stepComputer(dt);
  }

  // No score while the game is being played -- there is nothing to count -- and
  // the outcome once it is over. In two-player mode that is "X wins" rather than
  // a win and a loss, because on one device there is no "you".
  scoreText() {
    if (!this.over) return "";
    if (!this.outcome) return "Draw";
    return `${markName(this.outcome.winner)} wins`;
  }

  statusText() {
    if (this.won) return this.winMessage();
    if (this.over) return this.outcomeMessage();
    if (!this.computerMark) return `${markName(this.turn)} to move`;
    return `${markName(this.turn)} to move — ${this.computerTurn ? "Computer" : "You"}`;
  }

  publicState() {
    return {
      title: this.title,
      description: this.description,
      side: this.sideLabel(),
      status: this.statusText()
    };
  }
}