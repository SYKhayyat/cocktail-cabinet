// The host consumes this contract, never a concrete model or game id. Round
// context contains values only: { startingLives, reason: load | restart | side }.
// Life ownership is explicit; a single-owner puzzle can own a budget without
// pretending that it has a second player. Rewards are consumed once by the host.
export function createGameLifecycle(game, {
  boot = "ready",
  startRound = () => game.reset(),
  restartAfterLife = game.resetAfterLife ? () => game.resetAfterLife() : null,
  lifeState = () => ({ owner: "host" }),
  takeRewards = () => []
} = {}) {
  let roundContext = Object.freeze({ startingLives: 3, reason: "load" });
  return Object.freeze({
    boot,
    get roundContext() { return roundContext; },
    startRound(context) {
      roundContext = Object.freeze({ startingLives: context.startingLives, reason: context.reason });
      game.gameOver = false;
      game.lifeLost = false;
      game.applyPendingSettings?.();
      startRound(roundContext);
    },
    lifeState,
    takeRewards,
    lifeLossPending: () => Boolean(game.lifeLost || game.gameOver),
    resolveLifeLoss() {
      const loss = game.handleLifeLoss?.();
      game.lifeLost = false;
      return loss || {
        gameOver: false,
        message: game.lossReason === "wall" ? "Wall hit — one life lost. Starting again in 3…" : "One life lost — starting again in 3…"
      };
    },
    restartAfterLife,
    endRound() { game.gameOver = true; },
    resultState() {
      const won = Boolean(game.won);
      const ended = won || Boolean(game.gameOver);
      const winner = game.winner;
      const tied = game.versusTie;
      return {
        ended,
        won,
        heading: game.resultHeading?.() || (tied ? "TIE" : winner ? winner === "human" ? "YOU WIN" : "COMPUTER WINS" : won ? "YOU WIN" : "OUT OF LIVES"),
        instruction: won || winner || tied ? "Press New game to play again" : "Press New game to try again",
        message: won ? game.winMessage?.() || "You cleared every brick — you win!" : null
      };
    }
  });
}
