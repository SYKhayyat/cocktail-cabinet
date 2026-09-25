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
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  setSide(side) { this.model.setSide(side); }
  reset(keepScore) { this.model.reset(keepScore); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  update(dt, input) { this.controller.update(dt, input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  sideLabel() { return this.model.sideLabel(); }
}

export { MissileModel } from "./model.js";
