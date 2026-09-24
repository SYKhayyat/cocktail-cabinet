import { SplatModel } from "./model.js";
import { SplatController } from "./controller.js";
import { draw } from "./view.js";

export class SplatGame {
  constructor() { this.model = new SplatModel(); this.controller = new SplatController(this.model); }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get tool() { return this.model.tool; }
  setTool(tool) { this.model.setTool(tool); }
  get score() { return this.model.score; }
  get won() { return this.model.won; }
  get winner() { return this.model.winner; }
  get gameOver() { return this.model.gameOver; }
  get playerLives() { return this.model.raceLives; }
  set engine(value) { this.model.engine = value; }
  set gameOver(value) { this.model.gameOver = value; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  setSide(side) { this.model.setSide(side); }
  setSettings(settings) { this.model.setSettings(settings); }
  applyPendingSettings() { this.model.applyPendingSettings(); }
  reset(keepScore) { this.model.reset(keepScore); }
  resetAfterLife() { this.model.resetAfterLife(); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  update(dt, input) { this.controller.update(dt, input); }
  handleReadyInput(input) { this.controller.handleReadyInput(input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  winMessage() { return this.model.winner === "computer" ? "Computer wins the race!" : "You win the race!"; }
  sideLabel() { return this.model.sideLabel(); }
}

export { SplatModel } from "./model.js";
