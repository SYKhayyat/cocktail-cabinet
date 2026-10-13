import { SKEW_TUNING } from "./model.js";

// The tap-versus-hold split is the whole of this file's judgement.
//
// With the preview setting off -- which is how it ships -- a tap places a mark
// and that is the entire verb. Turning the preview on makes the mechanic
// inspectable, and the price is that a placement is no longer a single gesture:
// a tap pins a preview of the cells that would turn over, and a press held past
// the threshold places anyway, for a player who has seen enough.
//
// A key can tell a tap from a hold. A keydown is a clean edge, so Space is a tap
// the instant it is pressed and a hold for as long as it stays down. A mouse
// press is a press held for as long as the hand takes, so a click is a tap until
// it has been down long enough to read as deliberate -- the same threshold Lamp
// uses, because it is already the cabinet's answer to this question.
//
// The pointer and the keyboard are tracked as two separate gestures. They never
// overlap in real play, and keeping them apart is what stops a release from one
// being swallowed by a hold from the other.
export class SkewController {
  constructor(model) {
    this.model = model;
    this.pointerHold = 0;
    this.keyHold = 0;
    // Set when a hold has already placed, cleared on release. Without it the
    // release at the end of a long press is also a click, and one deliberate
    // press would place a mark and then pin a preview of a move already made.
    this.pointerPlaced = false;
    this.keyPlaced = false;
  }

  controlHint() {
    if (this.model.previewEnabled) {
      return [
        { keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"], label: "move the cursor" },
        { keys: ["W", "A", "S", "D"], label: "move the cursor" },
        { keys: ["Space", "Enter", "Click"], label: "pin a preview of the flips" },
        { keys: ["Mouse"], label: "hover to see the flips" },
        { keys: ["Hold"], label: "place the pinned mark" }
      ];
    }
    return [
      { keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"], label: "move the cursor" },
      { keys: ["W", "A", "S", "D"], label: "move the cursor" },
      { keys: ["Space", "Enter", "Click"], label: "place your mark" },
      { keys: ["Mouse"], label: "place your mark" }
    ];
  }

  // Where a hold places. A pinned preview is a choice the player has already
  // made, so it outranks whatever the pointer happens to be resting on -- and
  // because the view draws the ghost on exactly this cell, the preview and the
  // target can never disagree.
  commitTarget(pointerCell) {
    if (this.model.pinned >= 0) return this.model.pinned;
    return pointerCell >= 0 ? pointerCell : this.model.cursor;
  }

  tapAct(cell) {
    return this.model.previewEnabled
      ? { kind: "preview", cell }
      : { kind: "place", cell };
  }

  update(dt, input) {
    const pointer = input.pointer;
    const keyDown = input.keys.has(" ") || input.keys.has("Enter");
    const tapping = this.model.previewEnabled ? "preview" : "place";

    let move = null;
    if (input.keys.has("ArrowLeft") || input.keys.has("a")) move = { x: -1, y: 0 };
    else if (input.keys.has("ArrowRight") || input.keys.has("d")) move = { x: 1, y: 0 };
    else if (input.keys.has("ArrowUp") || input.keys.has("w")) move = { x: 0, y: -1 };
    else if (input.keys.has("ArrowDown") || input.keys.has("s")) move = { x: 0, y: 1 };

    // Read the pointer only while it is genuinely over the board. A pointer
    // sitting still off the edge of the canvas must not pin a preview to a cell
    // the player is not looking at.
    const pointerCell = pointer.moved || pointer.down || pointer.clicked
      ? this.model.cellAt(pointer.x, pointer.y)
      : -1;

    this.keyHold = keyDown ? this.keyHold + dt : 0;
    this.pointerHold = pointer.down ? this.pointerHold + dt : 0;

    let act = null;
    if (keyDown && this.keyHold >= SKEW_TUNING.holdDelay && !this.keyPlaced) {
      this.keyPlaced = true;
      act = { kind: "place", cell: this.commitTarget(-1) };
    } else if (!keyDown && this.keyPlaced) {
      this.keyPlaced = false;
    } else if (input.pressed.has(" ") || input.pressed.has("Enter")) {
      act = { kind: tapping, cell: this.model.cursor };
    } else if (pointer.down && this.pointerHold >= SKEW_TUNING.holdDelay && !this.pointerPlaced) {
      this.pointerPlaced = true;
      act = { kind: "place", cell: this.commitTarget(pointerCell) };
    } else if (!pointer.down && this.pointerPlaced) {
      this.pointerPlaced = false;
    } else if (pointer.clicked) {
      act = { kind: tapping, cell: pointerCell };
    }

    this.model.update(dt, { hover: pointerCell, move, act });
  }
}