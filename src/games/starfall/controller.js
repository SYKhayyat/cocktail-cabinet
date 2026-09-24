export class StarfallController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    this.model.update(dt, {
      keyDirection: (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0),
      pointerX: input.pointer.x,
      spawnStar: input.pointer.clicked ? input.pointer : null,
    });
  }
}
