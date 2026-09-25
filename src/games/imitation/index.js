import { ImitationModel } from "./model.js";
import { ImitationController } from "./controller.js";
import { draw } from "./view.js";

export class ImitationGame {
  constructor() { this.model = new ImitationModel(); this.controller = new ImitationController(this.model); }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get matchId() { return this.model.matchId; }
  get chatLog() { return this.model.chatLog; }
  get chatRevision() { return this.model.chatRevision; }
  get phase() { return this.model.phase; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  sideLabel() { return this.model.sideLabel(); }
  setSide(side) { this.model.setSide(side); }
  reset(keepScore) { this.controller.reset(keepScore); }
  sendMessage(text) { this.controller.sendMessage(text); }
  downloadModel() { return this.model.downloadModel(); }
  restartGuess() { return this.model.restartGuess(); }
  chooseGuess(value) { return this.model.chooseGuess(value); }
  update(dt) { this.controller.update(dt); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
}

export { ImitationModel } from "./model.js";
