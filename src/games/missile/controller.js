export class MissileController {
  constructor(model) { this.model = model; }
  update(dt, input) {
    this.model.update(dt, {
      aim: input.pointer,
      launch: input.pressed.has(" "),
      attack: input.pointer.clicked ? input.pointer : null,
    });
  }
}
