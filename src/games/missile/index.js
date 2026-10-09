import { MissileModel } from "./model.js";
import { MissileController } from "./controller.js";
import { draw } from "./view.js";
import { createGameLifecycle } from "../../game-lifecycle.js";
import { playSounds } from "../../audio.js";

export class MissileCommandGame {
  constructor() {
    this.model = new MissileModel();
    this.controller = new MissileController(this.model);
    this.lifecycle = createGameLifecycle(this, {
      startRound: () => this.model.reset(),
      lifeState: () => ({ owner: "none" })
    });
  }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) {
    // The host decides a loss as often as the model does, so this is where
    // a won/lose transition is caught whichever side set it.
    if (value && !this.model.gameOver) this.model.emit("lose");
    this.model.gameOver = value;
  }
  get won() { return this.model.won; }
  set won(value) {
    // The host decides a loss as often as the model does, so this is where
    // a won/lose transition is caught whichever side set it.
    if (value && !this.model.won) this.model.emit("win");
    this.model.won = value;
  }
  get winner() { return this.model.winner; }
  winMessage() { return this.model.winner === "computer" ? "The batteries are gone — the cities hold." : "Every city is down — you win."; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  get modes() { return this.model.modes; }
  get sides() { return this.model.sides; }
  get settings() { return this.model.settings; }
  validateSettings(values) { return this.model.validateSettings?.(values); }
  setSide(side) { this.model.setSide(side); }
  reset(keepScore) { this.model.reset(keepScore); }
  controlHint() { return this.controller.controlHint(); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  update(dt, input) {
    this.controller.update(dt, input);
    // The one bridge from a model's events to the audio hardware. Models never
    // touch AudioContext, which the boundary check rightly forbids.
    playSounds("missile", this.model.drainEvents());
  }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  sideLabel() { return this.model.sideLabel(); }
}

export { MissileModel } from "./model.js";
