import { StarfallModel } from "./model.js";
import { StarfallController } from "./controller.js";
import { draw } from "./view.js";

export class StarfallGame {
  constructor() { this.model = new StarfallModel(); this.controller = new StarfallController(this.model); }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get runner() { return this.model.runner; }
  get stars() { return this.model.stars; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  setSide(side) { this.model.setSide(side); }
  reset(keepScore) { this.model.reset(keepScore); }
  update(dt, input) { this.controller.update(dt, input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  sideLabel() { return this.model.sideLabel(); }
}

export { StarfallModel } from "./model.js";
