import { cabinet, DT, input, observe, SEEDS, seeded, summary } from "./harness.mjs";
import { humanPolicy } from "./policies.mjs";

export const HORIZONS = { snake: 45, breakout: 45, splat: 45, asteroids: 45, missile: 60, starfall: 45 };
export const COMPLETION_HORIZON = 180;

function objectives(id, m, baseline, initialBricks, best) {
  return id === "breakout" ? m.bricks.filter((b) => !b.hits).length - initialBricks
    : id === "asteroids" ? (m.scores.human - baseline) / 10
    : id === "missile" ? m.eventLog.filter((e) => e.type === "intercepted").length
    : id === "starfall" ? m.eventLog.filter((e) => e.type === "gem-collected").length
    : best - baseline;
}

export function sample(id, seed, { progressed = false, idle = false, lives = 1, horizon = HORIZONS[id] } = {}) {
  return seeded(seed, () => {
    const host = cabinet(id, { progressed, lives });
    const baseline = host.game.score;
    let best = baseline;
    const initialBricks = id === "breakout" ? host.model.bricks.filter((b) => !b.hits).length : 0;
    const initialLevel = host.model.level;
    let lastObjective = 0;
    let lastRewardTime = 0;
    let rewardDrought = 0;
    const player = humanPolicy(id, seed);
    while (!host.ended && host.losses === 0 && host.active + 1e-9 < horizon) {
      const controls = idle ? input() : player.controls(observe(id, host.model), host.active);
      host.step(controls);
      best = Math.max(best, host.game.score);
      const count = objectives(id, host.model, baseline, initialBricks, best);
      if (count > lastObjective) {
        rewardDrought = Math.max(rewardDrought, host.active - lastRewardTime);
        lastRewardTime = host.active;
        lastObjective = count;
      }
    }
    const m = host.model;
    const objective = objectives(id, m, baseline, initialBricks, best);
    rewardDrought = Math.max(rewardDrought, host.active - lastRewardTime);
    return {
      seed, survival: host.lossTimes[0] ?? host.active,
      censored: host.lossTimes.length === 0 && !host.game.won, finished: Boolean(host.game.won),
      gain: best - baseline, objective, rewardDrought, levelsAdvanced: id === "missile" ? m.level - initialLevel : 0,
      paddleReturns: id === "breakout" ? m.paddleHits : 0,
      losses: host.losses, active: host.active,
      ...player.metrics
    };
  });
}

export function distribution(id, options = {}) {
  const runs = SEEDS.map((seed) => sample(id, seed, options));
  return {
    runs, survival: summary(runs.map((r) => r.survival)), gain: summary(runs.map((r) => r.gain)),
    objective: summary(runs.map((r) => r.objective)),
    rewardDrought: summary(runs.map((r) => r.rewardDrought)),
    opportunities: summary(runs.map((r) => r.opportunities)), actions: summary(runs.map((r) => r.actions)),
    agencyWindows: summary(runs.map((r) => r.agencyWindows)),
    censored: runs.filter((r) => r.censored).length,
    finished: runs.filter((r) => r.finished).length,
    reached: runs.filter((r) => r.objective > 0).length
  };
}

// Independent whole-round reachability samples for the two short finite
// clearance games. First-loss score samples cannot establish actual victory.
export function completionSample(id, seed, { progressed = false, horizon = COMPLETION_HORIZON } = {}) {
  if (!["breakout", "splat"].includes(id)) throw new Error("completion sample requires a finite short clearance goal");
  return seeded(seed, () => {
    const host = cabinet(id, { progressed, lives: 3 });
    const player = humanPolicy(id, seed);
    let firstRespawn = null;
    while (!host.ended && host.active + 1e-9 < horizon) {
      host.step(player.controls(observe(id, host.model), host.active));
      if (id === "breakout" && firstRespawn === null && host.losses > 0 && host.countdown > 0) {
        firstRespawn = { speed: Math.hypot(host.model.balls[0].vx, host.model.balls[0].vy), difficulty: host.model.difficultyLevel, score: host.model.score };
      }
    }
    return { seed, active: host.active, wall: host.wall, losses: host.losses, won: Boolean(host.game.won), censored: !host.ended, exhausted: host.ended && !host.game.won, remaining: host.remaining, firstRespawn };
  });
}

export function completionDistribution(id, options = {}) {
  const runs = SEEDS.map((seed) => completionSample(id, seed, options));
  const respawns = runs.map((r) => r.firstRespawn).filter(Boolean);
  return { runs, completed: runs.filter((r) => r.won).length, censored: runs.filter((r) => r.censored).length, exhausted: runs.filter((r) => r.exhausted).length, duration: summary(runs.map((r) => r.active)), firstRespawn: respawns.length ? { count: respawns.length, speed: summary(respawns.map((r) => r.speed)), difficulty: summary(respawns.map((r) => r.difficulty)) } : null };
}

// Mechanical pressure, not a claim that humans perceive equal difficulty.
export function pressure(id, progressed) {
  return seeded(57, () => {
    const { model: m, game } = cabinet(id, { progressed });
    if (id === "snake") return { speed: 1 / m.moveInterval(), body: m.snake.length };
    if (id === "breakout") {
      game.update(0, input());
      return { speed: Math.hypot(m.balls[0].vx, m.balls[0].vy), width: m.human.width };
    }
    if (id === "splat") return { gap: m.nextColumn.gapHeight, spacing: m.columnSpacing };
    if (id === "asteroids") {
      const speed = Math.hypot(m.asteroids[0].vx, m.asteroids[0].vy);
      m.spawnClock = 0;
      game.update(DT, input());
      return { speed, spawnInterval: m.spawnClock };
    }
    if (id === "missile") {
      m.launchClock = 0;
      game.update(DT, input());
      return { enemies: m.enemyTotal, spawnInterval: m.launchClock, speed: m.enemyMissiles[0].speed, level: m.level };
    }
    m.spawnClock = 0;
    game.update(DT, input());
    return { speed: m.stars[0].vy, spawnInterval: m.spawnClock };
  });
}
