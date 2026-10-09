import { LAMP_TUNING } from "./model.js";

export class LampController {
  constructor(model) {
    this.model = model;
    this.pointerHold = 0;
  }

  // The freeze is stated in the hint itself, in the game's description and in
  // the nonvisual objective. It reads as a bug the first time anyone plays it,
  // so it is never left to be discovered.
  controlHint() {
    return [
      { keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"], label: "walk blind through the dark" },
      { keys: ["W", "A", "S", "D"], label: "walk blind through the dark" },
      { keys: ["Space"], label: "pulse the lamp — you cannot walk while it is lit" },
      { keys: ["Click"], label: "pulse the lamp once" },
      { keys: ["Hold"], label: "keep the lamp lit while light remains" }
    ];
  }

  update(dt, input) {
    let x = 0;
    let y = 0;
    if (input.keys.has("ArrowLeft") || input.keys.has("a")) x -= 1;
    if (input.keys.has("ArrowRight") || input.keys.has("d")) x += 1;
    if (input.keys.has("ArrowUp") || input.keys.has("w")) y -= 1;
    if (input.keys.has("ArrowDown") || input.keys.has("s")) y += 1;

    // Pressing and holding are reported separately, and a key can tell them
    // apart while a mouse cannot. A keydown is a clean edge, so Space is a tap
    // on press and a hold for as long as it is down. A mouse press is a press
    // held for as long as the hand takes, so it is a tap until it has been down
    // for pointerHoldDelay, and only then a hold. Without the threshold an
    // ordinary click cost a tap plus however long the button was held.
    const pointer = input.pointer;
    this.pointerHold = pointer.down ? this.pointerHold + dt : 0;
    const lampTap = input.pressed.has(" ") || pointer.clicked;
    const lampDown = input.keys.has(" ") || (pointer.down && this.pointerHold >= LAMP_TUNING.pointerHoldDelay);

    this.model.update(dt, { move: x || y ? { x, y } : null, lampDown, lampTap });
  }
}
