export class SplatController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    const keyThrust = input.keys.has("ArrowUp") || input.keys.has("w") ? -1 : input.keys.has("ArrowDown") || input.keys.has("s") ? 1 : 0;
    const clickThrust = input.pointer.clicked ? (input.pointer.y < 280 ? -1 : 1) : 0;
    this.model.update(dt, {
      thrust: keyThrust,
      impulse: clickThrust,
      placeColumnX: input.pointer.clicked ? input.pointer.x : undefined,
    });
  }
}
