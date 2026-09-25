export class MissileController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    const pointer = input.pointer.moved || input.pointer.down || input.pointer.clicked || input.pointer.released ? input.pointer : null;
    this.model.update(dt, {
      aim: pointer,
      batteryDirection: (input.pressed.has("ArrowRight") ? 1 : 0) - (input.pressed.has("ArrowLeft") ? 1 : 0),
      launch: input.pointer.clicked,
      attack: input.pointer.released ? input.pointer : null,
    });
  }
}
