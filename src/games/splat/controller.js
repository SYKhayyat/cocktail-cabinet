export class SplatController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    this.model.update(dt, {
      keyDirection: (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0),
      mode: input.mode,
      pointerX: input.pointer.x,
      pointerMoved: input.pointer.moved,
      placePlatform: input.pointer.clicked ? input.pointer.x - 60 : undefined,
    });
  }
}
