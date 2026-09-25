export class StarfallController {
  constructor(model) { this.model = model; this.holdTime = 0; this.suppressNextStar = false; }
  update(dt, input) {
    const pointer = input.pointer;
    if (pointer.down) this.holdTime += dt;
    else {
      if (this.holdTime > 0.35 && (pointer.dragDistance || 0) < 4) this.suppressNextStar = true;
      this.holdTime = 0;
    }
    const spawnStar = !pointer.doubleClicked && !this.suppressNextStar && (pointer.released || (pointer.clicked && !pointer.down)) ? pointer : null;
    if (spawnStar) this.suppressNextStar = false;
    this.model.update(dt, {
      keyDirection: (input.keys.has("ArrowRight") || input.keys.has("d") ? 1 : 0) - (input.keys.has("ArrowLeft") || input.keys.has("a") ? 1 : 0),
      pointerX: pointer.x,
      pointerDown: pointer.down,
      pointerDragDistance: pointer.dragDistance || 0,
      mode: input.mode,
      spawnStar,
      spawnGem: pointer.doubleClicked ? pointer : null,
    });
  }
}
