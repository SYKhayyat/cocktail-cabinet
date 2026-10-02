import { SnakeModel } from "../../src/games/snake/model.js";

// Snake computer: how many turns it takes toward the apple, and how long it lasts.
//
// "Wrong turn" is measured against a greedy baseline: a move is wrong when an
// adjacent, non-reversing cell existed that sat closer to the true apple and the
// snake did not take it. That baseline is strict -- real snakes zigzag because
// greedy stepping is what walks them into their own tail -- so the absolute
// number is not a quality score. What it does establish is that the snake is
// neither perfect nor random.
export function measureSnake({ runs = 200, steps = 1000, settings = {}, dt = 0.05, perfectPerception = false, noMomentum = false, placeApples = false } = {}) {
  const originalRandom = Math.random;
  const decisions = [];
  let deaths = 0;
  let secondsToDeath = 0;
  let apples = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = new SnakeModel();
      game.setSide("apples");
      if (settings && Object.keys(settings).length) {
        game.setSettings(settings);
        game.applyPendingSettings();
      }
      game.reset();
      if (perfectPerception) game.aiPerceptionInterval = 0;
      if (noMomentum) game.aiCommitMoves = 0;
      let firstDeath = null;
      for (let step = 0; step < steps; step += 1) {
        // In the real apples mode the player is the one moving the apple, which
        // is the only situation in which a reaction delay can cost the snake
        // anything. A fixture that leaves the apple still makes the delay look
        // inert when it is not.
        // placeApple is a canvas pointer, not a grid cell: cellFromPointer
        // divides by the cell size. Passing grid coordinates clamps every apple
        // to the top-left cell, so the apple never actually moves.
        const placeApple = placeApples && step % 3 === 0
          ? game.cellCenter({ x: Math.floor(Math.random() * game.cols), y: Math.floor(Math.random() * game.rows) })
          : null;
        game.update(dt, { direction: null, steer: null, placeApple });
        if (game.gameOver) {
          if (firstDeath === null) firstDeath = step * dt;
          deaths += 1;
          break;
        }
      }
      if (firstDeath !== null) secondsToDeath += firstDeath;
      apples += game.score;
      for (const entry of game.decisionLog) decisions.push(entry);
    }
  } finally {
    Math.random = originalRandom;
  }
  const scored = decisions.filter((entry) => entry.actual);
  const wrong = scored.filter((entry) => isWrong(entry));
  const bySafety = {};
  for (const entry of scored) {
    const key = entry.safeOptions;
    bySafety[key] = bySafety[key] || { total: 0, wrong: 0 };
    bySafety[key].total += 1;
    if (isWrong(entry)) bySafety[key].wrong += 1;
  }
  return {
    decisions: scored.length,
    wrongRate: rate(wrong.length, scored.length),
    heldRate: rate(decisions.filter((entry) => entry.held).length, decisions.length),
    deaths,
    runs,
    deathsPerRun: rate(deaths, runs),
    secondsToDeath: deaths ? +(secondsToDeath / deaths).toFixed(1) : null,
    applesPerRun: +(apples / runs).toFixed(1),
    bySafety
  };
}

// A turn is wrong when another cell the snake could legally have moved to sat
// closer to the true apple. Only cells the model recorded as legal count: an
// adjacent cell inside the snake's own body is not a missed opportunity.
function isWrong(entry) {
  const distanceTo = (cell) => Math.abs(cell.x - entry.actual.x) + Math.abs(cell.y - entry.actual.y);
  const chosen = distanceTo(entry.choseCell);
  for (const cell of entry.safeCells) {
    if (cell.x === entry.choseCell.x && cell.y === entry.choseCell.y) continue;
    if (distanceTo(cell) < chosen) return true;
  }
  return false;
}

export function rate(numerator, denominator) {
  return denominator ? +((100 * numerator) / denominator).toFixed(1) : 0;
}
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
