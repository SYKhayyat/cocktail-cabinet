export class SplatController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    const drift = input.keys.has("ArrowUp") || input.keys.has("w") ? -1 : input.keys.has("ArrowDown") || input.keys.has("s") ? 1 : 0;
    const keyBounce = input.pressed.has("ArrowUp") || input.pressed.has("w") ? -1 : input.pressed.has("ArrowDown") || input.pressed.has("s") ? 1 : 0;
    const clickBounce = input.pointer.clicked ? (input.pointer.y < 280 ? -1 : 1) : 0;
    const bounce = keyBounce || clickBounce;
    this.model.update(dt, {
      drift,
      bounce,
      pointer: input.pointer,
      scrollDeltaX: input.scrollDeltaX || 0,
      placeColumnX: input.pointer.clicked ? input.pointer.x : undefined,
    });
  }
  handleReadyInput(input) { if (this.model.side === "builder" || this.model.side === "layout") this.model.handleBuilderInput(input); }
  handlePausedInput(input) { this.model.handlePausedInput(input); }
}
