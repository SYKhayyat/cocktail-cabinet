import { LampModel } from "./model.js";
import { LampController } from "./controller.js";
import { draw } from "./view.js";
import { createGameLifecycle } from "../../game-lifecycle.js";
import { playSounds } from "../../audio.js";

export class LampGame {
  constructor() {
    this.model = new LampModel();
    this.controller = new LampController(this.model);
    this.lifecycle = createGameLifecycle(this, {
      startRound: () => this.model.reset(),
      restartAfterLife: () => this.model.restartAfterLife()
    });
  }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get player() { return this.model.player; }
  get coins() { return this.model.coins; }
  get wisps() { return this.model.wisps; }
  get hazards() { return this.model.hazards; }
  get exit() { return this.model.exit; }
  get light() { return this.model.light; }
  get won() { return this.model.won; }
  set won(value) {
    // The host decides a loss as often as the model does, so this is where
    // a won/lose transition is caught whichever side set it.
    if (value && !this.model.won) this.model.emit("win");
    this.model.won = value;
  }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) {
    // The host decides a loss as often as the model does, so this is where
    // a won/lose transition is caught whichever side set it.
    if (value && !this.model.gameOver) this.model.emit("lose");
    this.model.gameOver = value;
  }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  get lossReason() { return this.model.lossReason; }
  set lossReason(value) { this.model.lossReason = value; }
  get modes() { return this.model.modes; }
  get sides() { return this.model.sides; }
  get settings() { return this.model.settings; }
  validateSettings(values) { return this.model.validateSettings?.(values); }
  setSide(side) { this.model.setSide(side); }
  setSettings(settings) { return this.model.setSettings(settings); }
  applyPendingSettings() { this.model.applyPendingSettings(); }
  reset() { this.model.reset(); }
  // A life costs the counter and nothing else, so the retry is the same model
  // with the lamp re-kindled rather than a fresh maze.
  restartAfterLife() { this.model.restartAfterLife(); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  winMessage() { return this.model.winMessage(); }
  sideLabel() { return this.model.sideLabel(); }
  controlHint() { return this.controller.controlHint(); }
  update(dt, input) {
    this.controller.update(dt, input);
    // The one bridge from a model's events to the audio hardware. Models never
    // touch AudioContext, which the boundary check rightly forbids.
    playSounds("lamp", this.model.drainEvents());
  }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
}

export { LampModel, LAMP_MODES, LAMP_SETTINGS, LAMP_PRESETS, LAMP_TUNING } from "./model.js";