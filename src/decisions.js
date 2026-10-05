// Models own decisions; headless tests observe the bounded log without
// monkey-patching model internals. Drop the oldest quarter in one splice.
export const DECISION_LOG_LIMIT = 4096;

export function recordDecision(model, entry) {
  model.lastDecision = entry;
  model.decisionLog.push(entry);
  const limit = model.decisionLogLimit ?? DECISION_LOG_LIMIT;
  if (model.decisionLog.length > limit) model.decisionLog.splice(0, limit >> 2);
}
