import { CALIBRATION_SEEDS, VALIDATION_SEEDS, POLICIES, versusDistribution } from "./breakout-versus-probe.mjs";

const aiTuning = JSON.parse(process.env.BREAKOUT_AI_TUNING || "{}");
for (const [group, seeds] of [["calibration", CALIBRATION_SEEDS], ["validation", VALIDATION_SEEDS]]) {
  for (const lifeDeficit of [false, true]) for (const policy of [...POLICIES, "idle"]) {
    const { runs, ...result } = versusDistribution(policy, { seeds, lifeDeficit, aiTuning });
    console.log(JSON.stringify({ group, lifeDeficit, ...result,
      comebackSeeds: runs.filter((r) => r.comeback).map((r) => r.seed),
      lifeComebackSeeds: runs.filter((r) => r.lifeComeback).map((r) => r.seed),
      ...(process.env.BREAKOUT_DETAILS === "1" ? { runs } : {}) }));
  }
}
