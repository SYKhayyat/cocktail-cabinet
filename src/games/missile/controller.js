export class MissileController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    this.model.update(dt, {
      aim: input.pointer,
      batteryDirection: (input.pressed.has("ArrowRight") ? 1 : 0) - (input.pressed.has("ArrowLeft") ? 1 : 0),
      launch: input.pointer.clicked,
      attack: input.pointer.clicked ? input.pointer : null,
    });
  }
}
