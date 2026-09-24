export class SnakeController {
  constructor(model) {
    this.model = model;
  }
  update(dt, input) {
    const direction = input.pressed.has("ArrowUp") || input.pressed.has("w") ? { x: 0, y: -1 } : input.pressed.has("ArrowDown") || input.pressed.has("s") ? { x: 0, y: 1 } : input.pressed.has("ArrowLeft") || input.pressed.has("a") ? { x: -1, y: 0 } : input.pressed.has("ArrowRight") || input.pressed.has("d") ? { x: 1, y: 0 } : null;
    this.model.update(dt, {
      direction,
      steer: input.pointer.down ? input.pointer : null,
      placeApple: input.pointer.clicked ? input.pointer : null,
    });
  }
}
