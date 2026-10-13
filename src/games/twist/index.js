import { TwistModel } from "./model.js";
import { TwistController } from "./controller.js";
import { draw } from "./view.js";
import { createGameLifecycle } from "../../game-lifecycle.js";
import { playSounds } from "../../audio.js";

export class TwistGame {
  constructor() {
    this.model = new TwistModel();
    this.controller = new TwistController(this.model);
    // A board of marks has no life budget: you lose the game, you do not spend
    // a life and carry on. The overlay says so rather than showing 0/3.
    this.lifecycle = createGameLifecycle(this, {
      startRound: () => this.model.reset(),
      lifeState: () => ({ owner: "none" })
    });
  }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  // Blank while the game is played and the outcome once it is over. This game has
  // nothing to count, and a number invented for the sake of the readout would be
  // worse than an empty one.
  get score() { return this.model.scoreText(); }
  get won() { return this.model.won; }
  set won(value) {
    // The host decides a loss as often as the model does, so this is where
    // a won transition is caught whichever side set it.
    if (value && !this.model.won) this.model.emit("win");
    this.model.won = value;
  }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) {
    // The host ends a round by setting gameOver here rather than on the model,
    // and here the model has already set it -- so this is a backstop, and
    // the model owns the announcement. A draw is not a loss and must stay quiet.
    if (value && !this.model.gameOver && !this.model.drew) this.model.emit("lose");
    this.model.gameOver = value;
  }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  get modes() { return this.model.modes; }
  get sides() { return this.model.sides; }
  get settings() { return this.model.settings; }
  validateSettings(values) { return this.model.validateSettings?.(values); }
  setSide(side) { this.model.setSide(side); }
  setSettings(settings) { return this.model.setSettings(settings); }
  applyPendingSettings() { this.model.applyPendingSettings(); }
  reset() { this.model.reset(); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  winMessage() { return this.model.winMessage(); }
  // The host's default wording is written for a run that ended by running out of
  // lives. This one ends in a line or a full board, so it names which.
  resultHeading() {
    const model = this.model;
    if (!model.over) return "ROUND OVER";
    if (model.drew) return "DRAW";
    const winner = model.outcome ? model.outcome.winner : 0;
    const name = winner === 1 ? "X" : "O";
    // On one device there is no "you", so the mark itself wins the headline.
    if (!model.humanMark) return `${name} WINS`;
    return winner === model.humanMark ? "YOU WIN" : "COMPUTER WINS";
  }
  // The ready and end overlay prints "Score: 0   Lives: 3/3" for every game.
  // This one has neither, and a board of marks reporting a score of zero and a
  // life budget it does not have is worse than saying what is actually true.
  overlayStatus() { return this.model.over ? this.model.outcomeLine() : "No line yet — place a mark."; }
  sideLabel() { return this.model.sideLabel(); }
  controlHint() { return this.controller.controlHint(); }
  update(dt, input) {
    this.controller.update(dt, input);
    // The one bridge from a model's events to the audio hardware. Models never
    // touch AudioContext, which the boundary check rightly forbids.
    playSounds("twist", this.model.drainEvents());
  }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
}

export { TwistModel, TWIST_MODES, TWIST_SETTINGS, TWIST_TUNING } from "./model.js";