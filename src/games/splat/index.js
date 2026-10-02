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
  get modes() { return this.model.modes; }
  get sides() { return this.model.sides; }
  get settings() { return this.model.settings; }
  validateSettings(values) { return this.model.validateSettings?.(values); }
  setSide(side) { this.model.setSide(side); }
  setSettings(settings) { this.model.setSettings(settings); }
  applyPendingSettings() { this.model.applyPendingSettings(); }
  reset(keepScore, preserveLayout) { this.model.reset(keepScore, preserveLayout); }
  controlHint() { return this.controller.controlHint(); }
  resetAfterLife() { this.model.resetAfterLife(); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  update(dt, input) { this.controller.update(dt, input); }
  handleReadyInput(input) { this.controller.handleReadyInput(input); }
  handlePausedInput(input) { this.controller.handlePausedInput(input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  // Builder reports a puzzle outcome. It used to return "You cleared the route!"
  // for every non-Race side, which contradicted the mode label saying the
  // computer navigates and told the player nothing about a design that failed.
  winMessage() {
    if (this.model.side === "race") return this.model.winner === "computer" ? "Computer wins the race!" : "You win the race!";
    return this.model.puzzleResult === "solved" ? "Solved — your route works." : "Solved";
  }
  sideLabel() { return this.model.sideLabel(); }
}

export { SplatModel } from "./model.js";
