export class BreakoutController {
  constructor(model) {
    this.model = model;
  }
  update(dt, input) {
    this.model.update(dt, {
      mode: input.mode,
      keyDirection: (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0),
      pointer: input.pointer || { x: 0, y: 0, moved: false, clicked: false, down: false },
    });
  }
  handleReadyInput(input) {
    this.model.updateBlocks({
      pointer: input.pointer || { x: 0, y: 0, moved: false, clicked: false, down: false },
    });
  }
}
