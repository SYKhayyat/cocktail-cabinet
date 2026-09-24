import { SplatModel } from "./model.js";
import { SplatController } from "./controller.js";
import { draw } from "./view.js";

export class SplatGame {
  constructor() { this.model = new SplatModel(); this.controller = new SplatController(this.model); }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  setSide(side) { this.model.setSide(side); }
  reset(keepScore) { this.model.reset(keepScore); }
  update(dt, input) { this.controller.update(dt, input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  sideLabel() { return this.model.sideLabel(); }
}

export { SplatModel } from "./model.js";
