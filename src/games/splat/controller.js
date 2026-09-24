export class SplatController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    const keyThrust = input.pressed.has("ArrowUp") || input.pressed.has("w") ? -1 : input.pressed.has("ArrowDown") || input.pressed.has("s") ? 1 : 0;
    const pointerThrust = input.pointer.clicked ? (input.pointer.y < 280 ? -1 : 1) : 0;
    this.model.update(dt, {
      thrust: keyThrust || pointerThrust,
      placeColumnX: input.pointer.clicked ? input.pointer.x : undefined,
    });
  }
}
