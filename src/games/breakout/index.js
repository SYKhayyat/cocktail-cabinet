import { BreakoutModel, BRICK_LABELS } from "./model.js";
import { BreakoutController } from "./controller.js";
import { draw } from "./view.js";

export class BreakoutGame {
  constructor() {
    this.model = new BreakoutModel();
    this.controller = new BreakoutController(this.model);
  }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get scores() { return this.model.scores; }
  get human() { return this.model.human; }
  get computer() { return this.model.computer; }
  get balls() { return this.model.balls; }
  get bricks() { return this.model.bricks; }
  get playerLives() { return this.model.playerLives; }
  get winner() { return this.model.winner; }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) { this.model.gameOver = value; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  get won() { return this.model.won; }
  set won(value) { this.model.won = value; }
  set engine(value) { this.model.engine = value; }
  sideLabel() { return this.model.sideLabel(); }
  setSide(side) { this.model.setSide(side); }
  reset(keepScore) { this.model.reset(keepScore); }
  resetAfterLife() { this.model.resetAfterLife(); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  winMessage() { return this.model.winner === "computer" ? "Computer wins the duel!" : "You win the duel!"; }
  update(dt, input) { this.controller.update(dt, input); }
  handleReadyInput(input) { this.controller.handleReadyInput(input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
}

export { BreakoutModel, BRICK_LABELS } from "./model.js";
