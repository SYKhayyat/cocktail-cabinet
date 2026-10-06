export class StarfallController {
  constructor(model) { this.model = model; this.holdTime = 0; }
  controlHint() {
    if (this.model.side === "stars") return [
      { keys: ["Click"], label: "send a star" },
      { keys: ["Drag"], label: "send a star with sideways velocity" },
      { keys: ["Double-click"], label: "send a gem" },
      { keys: ["Hold"], label: "send gems" }
    ];
    return [
      { keys: ["ArrowLeft", "ArrowRight"], label: "guide the runner" },
      { keys: ["A", "D"], label: "guide the runner" },
      { keys: ["Mouse"], label: "guide the runner" }
    ];
  }
  update(dt, input) {
    const pointer = input.pointer;
    // A long stationary hold spawns gems instead of a star. That suppression
    // belongs to the release which ends the hold, and only to that release.
    //
    // It used to be stored in a flag cleared only when a star actually spawned
    // -- but the flag itself is what prevents that, so the flag was never
    // cleared and every later click was suppressed for the rest of the round.
    let suppressRelease = false;
    if (pointer.down) {
      this.holdTime += dt;
    } else {
      suppressRelease = this.holdTime > 0.35 && (pointer.dragDistance || 0) < 4;
      this.holdTime = 0;
    }
    const isRelease = Boolean(pointer.released || (pointer.clicked && !pointer.down));
    const spawnStar = isRelease && !pointer.doubleClicked && !suppressRelease ? pointer : null;
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
