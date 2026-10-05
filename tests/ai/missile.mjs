// Missile Command defence: interceptors that connected against attacks that got
// through.
//
// The per-shot hit rate is deliberately not the headline number. It falls as the
// battery fires more often, because each shot is spread thinner, while the number
// that matters -- how much of the attack actually gets through -- barely moves.
// So this measures both and pins the leak.
import { MissileModel } from "../../src/games/missile/model.js";
import { seeded, rate } from "./snake.mjs";

export function measureMissile({ runs = 200, steps = 600, dt = 1 / 60, aiTuning = {} } = {}) {
  const originalRandom = Math.random;
  let fired = 0;
  let connected = 0;
  let leaks = 0;
  let expired = 0;
  let decisions = 0;
  let aimError = 0;
  try {
    for (let run = 0; run < runs; run += 1) {
      Math.random = seeded(1000 + run * 7919);
      const game = new MissileModel({ aiTuning });
      game.setSide("attacker");
      game.reset();
      for (let step = 0; step < steps && !game.gameOver && !game.won; step += 1) {
        game.update(dt, { aim: { x: 0, y: 0, moved: false, clicked: false, down: false }, launch: false, attack: step % 60 === 0 ? { x: 40 + Math.random() * 720 } : null });
        for (const event of game.eventLog.splice(0)) {
          if (event.type === "interceptor-fired" && event.machine) fired += 1;
          else if (event.type === "intercepted") connected += 1;
          else if (event.type === "target-impact") leaks += 1;
          else if (event.type === "offscreen-expiry") expired += 1;
        }
      }
      for (const entry of game.decisionLog) {
        decisions += 1;
        aimError += Math.abs(entry.aimX - entry.idealX);
      }
    }
  } finally {
    Math.random = originalRandom;
  }
  return {
    fired,
    connected,
    leaks,
    expired,
    hitRatePerShot: rate(connected, fired),
    leakRate: rate(leaks, leaks + connected),
    decisions,
    meanAimShortfall: decisions ? Math.round(aimError / decisions) : 0,
    runs
  };
}
