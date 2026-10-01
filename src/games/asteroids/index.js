import { AsteroidsModel } from "./model.js";
import { AsteroidsController } from "./controller.js";
import { draw } from "./view.js";

export class AsteroidsGame {
  constructor() { this.model = new AsteroidsModel(); this.controller = new AsteroidsController(this.model); }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get won() { return this.model.won; }
  get winner() { return this.model.winner; }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) { this.model.gameOver = value; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  get modes() { return this.model.modes; }
  get sides() { return this.model.sides; }
  get settings() { return this.model.settings; }
  validateSettings(values) { return this.model.validateSettings?.(values); }
  setSide(side) { this.model.setSide(side); }
  reset(keepScore) { this.model.reset(keepScore); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  resetAfterLife() { this.model.resetAfterLife(); }
  controlHint() { return this.controller.controlHint(); }
  get playerLives() { return this.model.side === "versus" ? this.model.playerLives : null; }
  update(dt, input) { this.controller.update(dt, input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  winMessage() { return this.model.winner === "computer" ? "Computer wins the space duel!" : "You win the space duel!"; }
  sideLabel() { return this.model.sideLabel(); }
}

export { AsteroidsModel } from "./model.js";
