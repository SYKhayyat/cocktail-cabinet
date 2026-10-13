import { TWIST_TUNING } from "./model.js";

// Every key that moves the cursor. Listed so that "was this key pressed this
// frame" is one question asked one way rather than nine asked four times.
const CURSOR_KEYS = Object.freeze([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s"
]);

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
export class TwistController {
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

    const pointerCell = pointer.moved || pointer.down || pointer.clicked
      ? this.model.cellAt(pointer.x, pointer.y)
      : -1;

    this.keyHold = keyDown ? this.keyHold + dt : 0;
    this.pointerHold = pointer.down ? this.pointerHold + dt : 0;

    let act = null;
    if (keyDown && this.keyHold >= TWIST_TUNING.holdDelay && !this.keyPlaced) {
      this.keyPlaced = true;
      act = { kind: "place", cell: this.commitTarget(-1) };
    } else if (!keyDown && this.keyPlaced) {
      this.keyPlaced = false;
    } else if (input.pressed.has(" ") || input.pressed.has("Enter")) {
      act = { kind: tapping, cell: this.model.cursor };
    } else if (pointer.down && this.pointerHold >= TWIST_TUNING.holdDelay && !this.pointerPlaced) {
      this.pointerPlaced = true;
      act = { kind: "place", cell: this.commitTarget(pointerCell) };
    } else if (!pointer.down && this.pointerPlaced) {
      this.pointerPlaced = false;
    } else if (pointer.clicked) {
      act = { kind: tapping, cell: pointerCell };
    }

    this.model.update(dt, { hover: pointerCell, move: this.stepCursor(dt, input), act });
  }

  // Stepping the cursor.
  //
  // input.keys is what is *held*, not what was pressed, and update runs every
  // frame -- so stepping on every frame a key is down moves the cursor the width
  // of the board in a sixth of a second. That is not a cursor, and on the default
  // 3x3 it means one tap lands on an edge whichever way you meant to go.
  //
  // So a key moves once on press, waits, and then repeats at a steady rate. Both
  // axes are read independently, so a key held diagonally moves diagonally.
  stepCursor(dt, input) {
    const { keys, pressed } = input;
    const held = {
      x: (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0),
      y: (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0)
    };
    if (!held.x && !held.y) {
      this.keyRepeat = 0;
      this.repeating = false;
      return null;
    }
    const fresh = CURSOR_KEYS.some((key) => pressed.has(key));
    let move = null;
    if (fresh) {
      this.keyRepeat = 0;
      this.repeating = false;
      move = held;
    } else {
      this.keyRepeat += dt;
      const interval = this.repeating ? TWIST_TUNING.keyRepeatRate : TWIST_TUNING.keyRepeatDelay;
      if (this.keyRepeat >= interval) {
        this.keyRepeat = 0;
        this.repeating = true;
        move = held;
      }
    }
    return move;
  }
}
