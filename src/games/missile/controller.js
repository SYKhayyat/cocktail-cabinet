export class MissileController {
  constructor(model) { this.model = model; }
  controlHint() {
    if (this.model.side === "attacker") return [
      { keys: ["Click"], label: "send an enemy missile toward the nearest city or battery" },
      { keys: ["Drag"], label: "release an enemy missile with velocity" }
    ];
    return [
      { keys: ["ArrowLeft", "ArrowRight"], label: "choose a battery" },
      { keys: ["Space"], label: "launch" },
      { keys: ["Mouse"], label: "aim the crosshair" },
      { keys: ["Click"], label: "launch at the crosshair" }
    ];
  }
  update(dt, input) {
    const pointer = input.pointer.moved || input.pointer.down || input.pointer.clicked || input.pointer.released ? input.pointer : null;
    this.model.update(dt, {
      aim: pointer,
      batteryDirection: (input.pressed.has("ArrowRight") ? 1 : 0) - (input.pressed.has("ArrowLeft") ? 1 : 0),
      launch: input.pressed.has(" ") || input.pointer.clicked,
      attack: input.pointer.released ? input.pointer : null,
    });
  }
}
