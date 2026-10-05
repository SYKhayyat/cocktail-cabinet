import { SnakeGame } from "../../src/games/snake/index.js";
import { BreakoutGame } from "../../src/games/breakout/index.js";
import { SplatGame } from "../../src/games/splat/index.js";
import { AsteroidsGame } from "../../src/games/asteroids/index.js";
import { MissileCommandGame } from "../../src/games/missile/index.js";
import { StarfallGame } from "../../src/games/starfall/index.js";

export const GAMES = { snake: SnakeGame, breakout: BreakoutGame, splat: SplatGame, asteroids: AsteroidsGame, missile: MissileCommandGame, starfall: StarfallGame };
export const SEEDS = [57, 113, 227, 449, 907, 1801, 3607, 7207, 14407, 28813, 57637, 115271];
export const DT = 1 / 60;
export const input = (values = {}) => ({ mode: "keyboard", keys: new Set(), pressed: new Set(), pointer: { x: 0, y: 0, moved: false, clicked: false, down: false, released: false }, ...values });

export function seeded(seed, run) {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  try { return run(); } finally { Math.random = original; }
}

// Explicit value-only host. Countdown time is not simulation time: as in the
// engine, the model is frozen for three seconds after each nonterminal loss.
export function cabinet(id, { progressed = false, lives = 3 } = {}) {
  const game = new GAMES[id]();
  const lifecycle = game.lifecycle;
  lifecycle.startRound({ startingLives: lives, reason: "load" });
  const model = game.model;
  if (progressed) {
    const fraction = typeof progressed === "number" ? progressed : 1;
    if (id === "snake") { model.score = Math.round(12 * fraction); model.reset(true, 3 + model.score); }
    if (id === "breakout") model.score = Math.round(60 * fraction);
    if (id === "splat") {
      const section = Math.round(30 * fraction);
      // A controlled section-start, not a claim this baseline reached column 31.
      for (const column of model.columns.slice(0, section)) column.passed = true;
      model.player.x = model.columns[section].x - 120;
      model.player.y = 280;
      model.player.columnsPassed = model.score = model.furthestColumns = section;
      model.nextColumn = model.columns[section];
    }
    if (id === "asteroids") { model.score = Math.round(120 * fraction); model.reset(true); model.scores.human = model.score; }
    if (id === "missile") for (let i = 0; i < Math.round(3 * fraction); i += 1) model.startNextLevel();
    if (id === "starfall") model.score = Math.round(150 * fraction);
  }
  let remaining = lives;
  let budget = lives;
  let countdown = 0;
  let ended = false;
  let losses = 0;
  let active = 0;
  let wall = 0;
  const lossTimes = [];
  return {
    game, model, lifecycle,
    get remaining() { return remaining; },
    get countdown() { return countdown; },
    get ended() { return ended; },
    get active() { return active; },
    get wall() { return wall; },
    get losses() { return losses; },
    lossTimes,
    step(controls = input(), dt = DT) {
      if (ended) return false;
      wall += dt;
      if (countdown > 0) { countdown = Math.max(0, countdown - dt); return false; }
      active += dt;
      game.update(dt, controls);
      for (const reward of lifecycle.takeRewards()) if (reward.type === "extra-life") {
        budget = Math.min(9, budget + 1);
        remaining = Math.min(budget, remaining + 1);
      }
      if (lifecycle.resultState().won) ended = true;
      else if (lifecycle.lifeLossPending()) {
        losses += 1;
        lossTimes.push(active);
        const loss = lifecycle.resolveLifeLoss();
        const life = lifecycle.lifeState();
        if (life.owner === "host") remaining = Math.max(0, remaining - 1);
        if (life.owner === "game") remaining = life.remaining;
        if (loss.gameOver || remaining === 0 || !lifecycle.restartAfterLife) {
          lifecycle.endRound();
          ended = true;
        } else {
          lifecycle.restartAfterLife();
          countdown = 3;
        }
      }
      return true;
    }
  };
}

const position = ({ x, y }) => ({ x, y });
// Deliberately select fields; do not spread model/player/computer objects here.
// No timers, random state, AI fields, AI decision logs, or model methods are
// visible to the human-input policies.
export function observe(id, m) {
  if (id === "snake") return { cols: m.cols, rows: m.rows, snake: m.snake.map(position), direction: position(m.direction), apple: m.apple && position(m.apple) };
  if (id === "breakout") return { paddle: { x: m.human.x, y: m.human.y, width: m.human.width }, balls: m.balls.map(({ x, y, vx, vy, radius }) => ({ x, y, vx, vy, radius })) };
  if (id === "splat") return { player: position(m.player), columns: m.columns.filter((c) => !c.passed && c.x - m.cameraX < 800 && c.x + c.width >= m.player.x - 12).map(({ x, width, gapY, gapHeight }) => ({ x, width, gapY, gapHeight })) };
  if (id === "asteroids") return { ship: { ...position(m.ship), angle: m.ship.angle }, rocks: m.asteroids.map(({ x, y, radius }) => ({ x, y, radius })) };
  if (id === "missile") return { selected: m.selectedBattery, bases: m.bases.map(({ x, y, alive, missiles }) => ({ x, y, alive, missiles })), enemies: m.enemyMissiles.filter((e) => !e.dead).map(({ id, x, y, aircraft }) => ({ id, x, y, aircraft: Boolean(aircraft) })) };
  return { runner: position(m.runner), stars: m.stars.map(({ x, y, vy, radius }) => ({ x, y, vy, radius })), gems: m.gems.filter((g) => !g.collected && g.y < 526).map(({ x, y, vy }) => ({ x, y, vy })) };
}

export function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (fraction) => sorted[Math.floor((sorted.length - 1) * fraction)];
  return { min: sorted[0], p25: quantile(0.25), median: quantile(0.5), p75: quantile(0.75), max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
}
