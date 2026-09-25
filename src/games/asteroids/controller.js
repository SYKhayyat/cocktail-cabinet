export class AsteroidsController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    this.model.update(dt, {
      turn: (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0),
      thrust: input.keys.has("ArrowUp") || input.keys.has("w") ? 1 : 0,
      pointer: input.pointer.moved || input.pointer.down || input.pointer.clicked || input.pointer.released ? input.pointer : null,
      fire: input.pressed.has(" ") || input.pointer.clicked || input.pointer.down,
      spawnAsteroid: null,
    });
  }
}
