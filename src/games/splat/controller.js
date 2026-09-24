export class SplatController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    const drift = input.keys.has("ArrowUp") || input.keys.has("w") ? -1 : input.keys.has("ArrowDown") || input.keys.has("s") ? 1 : 0;
    const bounce = input.pointer.clicked ? (input.pointer.y < 280 ? -1 : 1) : 0;
    this.model.update(dt, {
      drift,
      bounce,
      placeColumnX: input.pointer.clicked ? input.pointer.x : undefined,
    });
  }
}
