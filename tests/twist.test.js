import test from "node:test";
import assert from "node:assert/strict";
import { TwistGame } from "../src/games/twist.js";
import { TwistModel, TWIST_TUNING } from "../src/games/twist/model.js";

const board = (cols, rows, marks = {}, line = 3) => {
  const model = new TwistModel();
  model.setSettings({ cols, rows, line, preview: false });
  model.reset();
  for (const [cell, mark] of Object.entries(marks)) model.cells[Number(cell)] = mark;
  return model;
};
const grid = (model) => {
  const rows = [];
  for (let y = 0; y < model.rows; y += 1) {
    let line = "";
    for (let x = 0; x < model.cols; x += 1) line += [".", "X", "O"][model.cells[y * model.cols + x]];
    rows.push(line);
  }
  return rows.join(" / ");
};
const seeded = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
// The reference implementation's rule set, transcribed independently of the
// model: a mark is placed, then every diagonal neighbour holding a mark turns
// over. The differential tests below check the model against this rather than
// against itself, which would agree with any bug it shares with its own helper.
const referenceFlip = (cells, diagonals, cell, mark) => {
  const next = [...cells];
  next[cell] = mark;
  for (const near of diagonals[cell]) {
    if (next[near] === 0) continue;
    next[near] = 3 - next[near];
  }
  return next;
};
const referenceWins = (cells, lines, mark) => lines.some((line) => line.every((cell) => cells[cell] === mark));

// ---------------------------------------------------------------------
// The rule the whole game is
// ---------------------------------------------------------------------

test("placing a mark turns over every diagonal neighbour and leaves empty cells alone", () => {
  const model = board(3, 3);
  model.place(4, 1);
  assert.equal(grid(model), "... / .X. / ...", "a first mark flips nothing, there being nothing to flip");
  model.cells[0] = 2;
  model.place(8, 1);
  assert.equal(grid(model), "O.. / .O. / ..X", "the corner turned its one diagonal neighbour over");
  assert.equal(model.cells[2], 0, "and an empty cell stayed empty rather than becoming a mark");
  assert.equal(model.cells[6], 0);
});

test("a cell's diagonal neighbours are its only neighbours, and the count follows the cell", () => {
  const model = board(5, 5);
  assert.equal(model.diagonals[12].length, 4, "the centre of a 5x5 has four");
  assert.equal(model.diagonals[0].length, 1, "a corner has one");
  assert.equal(model.diagonals[2].length, 2, "an edge cell has two");
  for (let cell = 0; cell < 25; cell += 1) {
    const x = cell % 5;
    const y = Math.floor(cell / 5);
    for (const near of model.diagonals[cell]) {
      assert.equal(Math.abs((near % 5) - x), 1, "a neighbour is one column across");
      assert.equal(Math.abs(Math.floor(near / 5) - y), 1, "and one row down");
    }
  }
});

test("turns match the reference rule over random positions on every board shape", () => {
  // The flip is the only rule with no edge case, which is exactly why it is
  // worth checking exhaustively rather than on a handful of nice positions.
  const original = Math.random;
  try {
    for (const [cols, rows] of [[3, 3], [3, 5], [5, 3], [4, 4], [6, 6], [7, 7]]) {
      Math.random = seeded(4242);
      const model = new TwistModel();
      model.setSettings({ cols, rows, line: Math.min(cols, rows), preview: false });
      model.reset();
      const diagonals = model.diagonals.map((list) => [...list]);
      for (let trial = 0; trial < 400; trial += 1) {
        const cells = Array.from({ length: cols * rows }, () => Math.floor(Math.random() * 3));
        const mark = 1 + Math.floor(Math.random() * 2);
        const cell = cells.findIndex((value) => value === 0);
        if (cell < 0) continue;
        const expected = referenceFlip(cells, diagonals, cell, mark);
        model.cells.set(cells);
        model.place(cell, mark);
        assert.deepEqual([...model.cells], expected, `${cols}x${rows} at cell ${cell}`);
        model.gameOver = false;
        model.won = false;
        model.outcome = null;
      }
    }
  } finally {
    Math.random = original;
  }
});

test("a turn-over can hand the opponent the game, and it counts", () => {
  // This is the rule the whole design turns on. An earlier version credited the
  // mover's turn-over only, so a move that completed the opponent's row was
  // scored as if the opponent had lost -- and the computer, which believed it,
  // walked away from winning moves across an entire board size.
  //
  // The board is 5x5 because on a 3x3 the played cell is diagonal to both ends
  // of the row, and would undo it on the way past.
  const model = board(5, 5, { 0: 2, 1: 1, 2: 2 }, 3);
  model.turn = 1;
  assert.equal(model.place(5, 1), true, "X plays cell 5, diagonally below the X in the top row");
  // Cell 5's only occupied diagonal is cell 1, which was X and becomes O, so the
  // top row reads O O O. X's own move handed O the game.
  assert.equal(grid(model), "OOO.. / X.... / ..... / ..... / .....");
  assert.equal(model.over, true);
  assert.equal(model.outcome.winner, 2, "the opponent's line is a win for the opponent");
  assert.deepEqual(model.outcome.cells, [0, 1, 2]);
});

test("a player can also complete their own line by turning the opponent's mark over", () => {
  const model = board(3, 3, { 0: 1, 4: 2, 8: 1 });
  model.turn = 1;
  // Cell 2's only diagonal is the centre, which was O.
  model.place(2, 1);
  assert.equal(grid(model), "X.X / .X. / ..X");
  assert.equal(model.over, true);
  assert.equal(model.outcome.winner, 1, "X's own turn-over completed X's diagonal");
  assert.deepEqual(model.outcome.cells, [0, 4, 8]);
  assert.match(model.describeLine(model.outcome.cells), /the diagonal from column 1, row 1/);
});

test("a move that leaves both sides holding a line is credited to the player who moved", () => {
  // It has to go to someone, and it has to go to the mover: they completed the
  // line the game ended on, and crediting the opponent for a line the mover
  // could equally have made is a coin toss dressed up as a rule.
  const model = board(3, 3, { 0: 2, 2: 1, 3: 1, 5: 2, 6: 2, 8: 1 });
  model.turn = 2;
  model.place(4, 2);
  assert.equal(grid(model), "X.O / XOO / X.O");
  assert.equal([0, 3, 6].every((cell) => model.cells[cell] === 1), true, "X holds the left column");
  assert.equal([2, 5, 8].every((cell) => model.cells[cell] === 2), true, "and O holds the right one");
  assert.equal(model.over, true);
  assert.equal(model.outcome.winner, 2, "and the player who moved is credited");
});

test("a full board with no line is a draw, not a loss", () => {
  const model = board(3, 3);
  // A real drawing game, move by move: the top row ends O O X and neither
  // column nor diagonal ever fills.
  for (const [cell, mark] of [[2, 1], [4, 2], [6, 1], [3, 2], [1, 1], [5, 2], [7, 1], [8, 2], [0, 1]]) {
    model.place(cell, mark);
  }
  assert.equal(grid(model), "XOO / OXX / XXO");
  assert.equal(model.over, true);
  assert.equal(model.drew, true);
  assert.equal(model.outcome, null, "a draw has no line and therefore no winner");
  assert.equal(model.scoreText(), "Draw");
  assert.match(model.outcomeMessage(), /no line/);
  assert.equal(model.events.includes("draw"), true);
  assert.equal(model.events.includes("lose"), false, "and a draw never sounds like a loss");
});

test("a line wins horizontally, vertically and on both diagonals", () => {
  const horizontal = board(3, 3, { 0: 1, 1: 1 });
  horizontal.place(2, 1);
  assert.equal(horizontal.outcome.winner, 1);
  assert.deepEqual(horizontal.outcome.cells, [0, 1, 2]);
  assert.equal(horizontal.describeLine(horizontal.outcome.cells), "row 1");
  assert.equal(horizontal.outcomeLine(), "X takes row 1");

  const vertical = board(3, 3, { 0: 1, 3: 1 });
  vertical.place(6, 1);
  assert.deepEqual(vertical.outcome.cells, [0, 3, 6]);
  assert.equal(vertical.describeLine(vertical.outcome.cells), "column 1");

  // A diagonal cannot be completed by playing one of its own ends: that cell's
  // neighbour is the middle of the line, and playing it turns the middle over.
  // Which is why both diagonal tests here complete the line by turning a mark.
  const downRight = board(3, 3, { 0: 1, 4: 2, 8: 1 });
  downRight.place(2, 1);
  assert.deepEqual(downRight.outcome.cells, [0, 4, 8]);
  assert.match(downRight.describeLine(downRight.outcome.cells), /the diagonal from column 1, row 1/);

  const downLeft = board(3, 3, { 2: 2, 4: 1, 6: 2 });
  downLeft.turn = 2;
  downLeft.place(0, 2);
  assert.deepEqual(downLeft.outcome.cells, [2, 4, 6]);
  assert.match(downLeft.describeLine(downLeft.outcome.cells), /the diagonal from column 3, row 1/);

  // A line is a line in each direction, and it is not fooled by a gap in it.
  const gapped = board(3, 3, { 0: 1, 2: 1 });
  gapped.turn = 2;
  gapped.place(8, 2);
  assert.equal(gapped.over, false, "one mark in a row of three with a gap is not a line");
});

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

test("the objective is clamped to the board rather than refused, so no board is unwinnable", () => {
  const model = new TwistModel();
  assert.deepEqual(model.validateSettings({ cols: 7, rows: 7, line: 7, preview: false }), { cols: 7, rows: 7, line: 7, preview: false });
  // Asking for five on a 3x3 is a request the board cannot honour, so it is
  // shortened rather than refused -- a refusal would leave the shell showing a
  // number the game is quietly ignoring.
  assert.deepEqual(model.validateSettings({ cols: 3, rows: 3, line: 5, preview: false }), { cols: 3, rows: 3, line: 3, preview: false });
  assert.equal(model.validateSettings({ cols: 3, rows: 3, line: 8, preview: false }), null, "outside the range is refused outright");
  assert.equal(model.validateSettings({ cols: 2, rows: 3, line: 3 }), null, "a board thinner than three is refused");
  model.setSettings({ cols: 5, rows: 5, line: 5 });
  assert.equal(model.pendingSettings.line, 5);
  model.setSettings({ cols: 3, rows: 3 });
  assert.equal(model.pendingSettings.line, 3, "narrowing the board clamps the line with it");
});

test("the preview ships off, and the settings panel is the only place it changes", () => {
  const model = new TwistModel();
  assert.equal(model.previewEnabled, false);
  assert.equal(model.act("preview", 4), false, "pinning does nothing while the preview is off");
  model.setSettings({ preview: true });
  model.reset();
  assert.equal(model.previewEnabled, true);
  assert.equal(model.act("preview", 4), true);
  assert.equal(model.pinned, 4);
  assert.equal(model.act("preview", 4), true);
  assert.equal(model.pinned, -1, "pinning the same cell again unpins it");
});

test("a board that shrinks is rebuilt with lines that fit it", () => {
  const model = new TwistModel();
  model.setSettings({ cols: 6, rows: 6, line: 5 });
  model.reset();
  assert.equal(model.lines.length, 32);
  model.setSettings({ cols: 4, rows: 4, line: 5 });
  model.reset();
  assert.equal(model.cols, 4);
  assert.equal(model.line, 4);
  for (const line of model.lines) {
    assert.equal(line.length, 4);
    for (const cell of line) assert.ok(cell >= 0 && cell < 16, "no line points outside the smaller board");
  }
});

test("the cell under the pointer is the cell that looks like it is under the pointer", () => {
  const model = board(5, 5);
  const { tile, originX, originY } = model.layout();
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const px = originX + x * tile + tile / 2;
      const py = originY + y * tile + tile / 2;
      assert.equal(model.cellAt(px, py), y * 5 + x, `cell ${x},${y}`);
    }
  }
  assert.equal(model.cellAt(originX - 10, originY - 10), -1, "and nothing outside the board is a cell");
  assert.equal(model.cellAt(800, 560), -1);
});

// ---------------------------------------------------------------------
// The computer
// ---------------------------------------------------------------------

test("the search leaves the board exactly as it found it", () => {
  // It runs on a copy precisely so a half-finished search cannot corrupt the
  // game, and this is the assertion that keeps that true.
  const model = board(5, 5, { 0: 1, 6: 2, 12: 1, 18: 2, 4: 1 });
  const before = [...model.cells];
  model.turn = 2;
  model.chooseMove(2);
  assert.deepEqual([...model.cells], before, "an unwinnable position: the search still restores every cell");
  model.cells[7] = 1;
  model.cells[17] = 1;
  const withThreat = [...model.cells];
  model.chooseMove(2);
  assert.deepEqual([...model.cells], withThreat);
  assert.equal(model.turn, 2, "and it did not play a move on the way past");
  assert.equal(model.lastMove, -1);
});

test("the computer only ever returns an empty cell, or nothing at all", () => {
  const original = Math.random;
  try {
    Math.random = seeded(7);
    for (const [cols, rows, line] of [[3, 3, 3], [4, 4, 4], [7, 7, 6]]) {
      for (let trial = 0; trial < 200; trial += 1) {
        const model = new TwistModel();
        model.setSettings({ cols, rows, line, preview: false });
        model.reset();
        for (let cell = 0; cell < cols * rows; cell += 1) model.cells[cell] = Math.floor(Math.random() * 4) === 0 ? 0 : 1;
        const choice = model.chooseMove(1);
        assert.ok(choice === -1 || model.cells[choice] === 0, `${cols}x${rows} chose an occupied cell`);
      }
    }
  } finally {
    Math.random = original;
  }
});

test("the default board is a draw, which is what the reference solver proved", () => {
  // 3x3 with a line of three is a proven draw. Two engines playing each other
  // with the shipped depth must reach that value, and not a first-player win:
  // it is the one board size every player meets first, and a computer that
  // disagrees with the proof there is either broken or accidentally unbeatable.
  const original = Math.random;
  try {
    Math.random = seeded(1234);
    const tally = { X: 0, O: 0, draw: 0, unfinished: 0 };
    for (let game = 0; game < 150; game += 1) {
      const model = new TwistModel();
      model.setSettings({ cols: 3, rows: 3, line: 3, preview: false });
      model.reset();
      let guard = 0;
      while (!model.over && guard < 20) {
        guard += 1;
        const cell = model.chooseMove(model.turn);
        if (cell < 0 || !model.place(cell, model.turn)) break;
      }
      tally[model.drew ? "draw" : model.outcome ? (model.outcome.winner === 1 ? "X" : "O") : "unfinished"] += 1;
    }
    assert.equal(tally.draw, 150, `the default board should draw every time, got ${JSON.stringify(tally)}`);
  } finally {
    Math.random = original;
  }
});

test("the search is bounded by the board and the depth, and cannot grow", () => {
  // Nothing in the computer budgets its own time: there is no node cap, no
  // deadline and no abort. What keeps it cheap is that the tree is bounded by
  // the board size and the depth, so the honest assertion is about how many
  // positions it may look at -- a stopwatch would only ever be a flaky proxy
  // for that, and would fail on a loaded machine for no good reason.
  for (const [cols, rows, line] of [[3, 3, 3], [4, 4, 4], [5, 5, 5], [6, 6, 5], [7, 7, 6]]) {
    const model = new TwistModel();
    model.setSettings({ cols, rows, line, preview: false });
    const cells = cols * rows;
    let worst = 0;
    for (let run = 0; run < 40; run += 1) {
      model.reset();
      // Two thirds of the board filled, which is close to the worst case for a
      // wide search: plenty of empty cells, and therefore plenty of branches.
      for (let cell = 0; cell < cells; cell += 1) model.cells[cell] = cell % 3 === 0 ? 0 : 1 + (cell % 2);
      model.chooseMove(1);
      worst = Math.max(worst, model.searchNodes);
    }
    const depth = model.searchDepth();
    const reachable = Math.pow(cells, depth + 1);
    assert.ok(worst < reachable, `${cols}x${rows} looked at ${worst} positions, more than its ${depth}-ply tree can hold`);
    assert.ok(worst < 20000, `${cols}x${rows} looked at ${worst} positions, which is no longer a shallow search`);
  }
});

test("a move on the largest board is quick enough to sit behind the computer's pause", () => {
  // A deliberately loose smoke test, not the bound above: if the search ever
  // became quadratic this is what would notice, and it must leave generous room
  // for a loaded machine so it never fails for the wrong reason.
  const model = new TwistModel();
  model.setSettings({ cols: 7, rows: 7, line: 6, preview: false });
  const started = process.hrtime.bigint();
  for (let run = 0; run < 20; run += 1) {
    model.reset();
    model.chooseMove(1);
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6 / 20;
  assert.ok(ms < 250, `a 7x7 move took ${ms.toFixed(1)}ms, which would read as a freeze`);
});

test("the computer waits before it moves, and moves on its own turn only", () => {
  const game = new TwistGame();
  game.setSide("second");
  game.reset();
  const idle = { keys: new Set(), pressed: new Set(), pointer: { x: -1, y: -1, down: false, clicked: false } };
  assert.equal(game.model.computerMark, 2, "you are X, the computer is O");
  assert.equal(game.model.turn, 1);
  assert.equal(game.model.computerPause, 0, "it is your move, so it is not waiting");
  game.model.update(1 / 60, {});
  assert.equal(game.model.turn, 1, "and it stays your move while you think");
  game.model.update(1 / 60, { act: { kind: "place", cell: 0 } });
  assert.equal(game.model.turn, 2, "you have moved");
  assert.ok(game.model.computerPause > 0, "and the computer starts waiting rather than answering");
  game.update(0.1, idle);
  assert.equal(game.model.turn, 2, "and it does not answer instantly, because instant reads as a scripted board");
  for (let tick = 0; tick < 60 && game.model.turn === 2; tick += 1) game.update(1 / 60, idle);
  assert.equal(game.model.turn, 1, "then it moves");
  assert.ok(game.model.lastMove >= 0, "and it played a real cell");
});

test("the computer opens the game when it is the first player", () => {
  const game = new TwistGame();
  game.setSide("first");
  game.reset();
  const idle = { keys: new Set(), pressed: new Set(), pointer: { x: -1, y: -1, down: false, clicked: false } };
  assert.equal(game.model.computerMark, 1, "the computer is X");
  assert.equal(game.model.turn, 1);
  assert.equal(game.model.computerPause, TWIST_TUNING.computerPause, "and it waits even for the opening move");
  for (let tick = 0; tick < 90 && game.model.turn === 1; tick += 1) game.update(1 / 60, idle);
  assert.equal(game.model.turn, 2);
  assert.ok(game.model.lastMove >= 0);
});

// ---------------------------------------------------------------------
// Turns, sounds and the shell
// ---------------------------------------------------------------------

test("marks alternate, an occupied cell is never playable, and turns never end", () => {
  const model = board(3, 3);
  assert.equal(model.turn, 1);
  model.place(4);
  assert.equal(model.turn, 2);
  model.place(4);
  assert.equal(model.turn, 2, "the centre is taken");
  assert.equal(model.place(-1), false);
  assert.equal(model.place(99), false);
  model.place(0);
  assert.equal(model.turn, 1);
});

test("every transition says exactly one thing out loud", () => {
  const corner = board(5, 5);
  corner.events.length = 0;
  corner.place(0);
  assert.deepEqual([...corner.events], ["place"], "a corner flips nothing, so only the mark landing is heard");

  const one = board(5, 5, { 8: 1 }, 3);
  one.events.length = 0;
  one.place(12, 1);
  assert.deepEqual([...one.events], ["place", "flip"], "one mark turning over is a flip");
  assert.equal(one.flash.size, 1);

  // The centre's four diagonals all filled, so one placement turns over four.
  // The line is five here on purpose: at three, turning over all four would also
  // complete the diagonal running through the centre, and the move would end the
  // game before the flash could be looked at.
  const many = board(5, 5, { 6: 2, 8: 2, 16: 2, 18: 2 }, 5);
  many.events.length = 0;
  many.place(12, 1);
  assert.deepEqual([...many.events], ["place", "turn"], "a centre move rearranging four marks is its own sound");
  assert.equal(many.flash.size, 4);
});

test("the round-ending sounds are distinct, and a draw never sounds like a loss", () => {
  const won = board(3, 3, { 0: 1, 1: 1 });
  won.events.length = 0;
  won.place(2, 1);
  assert.deepEqual([...won.events], ["place", "win"], "two players, so a completed line is the game being won");
  assert.equal(won.won, false, "with nobody to be it does not claim a personal victory");
  assert.equal(won.gameOver, true, "and the round still ends");

  const lost = board(5, 5, { 0: 2, 1: 1, 2: 2 }, 3);
  lost.side = "second";
  lost.reset();
  for (const [cell, mark] of Object.entries({ 0: 2, 1: 1, 2: 2 })) lost.cells[Number(cell)] = mark;
  lost.events.length = 0;
  // X's own turn-over at 5 turns cell 1 into an O and completes O's top row.
  lost.place(5, 1);
  assert.deepEqual([...lost.events], ["place", "flip", "lose"], "against the computer, handing over the game is a loss");
  assert.equal(lost.events.includes("win"), false);
  assert.equal(lost.gameOver, true);
  assert.equal(lost.won, false);
  assert.match(lost.outcomeMessage(), /O takes row 1 — you lose/);
});

test("the computer takes a win that is on the board", () => {
  // The one thing an opponent must never miss. Checked by finding a winning move
  // independently of the search and then asking what the search does about it.
  const original = Math.random;
  try {
    Math.random = seeded(99);
    let withAWin = 0;
    for (let trial = 0; trial < 3000; trial += 1) {
      const model = new TwistModel();
      model.setSettings({ cols: 4, rows: 4, line: 3, preview: false });
      model.reset();
      for (let cell = 0; cell < 16; cell += 1) model.cells[cell] = Math.floor(Math.random() * 4) === 0 ? 0 : 1 + Math.floor(Math.random() * 2);
      // Only positions a real game could reach: if either side already holds a
      // line the game would have ended before this move was offered.
      if (referenceWins([...model.cells], model.lines, 1) || referenceWins([...model.cells], model.lines, 2)) continue;
      const winning = [];
      for (let cell = 0; cell < 16; cell += 1) {
        if (model.cells[cell] !== 0) continue;
        const next = referenceFlip([...model.cells], model.diagonals.map((list) => [...list]), cell, 1);
        if (referenceWins(next, model.lines, 1)) winning.push(cell);
      }
      if (!winning.length) continue;
      withAWin += 1;
      assert.ok(winning.includes(model.chooseMove(1)), `a win was available at ${winning.join(",")}`);
    }
    assert.ok(withAWin > 20, `only ${withAWin} reachable positions had a win to miss`);
  } finally {
    Math.random = original;
  }
});

test("there is no score while the game is played, and the outcome once it is over", () => {
  const game = new TwistGame();
  game.reset();
  assert.equal(game.score, "", "a number invented for the readout would be worse than an empty one");
  const model = board(3, 3, { 0: 1, 1: 1 });
  model.place(2, 1);
  assert.equal(model.scoreText(), "X wins");
  const draw = board(3, 3);
  draw.settle(null);
  assert.equal(draw.scoreText(), "Draw");
});

test("the overlay names what ended the game rather than a score and a life count", () => {
  const game = new TwistGame();
  game.reset();
  assert.equal(game.resultHeading(), "ROUND OVER");
  assert.match(game.overlayStatus(), /No line yet/);
  assert.equal(game.lifecycle.lifeState().owner, "none", "a board of marks has no lives to spend");

  const duel = new TwistGame();
  duel.reset();
  const won = board(3, 3, { 0: 1, 1: 1 });
  duel.model.outcome = { winner: 1, cells: [0, 1, 2] };
  duel.model.won = true;
  assert.equal(duel.resultHeading(), "X WINS", "on one device the mark wins the headline");
  assert.match(duel.winMessage(), /You take row 1/);

  const versus = new TwistGame();
  versus.setSide("second");
  versus.reset();
  versus.model.outcome = { winner: 1, cells: [0, 1, 2] };
  versus.model.won = true;
  assert.equal(versus.resultHeading(), "YOU WIN");
  versus.model.won = false;
  versus.model.outcome = { winner: 2, cells: [0, 1, 2] };
  versus.model.gameOver = true;
  assert.equal(versus.resultHeading(), "COMPUTER WINS");
});

test("the turn is over once it is over, and the rules stop moving", () => {
  const model = board(3, 3, { 0: 1, 1: 1 });
  model.place(2, 1);
  assert.equal(model.over, true);
  assert.equal(model.place(4), false);
  assert.equal(model.act("place", 4), false);
  assert.equal(model.act("preview", 4), false);
});

test("the flash marks which cells changed, and it fades even after the game ends", () => {
  const model = board(3, 3, { 4: 1 });
  model.place(0);
  assert.equal(model.flash.has(4), true, "the turned-over cell is remembered for the flash");
  for (let tick = 0; tick < 40 && model.flash.size; tick += 1) model.update(1 / 60, {});
  assert.equal(model.flash.size, 0, "and the flash does not outlive its moment");

  const winning = board(3, 3, { 4: 2, 0: 1, 1: 1 });
  winning.place(2, 1);
  assert.equal(winning.over, true);
  assert.equal(winning.flash.size > 0, true, "the move that won is still visibly turning over");
  for (let tick = 0; tick < 40 && winning.flash.size; tick += 1) winning.update(1 / 60, {});
  assert.equal(winning.flash.size, 0, "and it still clears");
});

test("the rule is stated once on the board and then it stops being said", () => {
  const model = board(3, 3);
  assert.ok(model.hintRemaining > 0, "the turn-over rule is invisible until it has cost a mark");
  for (let tick = 0; tick < 60 * 12; tick += 1) model.update(1 / 60, {});
  assert.equal(model.hintRemaining, 0);
  model.place(0);
  assert.equal(model.hintRemaining, 0, "and a game already under way does not bring it back");
});

test("the game describes itself to a player who cannot see the board", () => {
  const model = board(4, 4);
  assert.match(model.description, /turns? (over|into)/i);
  assert.match(model.description, /diagonal/i);
  const state = model.publicState();
  assert.equal(state.title, "Tic Tac Toe Twist", "the shell, the card and the public state all agree on the name");
  assert.match(state.status, /X to move/);
  model.place(4);
  assert.match(model.publicState().status, /O to move/);
});
// ---------------------------------------------------------------------
// The controls
// ---------------------------------------------------------------------

const engineInput = ({ keys = [], pressed = [], pointer = {} } = {}) => ({
  keys: new Set(keys),
  pressed: new Set(pressed),
  mode: "keyboard",
  pointer: { x: -1, y: -1, down: false, clicked: false, moved: false, released: false, dragDistance: 0, ...pointer }
});
// Canvas coordinates for the middle of a cell, so a test clicks where a player
// would rather than hard-coding numbers that only match one board size.
const overCell = (game, cell) => {
  const { tile, originX, originY } = game.model.layout();
  return {
    x: originX + (cell % game.model.cols) * tile + tile / 2,
    y: originY + Math.floor(cell / game.model.cols) * tile + tile / 2
  };
};

test("with the preview off, one gesture places a mark", () => {
  const game = new TwistGame();
  game.reset();
  assert.equal(game.model.previewEnabled, false, "the preview ships off: a tap places, and that is the whole verb");
  game.update(1 / 60, engineInput({ pointer: { ...overCell(game, 4), clicked: true, moved: true } }));
  assert.equal(game.model.cells[4], 1, "the click landed where it looks like it landed");
  assert.equal(game.model.turn, 2);
  game.update(1 / 60, engineInput({ keys: ["ArrowRight"], pressed: ["ArrowRight"] }));
  assert.equal(game.model.cursor, 5, "the cursor moves with the arrows");
  game.update(1 / 60, engineInput({ keys: [" "], pressed: [" "] }));
  assert.equal(game.model.cells[5], 2, "and Space places at the cursor");
});

test("with the preview on, a tap pins the flips and a hold places", () => {
  const game = new TwistGame();
  game.setSettings({ preview: true });
  game.reset();
  assert.equal(game.model.previewEnabled, true);
  const at4 = overCell(game, 4);

  game.update(1 / 60, engineInput({ pointer: { ...at4, clicked: true, moved: true } }));
  assert.equal(game.model.pinned, 4, "a tap pins what would turn over");
  assert.equal(game.model.cells[4], 0, "and places nothing");

  game.update(1 / 60, engineInput({ pointer: { ...at4, clicked: true, moved: true } }));
  assert.equal(game.model.pinned, -1, "tapping it again unpins it");

  // A press held past the threshold is deliberate, and commits.
  game.update(1 / 60, engineInput({ pointer: { ...at4, down: true, moved: true } }));
  assert.equal(game.model.cells[4], 0, "the first frames of a press are still just a press");
  for (let tick = 0; tick < 30; tick += 1) game.update(1 / 60, engineInput({ pointer: { ...at4, down: true, moved: true } }));
  assert.equal(game.model.cells[4], 1, "and holding places the mark");
  assert.equal(game.model.pinned, -1, "which clears the preview of a board that no longer exists");
});

test("the release at the end of a long press is not also a tap", () => {
  // One deliberate press that placed a mark and then pinned a preview of a move
  // already made is a control that reads as two.
  const game = new TwistGame();
  game.setSettings({ preview: true });
  game.reset();
  const at4 = overCell(game, 4);
  for (let tick = 0; tick < 30; tick += 1) game.update(1 / 60, engineInput({ pointer: { ...at4, down: true, moved: true } }));
  assert.equal(game.model.cells[4], 1);
  const pinnedAfterPlace = game.model.pinned;
  game.update(1 / 60, engineInput({ pointer: { ...at4, down: false, clicked: true, released: true, moved: true } }));
  assert.equal(game.model.pinned, pinnedAfterPlace, "the release did not pin anything on the way out");
});

test("a pinned preview is the cell a hold places, wherever the pointer has wandered to", () => {
  // Pinning is a choice. Committing some other cell because the hand drifted
  // would make the preview a suggestion about a move that is not the one shown.
  const game = new TwistGame();
  game.setSettings({ preview: true });
  game.reset();
  game.update(1 / 60, engineInput({ pointer: { ...overCell(game, 8), clicked: true, moved: true } }));
  assert.equal(game.model.pinned, 8);
  const elsewhere = overCell(game, 2);
  for (let tick = 0; tick < 30; tick += 1) game.update(1 / 60, engineInput({ pointer: { ...elsewhere, down: true, moved: true } }));
  assert.equal(game.model.cells[8], 1, "the pinned cell is the one that was committed");
  assert.equal(game.model.cells[2], 0, "and not the cell the pointer happened to be over");
});

test("the keyboard does the same two things the pointer does", () => {
  const game = new TwistGame();
  game.setSettings({ preview: true });
  game.reset();
  game.update(1 / 60, engineInput({ keys: ["Enter"], pressed: ["Enter"] }));
  assert.equal(game.model.pinned, 4, "Enter pins the cursor cell");
  assert.equal(game.model.cells[4], 0);
  game.update(1 / 60, engineInput({ keys: [" "] }));
  for (let tick = 0; tick < 30; tick += 1) game.update(1 / 60, engineInput({ keys: [" "] }));
  assert.equal(game.model.cells[4], 1, "holding Space commits it, exactly as holding the pointer does");
});

test("a pointer resting off the board never pins a cell", () => {
  const game = new TwistGame();
  game.setSettings({ preview: true });
  game.reset();
  game.update(1 / 60, engineInput({ pointer: { x: 2, y: 2, clicked: true, moved: true } }));
  assert.equal(game.model.pinned, -1, "a click in the margin is not a cell");
  assert.equal(game.model.hover, -1);
});

test("the preview shows the cursor when no pointer is over the board", () => {
  // Turning the preview on must help a keyboard player too, or it would help
  // exactly the players who need it least.
  const game = new TwistGame();
  game.setSettings({ preview: true });
  game.reset();
  game.update(1 / 60, engineInput({ keys: ["ArrowLeft"], pressed: ["ArrowLeft"] }));
  assert.equal(game.model.previewCell(), 3, "the cell the cursor is on is the one previewed");
  game.update(1 / 60, engineInput({ pointer: { ...overCell(game, 0), moved: true } }));
  assert.equal(game.model.previewCell(), 0, "and the pointer takes over when it is over the board");
});

test("the hint says which gesture is which, and changes with the setting", () => {
  const off = new TwistGame();
  off.reset();
  assert.match(off.controlHint().map((hint) => hint.label).join(" "), /place your mark/);
  assert.doesNotMatch(off.controlHint().map((hint) => hint.label).join(" "), /pin/);
  const on = new TwistGame();
  on.setSettings({ preview: true });
  on.reset();
  assert.match(on.controlHint().map((hint) => hint.label).join(" "), /pin a preview/);
  assert.match(on.controlHint().map((hint) => hint.label).join(" "), /place the pinned mark/);
});

test("every shape is drawn inside the cell it belongs to", () => {
  // The draw tests elsewhere in the cabinet assert that a frame does not throw
  // and that its text meets the contrast threshold. Neither can see a shape drawn
  // in entirely the wrong place: the cursor brackets were written in the cell's
  // own coordinates, which put them in the top left of the canvas while every
  // test still passed, and which only looking at the board revealed.
  const game = new TwistGame();
  game.reset();
  const shapes = [];
  const context = new Proxy({}, {
    get: (target, key) => {
      if (key === "measureText") return (value) => ({ width: String(value).length * 7 });
      if (key === "canvas") return { width: 800, height: 560 };
      if (key in target) return target[key];
      return (...args) => shapes.push(args);
    },
    set: (target, key, value) => { target[key] = value; return true; }
  });

  // A board with a mark in every cell but the cursor, so it is drawn.
  game.model.cells.fill(2);
  game.model.cells[4] = 0;
  game.model.cursor = 4;
  game.model.lastMove = 8;
  game.draw(context);

  const { originX, originY, tile } = game.model.layout();
  const cellX = originX + tile;
  const cellY = originY + tile;
  const rectangles = shapes.filter((args) => args.length === 4);
  assert.ok(rectangles.length >= 8, `only ${rectangles.length} rectangles were drawn`);
  const brackets = rectangles.filter(([, , w, h]) => w < tile * 0.4 && h < tile * 0.4);
  assert.equal(brackets.length, 8, "four corners of two arms each");
  for (const [x, y, w, h] of brackets) {
    assert.ok(x >= cellX - 1 && x + w <= cellX + tile + 1, `a cursor arm sits at x ${x}, outside the cursor cell`);
    assert.ok(y >= cellY - 1 && y + h <= cellY + tile + 1, `a cursor arm sits at y ${y}, outside the cursor cell`);
  }

  // And nothing at all is drawn off the edge of the drawing surface.
  for (const [x, y, w, h] of shapes.filter((args) => args.length === 4)) {
    assert.ok(x >= 0 && y >= 0 && x + w <= 800 && y + h <= 560, `a shape at ${x},${y} falls off the canvas`);
  }
});

test("X is drawn as two crossing strokes and O as a ring", () => {
  // The X was drawn as one bar rotated forty-five degrees, which is a slash: the
  // comment said two crossing strokes and the code drew one. Nothing caught it,
  // because a slash is still a shape in the right cell and still meets contrast.
  // Count the rectangles inside the marked cell, remembering the rotation each
  // was drawn at.
  const strokesFor = (mark) => {
    const game = new TwistGame();
    game.reset();
    game.model.cells.fill(0);
    game.model.cells[4] = mark;
    game.model.hover = 0;
    // The opening reminder is text over the middle of the board, and its
    // backplates are wide and thin rectangles too. This is about marks.
    game.model.hintRemaining = 0;
    const { originX, originY, tile } = game.model.layout();
    const seen = [];
    // A canvas transform, with the save and restore that make it meaningful:
    // without those, every rotate after a save still counts, and a shape drawn
    // at an absolute angle looks like a cumulative one.
    let transform = { rotation: 0, x: 0, y: 0 };
    const stack = [];
    const context = new Proxy({}, {
      get: (target, key) => {
        if (key === "measureText") return (value) => ({ width: String(value).length * 7 });
        if (key === "canvas") return { width: 800, height: 560 };
        if (key === "rotate") return (angle) => { transform = { ...transform, rotation: transform.rotation + angle }; };
        // The bars are drawn about a translated origin, so the recorded
        // coordinates are relative to the cell centre until this is undone.
        if (key === "translate") return (dx, dy) => { transform = { ...transform, x: dx, y: dy }; };
        if (key === "save") return () => { stack.push(transform); };
        if (key === "restore") return () => { transform = stack.pop() ?? { rotation: 0, x: 0, y: 0 }; };
        if (key in target) return target[key];
        if (key === "stroke") return () => seen.push({ kind: "ring" });
        if (key === "fillRect") {
          return (x, y, w, h) => {
            // A stroke, not a cell: wide and thin, and centred on the marked cell.
            const left = x + transform.x;
            const top = y + transform.y;
            const centreX = originX + tile * 1.5;
            const centreY = originY + tile * 1.5;
            const centred = Math.abs(left + w / 2 - centreX) < tile * 0.2
              && Math.abs(top + h / 2 - centreY) < tile * 0.2;
            if (centred && w > tile * 0.4 && h < tile * 0.25) {
              seen.push({ kind: "bar", rotation: transform.rotation, width: w, height: h });
            }
          };
        }
        return () => {};
      },
      set: (target, key, value) => { target[key] = value; return true; }
    });
    game.draw(context);
    return seen;
  };

  const x = strokesFor(1);
  const bars = x.filter((entry) => entry.kind === "bar");
  assert.equal(bars.length, 2, `X drew ${bars.length} bars, not two`);
  assert.equal(x.filter((entry) => entry.kind === "ring").length, 0, "and no ring");
  // Ninety degrees apart, which is what makes a cross rather than a thicker bar.
  const angles = bars.map((bar) => Math.round(((bar.rotation * 180) / Math.PI) % 180));
  assert.equal(Math.abs(angles[1] - angles[0]), 90, `the two bars are ${angles} degrees apart, not 90`);

  const o = strokesFor(2);
  assert.equal(o.filter((entry) => entry.kind === "ring").length, 1, "O is a ring");
  assert.equal(o.filter((entry) => entry.kind === "bar").length, 0, "and not a cross");
});

test("the keyboard cursor stays out of the way of a pointer", () => {
  // Drawn always, it put brackets around the middle cell of a fresh board, which
  // read as a cell in some other state rather than as a cursor.
  const cursorBars = (hover, over) => {
    const game = new TwistGame();
    game.reset();
    game.model.hover = hover;
    if (over) { game.model.cells[0] = 1; game.model.cells[1] = 1; game.model.act("place", 2); }
    const { originX, originY, tile } = game.model.layout();
    let count = 0;
    const context = new Proxy({}, {
      get: (target, key) => {
        if (key === "measureText") return (value) => ({ width: String(value).length * 7 });
        if (key === "canvas") return { width: 800, height: 560 };
        if (key in target) return target[key];
        if (key === "fillRect") {
          return (x, y, w, h) => {
            if (w < tile * 0.3 && h < tile * 0.3) count += 1;
          };
        }
        return () => {};
      },
      set: (target, key, value) => { target[key] = value; return true; }
    });
    game.draw(context);
    return count;
  };

  assert.equal(cursorBars(-1, false), 8, "four corners of two arms each, for a keyboard player");
  assert.equal(cursorBars(0, false), 0, "and nothing at all once a pointer is over the board");
  assert.equal(cursorBars(-1, true), 0, "nor once the round is over, where it would sit under the result box");
});

test("the board draws in every state it can reach", () => {
  // The recording context in tests/rendering.test.js only ever sees a fresh
  // board, so the states that exist to be looked at -- a pinned preview, a board
  // mid-turn-over, a completed line and a full one -- are drawn here. A view
  // that throws on the frame a player most needs to read is worse than one that
  // throws on no frames.
  const calls = [];
  const context = new Proxy({}, {
    get: (target, key) => {
      if (key === "measureText") return (value) => ({ width: String(value).length * 7 });
      if (key === "canvas") return { width: 800 };
      if (key in target) return target[key];
      return (...args) => { calls.push([key, ...args]); };
    },
    set: (target, key, value) => { target[key] = value; return true; }
  });

  const game = new TwistGame();
  game.setSettings({ preview: true });
  game.reset();
  game.draw(context);
  assert.ok(calls.length > 0, "an empty board still draws");

  game.update(1 / 60, engineInput({ pointer: { ...overCell(game, 4), moved: true } }));
  game.draw(context);
  assert.equal(game.model.previewCell(), 4, "and the board is previewing what a placement would turn over");

  // A board mid-turn-over: the cell the corner flips is still pulsing.
  game.model.cells[4] = 1;
  game.model.act("place", 0);
  assert.ok(game.model.flash.size > 0, "the cells that turned over are mid-flash");
  game.draw(context);

  // A completed line, drawn with the line highlighted.
  const won = new TwistGame();
  won.setSettings({ preview: true });
  won.reset();
  won.model.cells[1] = 1;
  won.model.cells[2] = 1;
  won.model.act("place", 0);
  won.model.update(1 / 60, {});
  won.draw(context);
  assert.equal(won.model.over, true, "a completed line is drawn with the line highlighted");
  assert.deepEqual(won.model.outcome.cells, [0, 1, 2]);

  const full = new TwistGame();
  full.reset();
  for (const [cell, mark] of [[2, 1], [4, 2], [6, 1], [3, 2], [1, 1], [5, 2], [7, 1], [8, 2], [0, 1]]) full.model.place(cell, mark);
  full.draw(context);
  assert.equal(full.model.drew, true, "and a full board with no line is drawn as a draw");
});
