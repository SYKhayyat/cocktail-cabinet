export class GameEngine {
  constructor(canvas, { onState, onScore, onMessage, onLives } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onState = onState;
    this.onScore = onScore;
    this.onMessage = onMessage;
    this.onLives = onLives;
    this.game = null;
    this.running = false;
    this.stopped = false;
    this.paused = false;
    this.ready = false;
    this.countdown = 0;
    this.lives = 3;
    this.maxLives = 3;
    this.lastTime = 0;
    this.animationFrame = 0;
    this.input = {
      keys: new Set(),
      pressed: new Set(),
      pointer: { x: 0, y: 0, down: false, clicked: false, moved: false, released: false, dragStartX: 0, dragStartY: 0, lastX: 0, lastY: 0, dragDeltaX: 0, dragDeltaY: 0, dragDistance: 0 },
      mode: "keyboard",
      scrollDeltaX: 0
    };
    this.activePointerId = null;

    this.handleKeyDown = (event) => {
      const tagName = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName) || event.target?.isContentEditable) return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      this.input.mode = "keyboard";
      if (!this.input.keys.has(event.key)) this.input.pressed.add(event.key);
      this.input.keys.add(event.key);
    };
    this.handleKeyUp = (event) => this.input.keys.delete(event.key);
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
    this.handlePointerCancel = () => {
      this.input.pointer.down = false;
      this.input.pointer.released = false;
      this.activePointerId = null;
    };
    this.handleWheel = (event) => {
      this.input.scrollDeltaX += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    };

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("wheel", this.handleWheel, { passive: true });
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerCancel);
  }

  load(game) {
    this.stop();
    this.game = game;
    game.engine = this;
    game.gameOver = false;
    game.lifeLost = false;
    this.stopped = true;
    this.paused = false;
    this.ready = true;
    this.countdown = 0;
    this.lives = this.maxLives;
    game.applyPendingSettings?.();
    game.reset();
    this.onState?.(game.publicState());
    this.running = true;
    this.lastTime = performance.now();
    this.animationFrame = requestAnimationFrame((time) => this.frame(time));
  }

  stop() {
    this.running = false;
    this.stopped = true;
    cancelAnimationFrame(this.animationFrame);
  }

  pauseGame() {
    if (!this.running || this.ready || this.game?.gameOver) return;
    this.stopped = true;
    this.paused = true;
    this.onMessage?.("Paused — press Continue when you are ready.");
  }

  continueGame() {
    if (!this.running || this.ready || this.game?.gameOver || this.countdown > 0) return;
    this.stopped = false;
    this.paused = false;
    this.countdown = 3;
    this.lastTime = performance.now();
    this.onMessage?.("Continuing in 3…");
  }

  stopGame() {
    this.pauseGame();
  }

  setLives(value) {
    this.maxLives = Math.max(1, Math.min(9, Number(value) || 3));
    if (!this.game) this.lives = this.maxLives;
    this.onLives?.(this.lives, this.maxLives);
  }

  addLife() {
    this.maxLives = Math.min(9, this.maxLives + 1);
    this.lives = Math.min(this.maxLives, this.lives + 1);
    this.onLives?.(this.lives, this.maxLives);
  }

  frame(time) {
    if (!this.running) return;
    const delta = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;
    if (this.countdown > 0) {
      this.countdown -= delta;
      if (this.countdown <= 0) this.onMessage?.("Go!");
    } else if (!this.ready && !this.stopped) {
      this.game.update(delta, this.input);
      if (this.game.won) {
        this.stopped = true;
        this.onMessage?.(this.game.winMessage?.() || "You cleared every brick — you win!");
      } else if (this.game.lifeLost || this.game.gameOver) {
        this.game.lifeLost = false;
        const customLifeLoss = this.game.handleLifeLoss?.();
        if (customLifeLoss) {
          this.onLives?.(this.game.playerLives?.human ?? this.lives, this.maxLives);
          if (customLifeLoss.gameOver) {
            this.stopped = true;
            this.onMessage?.(customLifeLoss.message);
          } else {
            this.game.resetAfterLife?.();
            this.countdown = 3;
            this.onMessage?.(customLifeLoss.message);
          }
        } else {
          const lossReason = this.game.lossReason || "collision";
          this.lives -= 1;
          this.onLives?.(this.lives, this.maxLives);
          if (this.lives > 0) {
            if (this.game.resetAfterLife) this.game.resetAfterLife();
            else this.game.reset(true, this.game.snake?.length);
            this.countdown = 3;
            this.onMessage?.(lossReason === "wall" ? "Wall hit — one life lost. Starting again in 3…" : "One life lost — starting again in 3…");
          } else {
            this.game.gameOver = true;
            this.stopped = true;
            this.onMessage?.("Out of lives — press New game to try again.");
          }
        }
      }
    }
    if (this.ready) this.game.handleReadyInput?.(this.input);
    else if (this.paused) this.game.handlePausedInput?.(this.input);
    this.game.draw(this.context);
    if (this.ready || this.countdown > 0 || this.stopped) {
      this.context.fillStyle = "#111827ee";
      this.context.fillRect(250, 238, 300, 120);
      this.context.strokeStyle = "#fbbf24";
      this.context.lineWidth = 2;
      this.context.strokeRect(250, 238, 300, 120);
      this.context.lineWidth = 1;
      const winner = this.game.winner;
      const tied = this.game.versusTie;
      const heading = this.ready ? "READY" : this.countdown > 0 ? "GET READY" : this.game.won ? winner === "computer" ? "COMPUTER WINS" : "YOU WIN" : this.game.gameOver && tied ? "TIE" : this.game.gameOver && winner ? winner === "human" ? "YOU WIN" : "COMPUTER WINS" : this.game.gameOver ? "OUT OF LIVES" : "PAUSED";
      const instruction = this.ready ? "Press New game to start" : this.countdown > 0 ? `Starting in ${Math.ceil(this.countdown)}…` : this.game.won || this.game.gameOver && (winner || tied) ? "Press New game to play again" : this.game.gameOver ? "Press New game to try again" : "Press Continue to resume";
      const lifeText = this.game.playerLives ? `You: ${this.game.playerLives.human}    Computer: ${this.game.playerLives.computer}` : `Lives: ${this.lives}/${this.maxLives}`;
      drawText(this.context, heading, 400, 275, 24, "#fbbf24", "center");
      drawText(this.context, `Score: ${this.game.score}    ${lifeText}`, 400, 310, 16, "#f8fafc", "center");
      drawText(this.context, instruction, 400, 340, 14, "#cbd5e1", "center");
    }
    this.input.pressed.clear();
    this.input.pointer.clicked = false;
    this.input.pointer.released = false;
    this.input.pointer.dragDeltaX = 0;
    this.input.pointer.dragDeltaY = 0;
    this.input.pointer.dragDistance = 0;
    this.input.scrollDeltaX = 0;
    this.input.pointer.moved = false;
    this.onState?.(this.game.publicState());
    this.onScore?.(this.game.score);
    this.animationFrame = requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  restart() {
    if (!this.game) return;
    this.stopped = false;
    this.paused = false;
    this.ready = false;
    this.countdown = 3;
    this.lives = this.maxLives;
    this.game.applyPendingSettings?.();
    this.game.gameOver = false;
    this.game.lifeLost = false;
    this.game.reset();
    this.onLives?.(this.lives, this.maxLives);
    this.onMessage?.("New game — starting in 3…");
  }

  setSide(side) {
    if (!this.game) return;
    this.game.setSide(side);
    this.game.applyPendingSettings?.();
    this.stopped = true;
    this.paused = false;
    this.ready = true;
    this.countdown = 0;
    this.lives = this.maxLives;
    this.game.gameOver = false;
    this.game.lifeLost = false;
    this.game?.reset();
    this.onLives?.(this.lives, this.maxLives);
    this.onMessage?.(`${this.game.title}: ${this.game.sideLabel()}`);
  }

  destroy() {
    this.stop();
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerCancel);
  }
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function circleHitsCircle(ax, ay, ar, bx, by, br) {
  return distance(ax, ay, bx, by) < ar + br;
}

export function circleHitsRect(circle, rectangle) {
  const closestX = clamp(circle.x, rectangle.x, rectangle.x + rectangle.width);
  const closestY = clamp(circle.y, rectangle.y, rectangle.y + rectangle.height);
  return distance(circle.x, circle.y, closestX, closestY) < circle.radius;
}

export function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function drawText(context, text, x, y, size = 16, color = "#f8fafc", align = "left") {
  context.fillStyle = color;
  context.font = `700 ${size}px system-ui, sans-serif`;
  context.textAlign = align;
  context.fillText(text, x, y);
}

export function drawPanel(context, x, y, width, height, color = "#111827") {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}
