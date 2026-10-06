import { AsteroidsModel } from "./model.js";
import { AsteroidsController } from "./controller.js";
import { draw } from "./view.js";
import { createGameLifecycle } from "../../game-lifecycle.js";

export class AsteroidsGame {
  constructor() {
    this.model = new AsteroidsModel();
    this.controller = new AsteroidsController(this.model);
    this.lifecycle = createGameLifecycle(this, {
      startRound: (context) => this.model.reset(false, context),
      clampLives: (max) => this.model.clampLives(max),
      restartAfterLife: () => this.model.resetAfterLife(),
      lifeState: () => this.model.side === "versus"
        ? { owner: "game", remaining: this.model.playerLives.human, players: { ...this.model.playerLives } }
        : { owner: "host" }
    });
  }
  get id() { return this.model.id; }
  get title() { return this.model.title; }
  get description() { return this.model.description; }
  get side() { return this.model.side; }
  get score() { return this.model.score; }
  get won() { return this.model.won; }
  set won(value) { this.model.won = value; }
  get winner() { return this.model.winner; }
  get versusTie() { return this.model.versusTie; }
  get gameOver() { return this.model.gameOver; }
  set gameOver(value) { this.model.gameOver = value; }
  get lifeLost() { return this.model.lifeLost; }
  set lifeLost(value) { this.model.lifeLost = value; }
  get modes() { return this.model.modes; }
  get sides() { return this.model.sides; }
  get settings() { return this.model.settings; }
  validateSettings(values) { return this.model.validateSettings?.(values); }
  setSide(side) { this.model.setSide(side); }
  reset(keepScore, context = this.lifecycle.roundContext) { this.model.reset(keepScore, context); }
  handleLifeLoss() { return this.model.handleLifeLoss(); }
  resetAfterLife() { this.model.resetAfterLife(); }
  controlHint() { return this.controller.controlHint(); }
  get playerLives() { return this.model.side === "versus" ? this.model.playerLives : null; }
  update(dt, input) { this.controller.update(dt, input); }
  draw(context) { draw(this.model, context); }
  publicState() { return this.model.publicState(); }
  winMessage() { return this.model.versusTie ? "Space duel tie — both pilots are out of lives." : this.model.winner === "computer" ? "Computer wins the space duel!" : "You win the space duel!"; }
  sideLabel() { return this.model.sideLabel(); }
}

export { AsteroidsModel } from "./model.js";
