import { ImitationModel } from "./model.js";
import { ImitationController } from "./controller.js";
import { draw } from "./view.js";
import { createGameLifecycle } from "../../game-lifecycle.js";

export class ImitationGame {
  constructor() {
    this.model = new ImitationModel();
    this.controller = new ImitationController(this.model);
    this.lifecycle = createGameLifecycle(this, {
      boot: "interactive",
      startRound: () => this.controller.reset(),
      lifeState: () => ({ owner: "none" })
    });
  }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get matchId() { return this.model.matchId; }
  get chatLog() { return this.model.chatLog; }
  get chatRevision() { return this.model.chatRevision; }
  get phase() { return this.model.phase; }
  get won() { return this.model.won; }
  set won(value) { this.model.won = value; }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) { this.model.gameOver = value; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  sideLabel() { return this.model.sideLabel(); }
  get modes() { return this.model.modes; }
  get sides() { return this.model.sides; }
  get settings() { return this.model.settings; }
  validateSettings(values) { return this.model.validateSettings?.(values); }
  setSide(side) { this.model.setSide(side); }
  setStateListener(listener) { this.model.setStateListener(listener); }
  createManualInvite() { return this.controller.createManualInvite(); }
  acceptManualInvite(text) { return this.controller.acceptManualInvite(text); }
  acceptManualAnswer(text) { return this.controller.acceptManualAnswer(text); }
  reset(keepScore) { this.controller.reset(keepScore); }
  destroy() { this.controller.destroy(); }
  // Returns what the model accepted, or null when it refused the text. The
  // shell relies on this to leave a rejected message in the box rather than
  // silently discarding it.
sendMessage(text) { return this.controller.sendMessage(text); }
  downloadModel() { return this.model.downloadModel(); }
  restartGuess() { return this.model.restartGuess(); }
  chooseGuess(value) { return this.model.chooseGuess(value); }
  controlHint() { return this.controller.controlHint(); }
  update(dt) { this.controller.update(dt); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
}

export { ImitationModel } from "./model.js";
