export class LampController {
  constructor(model) { this.model = model; }

  // The freeze is stated in the hint itself, in the game's description and in
  // the nonvisual objective. It reads as a bug the first time anyone plays it,
  // so it is never left to be discovered.
  controlHint() {
    return [
      { keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"], label: "walk blind through the dark" },
      { keys: ["W", "A", "S", "D"], label: "walk blind through the dark" },
      { keys: ["Space"], label: "pulse the lamp — you cannot walk while it is lit" },
      { keys: ["Click"], label: "pulse the lamp" },
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
    // Both the key and the pointer are "hold the lamp": whichever the player
    // uses, the model sees one rising and falling edge from the same flag.
    const lampDown = input.keys.has(" ") || input.pointer.down;
    this.model.update(dt, { move: x || y ? { x, y } : null, lampDown });
  }
}