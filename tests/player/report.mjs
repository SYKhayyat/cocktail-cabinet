// Optional calibration report: node tests/player/report.mjs
import { GAMES } from "./harness.mjs";
import { completionDistribution, COMPLETION_HORIZON, distribution, pressure } from "./measure.mjs";
import { recoveryWindow } from "./recovery.mjs";

for (const id of Object.keys(GAMES)) {
  const compact = ({ runs, ...metrics }) => ({ ...metrics, levelsReached: runs.filter((r) => r.levelsAdvanced > 0).length });
  const compactCompletion = ({ runs, ...metrics }) => metrics;
  const completion = ["breakout", "splat"].includes(id) ? { horizon: COMPLETION_HORIZON, startingLives: 3, default: compactCompletion(completionDistribution(id)), progressed: compactCompletion(completionDistribution(id, { progressed: true })) } : null;
  console.log(JSON.stringify({ game: id, default: compact(distribution(id)), progressed: compact(distribution(id, { progressed: true })), idle: compact(distribution(id, { idle: true })), pressure: { default: pressure(id, false), progressed: pressure(id, true) }, recovery: { default: recoveryWindow(id, false).maxSafeDelay, progressed: recoveryWindow(id, true).maxSafeDelay }, completion }));
}
