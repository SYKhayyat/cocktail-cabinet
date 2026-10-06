export class SplatController {
  constructor(model) { this.model = model; }
  controlHint() {
    if (this.model.side === "builder") return [
      { keys: ["ArrowLeft", "ArrowRight"], label: "select column" },
      { keys: ["A", "D"], label: "move column" },
      { keys: ["ArrowUp", "ArrowDown"], label: "move gap" },
      { keys: ["Q", "E"], label: "resize gap" },
      { keys: ["C", "G"], label: "column/gap tool" },
      { keys: ["N", "Delete"], label: "add/remove column" },
      { keys: ["PageUp", "PageDown"], label: "pan" }
    ];
    return [
      { keys: ["ArrowUp", "ArrowDown"], label: "drift" },
      { keys: ["W", "S"], label: "drift" },
      { keys: ["Click"], label: "bounce" }
    ];
  }
  update(dt, input) {
    if (this.model.side === "builder") {
      this.model.update(dt, this.builderInput(input));
      return;
    }
    const drift = input.keys.has("ArrowUp") || input.keys.has("w") ? -1 : input.keys.has("ArrowDown") || input.keys.has("s") ? 1 : 0;
    const keyBounce = input.pressed.has("ArrowUp") || input.pressed.has("w") ? -1 : input.pressed.has("ArrowDown") || input.pressed.has("s") ? 1 : 0;
    const clickBounce = input.pointer.clicked ? (input.pointer.y < 280 ? -1 : 1) : 0;
    const bounce = keyBounce || clickBounce;
    this.model.update(dt, { drift, bounce, pointer: input.pointer });
  }
  builderInput(input) {
    const pressed = new Set([...input.pressed || []].map((key) => key.length === 1 ? key.toLowerCase() : key));
    return {
      pointer: input.pointer,
      builderActions: {
        select: pressed.has("ArrowLeft") ? -1 : pressed.has("ArrowRight") ? 1 : 0,
        first: pressed.has("Home"), last: pressed.has("End"),
        move: pressed.has("a") ? -10 : pressed.has("d") ? 10 : 0,
        gapMove: pressed.has("ArrowUp") ? -10 : pressed.has("ArrowDown") ? 10 : 0,
        gapResize: pressed.has("q") ? -10 : pressed.has("e") ? 10 : 0,
        tool: pressed.has("c") ? "column" : pressed.has("g") ? "gap" : null,
        add: pressed.has("n"), remove: pressed.has("Delete"),
        pan: pressed.has("PageUp") ? -400 : pressed.has("PageDown") ? 400 : 0
      }
    };
  }
  handleReadyInput(input) { if (this.model.side === "builder") this.model.handleBuilderInput(this.builderInput(input)); }
  handlePausedInput(input) { this.model.handlePausedInput(this.model.side === "builder" ? this.builderInput(input) : input); }
}
