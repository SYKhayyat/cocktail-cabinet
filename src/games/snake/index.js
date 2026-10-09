import { SnakeModel } from "./model.js";
import { SnakeController } from "./controller.js";
import { draw } from "./view.js";
import { createGameLifecycle } from "../../game-lifecycle.js";
import { playSounds } from "../../audio.js";

export class SnakeGame {
  constructor() {
    this.model = new SnakeModel();
    this.controller = new SnakeController(this.model);
    this.lifecycle = createGameLifecycle(this, {
      startRound: () => this.model.reset(),
      restartAfterLife: () => this.model.reset(true, this.model.snake.length)
    });
  }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get snake() { return this.model.snake; }
  get apple() { return this.model.apple; }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) {
    // The host decides a loss as often as the model does, so this is where
    // a won/lose transition is caught whichever side set it.
    if (value && !this.model.gameOver) this.model.emit("lose");
    this.model.gameOver = value;
  }
  get won() { return this.model.won; }
  set won(value) {
    // The host decides a loss as often as the model does, so this is where
    // a won/lose transition is caught whichever side set it.
    if (value && !this.model.won) this.model.emit("win");
    this.model.won = value;
  }
  winMessage() { return `You filled the board — ${this.model.score} apples!`; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  get lossReason() { return this.model.lossReason; }
  set lossReason(value) { this.model.lossReason = value; }
  sideLabel() { return this.model.sideLabel(); }
  get modes() { return this.model.modes; }
  get sides() { return this.model.sides; }
  get settings() { return this.model.settings; }
  validateSettings(values) { return this.model.validateSettings?.(values); }
  setSide(side) { this.model.setSide(side); }
  setSettings(settings) { this.model.setSettings(settings); }
  applyPendingSettings() { this.model.applyPendingSettings(); }
  reset(keepScore, length) { this.model.reset(keepScore, length); }
  controlHint() { return this.controller.controlHint(); }
  cellWidth() { return this.model.cellWidth(); }
  cellHeight() { return this.model.cellHeight(); }
  cellFromPointer(pointer) { return this.model.cellFromPointer(pointer); }
  cellCenter(cell) { return this.model.cellCenter(cell); }
  moveInterval() { return this.model.moveInterval(); }
  update(dt, input) {
    this.controller.update(dt, input);
    // The one bridge from a model's events to the audio hardware. Models never
    // touch AudioContext, which the boundary check rightly forbids.
    playSounds("snake", this.model.drainEvents());
  }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
}

export { SnakeModel } from "./model.js";
