import { SnakeModel } from "./model.js";
import { SnakeController } from "./controller.js";
import { draw } from "./view.js";

export class SnakeGame {
  constructor() {
    this.model = new SnakeModel();
    this.controller = new SnakeController(this.model);
  }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get snake() { return this.model.snake; }
  get apple() { return this.model.apple; }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) { this.model.gameOver = value; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  get lossReason() { return this.model.lossReason; }
  set lossReason(value) { this.model.lossReason = value; }
  set engine(value) { this.model.engine = value; }
  get engine() { return this.model.engine; }
  sideLabel() { return this.model.sideLabel(); }
  setSide(side) { this.model.setSide(side); }
  setSettings(settings) { this.model.setSettings(settings); }
  applyPendingSettings() { this.model.applyPendingSettings(); }
  reset(keepScore, length) { this.model.reset(keepScore, length); }
  cellWidth() { return this.model.cellWidth(); }
  cellHeight() { return this.model.cellHeight(); }
  cellFromPointer(pointer) { return this.model.cellFromPointer(pointer); }
  cellCenter(cell) { return this.model.cellCenter(cell); }
  moveInterval() { return this.model.moveInterval(); }
  update(dt, input) { this.controller.update(dt, input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
}

export { SnakeModel } from "./model.js";
