import { beginCanvasTextFrame, CANVAS_PALETTE, drawText, endCanvasTextFrame } from "./rendering.js";
import { createGameLifecycle } from "./game-lifecycle.js";

// Compatibility for existing consumers; models and views import their own layer.
export { clamp, distance, circleHitsCircle, circleHitsRect } from "./geometry.js";
export { DECISION_LOG_LIMIT, recordDecision } from "./decisions.js";
export { drawText } from "./rendering.js";

const DEFAULT_LIVES = 3;
const MIN_LIVES = 1;
const MAX_LIVES = 9;

export class GameEngine {
  constructor(canvas, { onState, onScore, onMessage, onLives } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onState = onState;
    this.onScore = onScore;
    this.onMessage = onMessage;
    this.onLives = onLives;
    this.game = null;
    this.lifecycle = null;
    this.running = false;
    this.stopped = false;
    this.paused = false;
    this.ready = false;
    this.countdown = 0;
    this.assistance = false;
    this.assistanceOutcome = "";
    this.lives = DEFAULT_LIVES;
    this.maxLives = DEFAULT_LIVES;
    this.pendingLives = DEFAULT_LIVES;
    this.lastTime = 0;
    this.animationFrame = 0;
    this.input = {
      keys: new Set(),
      pressed: new Set(),
      pointer: { x: 0, y: 0, down: false, clicked: false, moved: false, released: false, doubleClicked: false, dragStartX: 0, dragStartY: 0, lastX: 0, lastY: 0, dragDeltaX: 0, dragDeltaY: 0, dragDistance: 0 },
      mode: "keyboard",
      scrollDeltaX: 0
    };
    this.activePointerId = null;
    this.lastPointerClickAt = 0;
    this.lastPointerClickX = 0;
    this.lastPointerClickY = 0;

    this.clearTransientPointer = () => {
      this.input.pointer.clicked = false;
      this.input.pointer.released = false;
      this.input.pointer.doubleClicked = false;
      this.input.pointer.moved = false;
      this.input.pointer.dragDeltaX = 0;
      this.input.pointer.dragDeltaY = 0;
      this.input.pointer.dragDistance = 0;
      this.input.scrollDeltaX = 0;
    };

    this.cancelPointer = () => {
      const pointer = this.input.pointer;
      this.activePointerId = null;
      this.lastPointerClickAt = 0;
      this.lastPointerClickX = 0;
      this.lastPointerClickY = 0;
      this.clearTransientPointer();
      pointer.down = false;
      pointer.dragStartX = pointer.x;
      pointer.dragStartY = pointer.y;
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
    };

    this.clearInput = () => {
      this.input.keys.clear();
      this.input.pressed.clear();
      this.cancelPointer();
    };
    this.handleBlur = () => this.clearInput();
    this.inputDocument = canvas.ownerDocument || globalThis.document;
    this.handleVisibilityChange = () => {
      if (this.inputDocument?.hidden) this.clearInput();
    };

    this.handleKeyDown = (event) => {
      if (this.assistance) return;
      const tagName = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tagName) || event.target?.closest?.("button, input, textarea, select, a[href], [role='button']") || event.target?.isContentEditable) return;
      // A repeat from a key held across a round/focus boundary is not a fresh
      // press. Wait for release and a real keydown before accepting it again.
      if (event.repeat && !this.input.keys.has(event.key)) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      if (this.game?.side === "builder" && ["PageUp", "PageDown", "Home", "End", "Delete"].includes(event.key)) event.preventDefault();
      this.input.mode = "keyboard";
      if (!this.input.keys.has(event.key)) this.input.pressed.add(event.key);
      this.input.keys.add(event.key);
    };
    this.handleKeyUp = (event) => this.input.keys.delete(event.key);
    this.handleFocusIn = () => {
      // A key held while Tab moves to a native control must not keep steering
      // or become a queued action after the user returns to the board.
      this.input.keys.clear();
      this.input.pressed.clear();
    };
    this.handlePointerMove = (event) => {
      if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
      this.input.mode = "mouse";
      this.input.pointer.moved = true;
      const bounds = this.canvas.getBoundingClientRect();
      const previousX = this.input.pointer.x;
      const previousY = this.input.pointer.y;
      this.input.pointer.x = (event.clientX - bounds.left) * this.canvas.width / bounds.width;
      this.input.pointer.y = (event.clientY - bounds.top) * this.canvas.height / bounds.height;
      this.input.pointer.lastX = this.input.pointer.x;
      this.input.pointer.lastY = this.input.pointer.y;
      if (this.input.pointer.down) {
        this.input.pointer.dragDeltaX += this.input.pointer.x - previousX;
        this.input.pointer.dragDeltaY += this.input.pointer.y - previousY;
        this.input.pointer.dragDistance += Math.hypot(this.input.pointer.x - previousX, this.input.pointer.y - previousY);
      }
    };
    this.handlePointerDown = (event) => {
      if (this.activePointerId !== null) return;
      this.activePointerId = event.pointerId;
      this.handlePointerMove(event);
      const now = performance.now();
      const isDoubleClick = now - this.lastPointerClickAt < 350 && Math.hypot(event.clientX - this.lastPointerClickX, event.clientY - this.lastPointerClickY) < 24;
      this.input.pointer.doubleClicked = isDoubleClick;
      if (isDoubleClick) this.lastPointerClickAt = 0;
      else {
        this.lastPointerClickAt = now;
        this.lastPointerClickX = event.clientX;
        this.lastPointerClickY = event.clientY;
      }
      this.input.pointer.down = true;
      this.input.pointer.clicked = true;
      this.input.pointer.released = false;
      this.input.pointer.dragStartX = this.input.pointer.x;
      this.input.pointer.dragStartY = this.input.pointer.y;
      this.input.pointer.lastX = this.input.pointer.x;
      this.input.pointer.lastY = this.input.pointer.y;
      this.input.pointer.dragDeltaX = 0;
      this.input.pointer.dragDeltaY = 0;
      this.input.pointer.dragDistance = 0;
    };
    this.handlePointerUp = (event) => {
      if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;
      this.handlePointerMove(event);
      this.input.pointer.down = false;
      this.input.pointer.released = true;
      this.activePointerId = null;
    };
    this.handlePointerCancel = (event) => {
      if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
      this.cancelPointer();
    };
     this.handleDoubleClick = () => {
       this.input.pointer.doubleClicked = true;
       this.input.pointer.released = true;
     };
     this.handleWheel = (event) => {
      this.input.scrollDeltaX += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      // Builder advertises "Wheel to pan", so the wheel over the board pans the
      // camera instead of scrolling the page out from under the player.
      if (this.game?.side === "builder") event.preventDefault();
    };

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    this.inputDocument?.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("focusin", this.handleFocusIn);
    canvas.addEventListener("pointermove", this.handlePointerMove);
     canvas.addEventListener("pointerdown", this.handlePointerDown);
     canvas.addEventListener("dblclick", this.handleDoubleClick);
     // Not passive: Builder uses the wheel to pan, so it must be able to stop
    // the page scrolling behind it.
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerCancel);
  }

  load(game) {
    this.stop();
    this.game?.destroy?.();
    this.game = game;
    this.lifecycle = game.lifecycle || createGameLifecycle(game);
    const interactive = this.lifecycle.boot === "interactive";
    this.stopped = !interactive;
    this.paused = false;
    this.ready = !interactive;
    this.countdown = 0;
    this.applyLives();
    this.startRound("load");
    this.onState?.(game.publicState());
    this.running = true;
    this.lastTime = performance.now();
    this.animationFrame = requestAnimationFrame((time) => this.frame(time));
  }

  stop() {
    this.clearInput();
    this.running = false;
    this.stopped = true;
    cancelAnimationFrame(this.animationFrame);
  }

  // Pause freezes whatever is happening, including the countdown. Previously the
  // countdown kept advancing while stopped, so pressing Continue during it was
  // a no-op -- yet the message still said to press Continue. That is the race
  // this contract removes: Continue is always actionable whenever Pause was.
  pauseGame() {
    if (!this.running || this.ready || this.paused || this.game?.gameOver || this.lifecycle?.resultState().ended) return;
    this.stopped = true;
    this.paused = true;
    this.onMessage?.("Paused — press Continue when you are ready.");
  }

  continueGame() {
    // No countdown guard: pausing freezes the countdown, so resuming continues
    // it from exactly where it stopped rather than restarting it.
    if (!this.running || this.ready || this.game?.gameOver || this.lifecycle?.resultState().ended || !this.paused) return;
    this.stopped = false;
    this.paused = false;
    this.lastTime = performance.now();
    if (this.countdown > 0) this.onMessage?.(`Continuing in ${Math.ceil(this.countdown)}…`);
    else this.onMessage?.("Continuing.");
  }

  setLives(value) {
    const parsed = Math.trunc(Number(value));
    const next = Number.isFinite(parsed) ? Math.max(MIN_LIVES, Math.min(MAX_LIVES, parsed)) : DEFAULT_LIVES;
    if (next === this.pendingLives) return;
    this.pendingLives = next;
    if (!this.game) {
      this.maxLives = next;
      this.lives = next;
      this.onLives?.(this.lives, this.maxLives);
      return;
    }
    if (next < this.maxLives) {
      this.maxLives = next;
      this.lives = Math.min(this.lives, next);
      // Game-owned rounds have their own authoritative counters. Clamp those
      // counters too, otherwise the overlay can show more lives than the
      // configured maximum and a later retry silently spends an old budget.
      this.lifecycle.clampLives(next);
      const life = this.lifecycle.lifeState();
      if (life.owner === "game") this.lives = life.remaining;
      this.onLives?.(this.lives, this.maxLives);
      this.onMessage?.(`Lives set to ${next} — lowered straight away.`);
    } else {
      this.onMessage?.(`Lives set to ${next} — applies from the next game.`);
    }
  }

  applyLives() {
    this.maxLives = this.pendingLives;
    this.lives = this.maxLives;
    this.onLives?.(this.lives, this.maxLives);
  }

  startRound(reason) {
    this.assistanceOutcome = "";
    this.lifecycle.startRound(Object.freeze({ startingLives: this.maxLives, reason }));
  }

  addLife() {
    this.maxLives = Math.min(MAX_LIVES, this.maxLives + 1);
    const life = this.lifecycle?.lifeState();
    this.lives = life?.owner === "game" ? life.remaining : Math.min(this.maxLives, this.lives + 1);
    this.pendingLives = Math.max(this.pendingLives, this.maxLives);
    this.onLives?.(this.lives, this.maxLives);
  }

  handleLifeLoss() {
    this.clearInput();
    const loss = this.lifecycle.resolveLifeLoss();
    if (this.assistance) this.assistanceOutcome = loss.message || "A life was lost.";
    const life = this.lifecycle.lifeState();
    if (life.owner === "host") {
      this.lives = Math.max(0, this.lives - 1);
      this.onLives?.(this.lives, this.maxLives);
    } else if (life.owner === "game") {
      if (life.mirrorHost) this.lives = life.remaining;
      this.onLives?.(life.remaining, this.maxLives);
    }
    const remaining = life.owner === "game" ? life.remaining : this.lives;
    if (loss.gameOver) {
      this.lifecycle.endRound();
      this.stopped = true;
      this.onMessage?.(loss.message);
    } else if (remaining > 0 && this.lifecycle.restartAfterLife) {
      this.lifecycle.restartAfterLife();
      this.countdown = 3;
      this.onMessage?.(loss.message);
    } else {
      this.lifecycle.endRound();
      this.stopped = true;
      if (this.assistance) this.assistanceOutcome += " Out of lives.";
      this.onMessage?.("Out of lives — press New game to try again.");
    }
  }

  // Assistance advances the same rules and lifecycle, in small physics ticks.
  // RAF still draws, but neither time nor ambient keyboard/pointer input runs.
  setAssistance(enabled) {
    this.assistance = Boolean(enabled);
    this.input.keys.clear();
    this.input.pressed.clear();
    this.cancelPointer();
    this.lastTime = performance.now();
  }

  resolveUpdate() {
    for (const reward of this.lifecycle.takeRewards()) {
      if (reward.type === "extra-life") this.addLife();
    }
    const result = this.lifecycle.resultState();
    if (result.won) {
      this.stopped = true;
      if (this.assistance) this.assistanceOutcome = `${result.heading}. ${result.message || ""}`;
      this.onMessage?.(result.message);
    } else if (this.lifecycle.lifeLossPending()) this.handleLifeLoss();
  }

  assistanceStep(seconds, update) {
    if (!this.assistance || this.ready || this.paused || this.stopped) return false;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 1) return false;
    // Countdown is presentation, not game physics. Explicit steps skip it.
    this.countdown = 0;
    const ticks = Math.ceil(seconds * 60);
    for (let tick = 0; tick < ticks; tick += 1) {
      update(seconds / ticks, tick === 0);
      this.resolveUpdate();
      // Do not run through a life-reset or terminal result with stale targets.
      if (this.stopped || this.countdown > 0) break;
    }
    this.onState?.(this.game.publicState());
    this.onScore?.(this.game.score);
    return true;
  }

  frame(time) {
    if (!this.running) return;
    const frameTime = Number.isFinite(time) ? Math.max(time, this.lastTime) : this.lastTime;
    const delta = Math.min((frameTime - this.lastTime) / 1000, 0.05);
    this.lastTime = frameTime;
    if (this.countdown > 0 && !this.paused && !this.assistance) {
      this.countdown -= delta;
      if (this.countdown <= 0) this.onMessage?.("Go!");
    } else if (!this.ready && !this.stopped && !this.assistance) {
      this.game.update(delta, this.input);
      this.resolveUpdate();
    }
    if (!this.assistance && this.ready) this.game.handleReadyInput?.(this.input);
    else if (!this.assistance && this.paused) this.game.handlePausedInput?.(this.input);
    beginCanvasTextFrame(this.context);
    this.game.draw(this.context);
    if (this.ready || this.countdown > 0 || this.stopped) {
      this.context.fillStyle = "#111827ee";
      this.context.fillRect(250, 238, 300, 120);
      this.context.strokeStyle = "#fbbf24";
      this.context.lineWidth = 2;
      this.context.strokeRect(250, 238, 300, 120);
      this.context.lineWidth = 1;
      const result = this.lifecycle.resultState();
      const life = this.lifecycle.lifeState();
      const heading = this.ready ? "READY" : this.countdown > 0 ? "GET READY" : result.ended ? result.heading : "PAUSED";
      const instruction = this.ready ? "Press New game to start" : this.countdown > 0 ? `Starting in ${Math.ceil(this.countdown)}…` : result.ended ? result.instruction : "Press Continue to resume";
      const lifeText = life.owner === "none" ? "No life budget" : life.players ? `You: ${life.players.human}    Computer: ${life.players.computer}` : `Lives: ${life.owner === "game" ? life.remaining : this.lives}/${this.maxLives}`;
      drawText(this.context, heading, 400, 275, 24, CANVAS_PALETTE.warning, "center");
      drawText(this.context, `Score: ${this.game.score}    ${lifeText}`, 400, 310, 16, CANVAS_PALETTE.text, "center");
      drawText(this.context, instruction, 400, 340, 14, CANVAS_PALETTE.secondary, "center");
    }
    endCanvasTextFrame(this.context);
    this.input.pressed.clear();
    this.clearTransientPointer();
    this.onState?.(this.game.publicState());
    this.onScore?.(this.game.score);
    this.animationFrame = requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  restart() {
    if (!this.game) return;
    this.clearInput();
    this.stopped = false;
    this.paused = false;
    this.ready = false;
    this.countdown = 3;
    this.applyLives();
    this.startRound("restart");
    this.onMessage?.("New game — starting in 3…");
  }

  setSide(side) {
    if (!this.game) return;
    this.clearInput();
    this.game.setSide(side);
    this.stopped = false;
    this.paused = false;
    this.ready = false;
    this.countdown = 0;
    this.applyLives();
    this.startRound("side");
    this.onMessage?.(`${this.game.title}: ${this.game.sideLabel()}`);
  }

  destroy() {
    this.stop();
    this.game?.destroy?.();
    this.game = null;
    this.lifecycle = null;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.inputDocument?.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("focusin", this.handleFocusIn);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
     this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
     this.canvas.removeEventListener("dblclick", this.handleDoubleClick);
     this.canvas.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerCancel);
  }
}
