// Headless equivalent of the cabinet's loss handshake. Countdown time is frozen
// simulation time and omitted; collisions, the model hook, the life budget and
// the respawn/terminal decision are not. Fixtures never clear edge flags.
export function lifecycle(model, { lives = 3, modelOwnsLives = false } = {}) {
  let remaining = lives;
  let losses = 0;
  let resets = 0;
  return {
    get losses() { return losses; },
    get resets() { return resets; },
    get remaining() { return remaining; },
    resolve() {
      if (!model.lifeLost || model.gameOver || model.won) return false;
      const result = model.handleLifeLoss();
      if (!result) throw new Error(`${model.id} raised lifeLost without a loss result`);
      if (model.lifeLost) throw new Error(`${model.id} did not consume its life-loss edge`);
      losses += 1;
      remaining = modelOwnsLives ? model.raceLives.human : Math.max(0, remaining - 1);
      if (result.gameOver || remaining === 0) {
        model.gameOver = true;
        return true;
      }
      model.resetAfterLife();
      resets += 1;
      return true;
    }
  };
}
