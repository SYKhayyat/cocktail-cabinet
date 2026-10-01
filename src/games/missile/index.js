import { MissileModel } from "./model.js";
import { MissileController } from "./controller.js";
import { draw } from "./view.js";

export class MissileCommandGame {
  constructor() { this.model = new MissileModel(); this.controller = new MissileController(this.model); }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) { this.model.gameOver = value; }
  get won() { return this.model.won; }
  set won(value) { this.model.won = value; }
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
  update(dt, input) { this.controller.update(dt, input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  sideLabel() { return this.model.sideLabel(); }
}

export { MissileModel } from "./model.js";
