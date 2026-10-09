import { clamp } from "../../geometry.js";
import { recordDecision } from "../../decisions.js";
import { installEvents } from "../../events.js";
const COLUMN_WIDTH = 30;
const COLUMN_COUNT = 50;
// Supported editor workload: finite routes, with no unbounded pointer/key growth.
export const SPLAT_MAX_COLUMNS = 256;
const DEFAULT_COLUMN_SPACING = 130;
const GAP_HEIGHT = 112;
const HORIZONTAL_SPEED = 120;
const GRAVITY = 220;
const DRIFT_SPEED = 260;
const BOUNCE_DISTANCE = 18;
// Ball computer factors. It does not roll for a crash: it looks for the next
// gap on a reaction clock, it commits to that gap for a beat, and it accelerates
// towards it rather than snapping to it.
// Lookahead engages one gap, not a plan for the whole route.
// Seconds, pixels, px/s and px/s²; velocityGain converts position error to
// desired velocity. Overrides only affect the computer. See tests/ai/TUNING.md.
export const SPLAT_AI_DEFAULTS = Object.freeze({
  reactionMin: 0.12, reactionMax: 0.3, commitMin: 0.18, commitMax: 0.42,
  lookahead: 260, thrust: 620, maxFall: 360, velocityGain: 4,
  targetTolerance: 24, horizontalSpeed: HORIZONTAL_SPEED
});

export const SPLAT_MODES = [
  { value: "climber", label: "Solo — steer the ball" },
  { value: "race", label: "You vs computer — two-ball race" },
  { value: "builder", label: "Puzzle — design a route the computer can clear" }
];

export const SPLAT_SETTINGS = {
  columnSpacing: { label: "Column spacing", min: 90, max: 240, step: 10, default: DEFAULT_COLUMN_SPACING }
};

export class SplatModel {
  constructor({ aiTuning = {} } = {}) {
    installEvents(this);
    this.aiTuning = { ...SPLAT_AI_DEFAULTS, ...aiTuning };
    this.id = "splat";
    this.title = "Splat";
    this.description = "Hold Up/Down to drift and tap/click the upper or lower half to bounce through the gaps.";
    this.side = "climber";
    this.score = 0;
    this.columnSpacing = DEFAULT_COLUMN_SPACING;
    this.pendingSettings = { columnSpacing: DEFAULT_COLUMN_SPACING };
    this.furthestColumns = 0;
    this.driftActive = 0;
    this.tool = "column";
    // The engine treats lifeLost and gameOver as edge triggers, so they must
    // start and end a round as definite booleans rather than depending on the
    // caller to clear them.
    this.lifeLost = false;
    this.gameOver = false;
    this.eventLog = [];
    this.nextColumnId = 1;
    this.layoutAuthored = false;
    this.routeLimitReached = false;
  }
  get modes() { return SPLAT_MODES; }
  get sides() { return SPLAT_MODES.map((mode) => mode.value); }
  get settings() { return SPLAT_SETTINGS; }
  validateSettings(values) {
    const descriptor = SPLAT_SETTINGS.columnSpacing;
    const columnSpacing = Number(values.columnSpacing);
    if (!Number.isInteger(columnSpacing) || columnSpacing < descriptor.min || columnSpacing > descriptor.max) return null;
    if ((columnSpacing - descriptor.min) % (descriptor.step || 1) !== 0) return null;
    return { columnSpacing };
  }
  sideLabel() { return this.modes.find((mode) => mode.value === this.side)?.label || SPLAT_MODES[0].label; }
  setSide(side) {
    if (!this.sides.includes(side)) return;
    if (side !== this.side) {
      // A temporary play-mode switch is not a destructive editor command.
      if (this.side === "builder" && this.layoutAuthored && this.columns) this.authoredRoute = this.columns.map((column) => ({ ...column }));
      this.side = side;
      this.layoutAuthored = false;
      if (side === "builder" && this.authoredRoute) {
        this.columns = this.authoredRoute.map((column) => ({ ...column }));
        this.layoutAuthored = true;
      }
    }
    this.tool = "column";
  }
  setTool(tool) {
    if (tool === "column" || tool === "gap") {
      this.tool = tool;
      this.clearBuilderGesture();
    }
  }
  setSettings(settings = {}) {
    const validated = this.validateSettings({ ...this.pendingSettings, ...settings });
    if (!validated) return false;
    this.pendingSettings = validated;
    return true;
  }
  applyPendingSettings() { this.columnSpacing = this.pendingSettings.columnSpacing; }
  reset(keepScore = false, preserveLayout = this.side === "builder" && this.layoutAuthored, { startingLives = 3 } = {}) {
    this.clearEvents();
    const preservedColumns = preserveLayout && this.columns ? this.columns.map((column) => ({ ...column, passed: false })) : null;
    if (!keepScore) {
      this.score = 0;
      this.furthestColumns = 0;
    }
    this.driftActive = 0;
    this.player = this.newPlayer();
    this.computerPlayer = this.side === "race" ? this.newPlayer() : null;
    // Builder owns its life budget too, so the puzzle can report its own outcome
    // instead of falling through to the engine's generic out-of-lives text.
    this.raceLives = this.side === "race" || this.side === "builder" ? { human: startingLives, computer: startingLives } : null;
    this.lostPlayers = [];
    this.lifeLossHandled = false;
    this.columns = [];
    this.cameraX = 0;
    this.builderCameraX = 0;
    this.builderManualCamera = false;
    this.builderGesture = null;
    this.draftGap = null;
    this.dragColumn = null;
    this.dragOffsetX = 0;
    this.decisionLog = [];
    this.lastDecision = null;
    this.aiClock = 0;
    this.won = false;
    this.gameOver = false;
    this.winner = null;
    this.versusTie = false;
    this.lifeLost = false;
    this.eventLog = [];
    this.nextColumnId = 1;
    this.routeLimitReached = false;
    // Builder is a puzzle, so it reports an outcome rather than a winner. The
    // old copy called it a win for the human while the mode label said the
    // computer navigates, which left the objective ambiguous.
    this.puzzleResult = null;
    if (preservedColumns) this.columns.push(...preservedColumns);
    else {
      this.layoutAuthored = false;
      for (let index = 0; index < COLUMN_COUNT; index += 1) {
        const gapY = 150 + ((index * 83 + 47) % 230);
        const gapHeight = Math.max(76, GAP_HEIGHT - Math.floor(index / 10) * 5);
        this.columns.push({ id: this.nextColumnId++, x: 190 + index * this.columnSpacing, y: 0, width: COLUMN_WIDTH, height: 560, gapY, gapHeight, passed: false });
      }
    }
    if (preservedColumns) this.nextColumnId = Math.max(0, ...this.columns.map((column) => column.id || 0)) + 1;
    this.nextColumn = this.columns[0] || null;
    this.selectedColumnId = this.columns[0]?.id ?? null;
  }
  recordEvent(type, details = {}) {
    this.eventLog.push({ type, ...details });
    if (this.eventLog.length > 4096) this.eventLog.splice(0, 1024);
  }
  newPlayer() { return { x: 70, y: 280, radius: 12, vy: 0, columnsPassed: 0, passedColumns: new Set(), attempt: 1, aiTargetY: null, aiReaction: 0, aiCommit: 0 }; }
  update(dt, input) {
    if (this.side === "race") this.updateRace(dt, input);
    else if (this.side === "builder") this.updateBuilder(dt, input);
    else this.updateClimber(dt, input);
  }
  updateClimber(dt, input) {
    this.player.vy += GRAVITY * dt;
    this.applyPlayerInput(input);
    this.player.x += HORIZONTAL_SPEED * dt;
    this.player.y = clamp(this.player.y + this.player.vy * dt, 18, 542);
    this.cameraX = clamp(this.player.x - 110, 0, this.columns.at(-1).x - 650);
    this.resolvePlayer(this.player);
    if (this.player.x >= this.columns.at(-1).x + 100) { this.won = true; this.winner = "human"; this.emit("win"); }
  }
  updateBuilder(dt, input) {
    this.updateBuilderInput(input);
    this.player.vy += GRAVITY * dt;
    this.moveComputer(this.player, dt);
    this.player.x += this.aiTuning.horizontalSpeed * dt;
    this.player.y = clamp(this.player.y + this.player.vy * dt, 18, 542);
    if (!this.builderManualCamera) this.builderCameraX = clamp(this.player.x - 110, 0, this.builderCameraLimit());
    this.cameraX = this.builderCameraX;
    this.resolvePlayer(this.player);
    if (this.player.x >= this.columns.at(-1).x + 100) {
      this.won = true;
      this.winner = "human";
      this.puzzleResult = "solved";
      this.emit("win");
    }
  }
  updateRace(dt, input) {
    if (this.won || this.gameOver) return;
    const previousHumanX = this.player.x;
    const previousComputerX = this.computerPlayer.x;
    this.player.vy += GRAVITY * dt;
    this.applyPlayerInput(input);
    this.computerPlayer.vy += GRAVITY * dt;
    this.moveComputer(this.computerPlayer, dt);
    this.player.x += HORIZONTAL_SPEED * dt;
    this.computerPlayer.x += this.aiTuning.horizontalSpeed * dt;
    this.player.y = clamp(this.player.y + this.player.vy * dt, 18, 542);
    this.computerPlayer.y = clamp(this.computerPlayer.y + this.computerPlayer.vy * dt, 18, 542);
    this.resolvePlayer(this.player, true);
    this.resolvePlayer(this.computerPlayer);
    const finishX = this.columns.at(-1).x + 100;
    const crossingTime = (player, previousX, speed) => player.x >= finishX && !this.lostPlayers.includes(player)
      ? Math.max(0, (finishX - previousX) / speed) : Infinity;
    const humanTime = crossingTime(this.player, previousHumanX, HORIZONTAL_SPEED);
    const computerTime = crossingTime(this.computerPlayer, previousComputerX, this.aiTuning.horizontalSpeed);
    if (Number.isFinite(humanTime) || Number.isFinite(computerTime)) {
      this.won = true;
      this.emit("win");
      this.versusTie = Number.isFinite(humanTime) && Number.isFinite(computerTime) && Math.abs(humanTime - computerTime) < 1e-9;
      this.winner = this.versusTie ? null : humanTime < computerTime ? "human" : "computer";
    }
  }
  handleBuilderInput(input) { this.updateBuilderInput(input); }
  handlePausedInput(input) { if (this.side === "builder") this.updateBuilderInput(input); }
  get selectedColumn() { return this.columns.find((column) => column.id === this.selectedColumnId) || this.columns[0]; }
  revealColumn(column) {
    if (!column) return;
    if (column.x < this.builderCameraX + 60) this.panBuilder(column.x - 60);
    else if (column.x + column.width > this.builderCameraX + 740) this.panBuilder(column.x + column.width - 740);
  }
  updateBuilderKeyboard(actions) {
    if (!actions || !Object.values(actions).some(Boolean)) return;
    if (actions.tool) this.setTool(actions.tool);
    if (actions.pan) this.panBuilder(this.builderCameraX + actions.pan);
    let column = this.selectedColumn;
    if (!column) return;
    if (actions.first || actions.last || actions.select) {
      const index = this.columns.indexOf(column);
      column = this.columns[actions.first ? 0 : actions.last ? this.columns.length - 1 : clamp(index + actions.select, 0, this.columns.length - 1)];
      this.selectedColumnId = column.id;
      this.revealColumn(column);
    }
    if (actions.add) {
      column = this.addColumn(column.x + this.columnSpacing, column.gapY);
      if (column) {
        this.selectedColumnId = column.id;
        this.revealColumn(column);
      }
    }
    if (!column) return;
    if (actions.remove && this.columns.length > 1) {
      const index = this.columns.indexOf(column);
      this.columns.splice(index, 1);
      this.routeLimitReached = false;
      this.selectedColumnId = this.columns[Math.min(index, this.columns.length - 1)].id;
      this.layoutAuthored = true;
      this.nextColumn = this.columns.find((candidate) => !candidate.passed) || null;
      this.panBuilder(this.builderCameraX);
      return;
    }
    if (actions.move) {
      column.x = clamp(column.x + actions.move, this.player.x + 60, this.columns.at(-1).x + 300);
      this.reorderColumn(column);
      this.layoutAuthored = true;
      this.revealColumn(column);
    }
    if (actions.gapMove || actions.gapResize) {
      column.gapY = clamp(column.gapY + (actions.gapMove || 0), 60, Math.min(420, 560 - column.gapHeight));
      column.gapHeight = clamp(column.gapHeight + (actions.gapResize || 0), 50, Math.min(240, 560 - column.gapY));
      this.layoutAuthored = true;
    }
  }
  builderCameraLimit() { return Math.max(0, (this.columns.at(-1)?.x || 0) - 650); }
  panBuilder(cameraX) {
    this.builderManualCamera = true;
    this.builderCameraX = clamp(cameraX, 0, this.builderCameraLimit());
    this.cameraX = this.builderCameraX;
  }
  clearBuilderGesture() {
    this.builderGesture = null;
    this.dragColumn = null;
    this.draftGap = null;
  }
  updateBuilderInput(input) {
    this.updateBuilderKeyboard(input.builderActions);
    // "Wheel to pan" is advertised in the control hint and the README, so the
    // accumulated wheel delta has to reach the camera. It is a camera-only
    // gesture: it never selects, moves, resizes or adds a column.
    if (input.scrollDeltaX) this.panBuilder(this.builderCameraX + input.scrollDeltaX);
    const pointer = input.pointer;
    if (!pointer) return;
    if (!pointer.down && !pointer.released) {
      // A cancelled pointer has no release edge. Discard its edit/pan baseline.
      this.clearBuilderGesture();
      return;
    }
    if (!this.builderGesture) {
      const startX = pointer.dragStartX ?? pointer.x;
      const startY = pointer.dragStartY ?? pointer.y;
      const column = this.columnAt(this.builderCameraX + startX, this.tool === "gap" ? 40 : 24);
      this.builderGesture = { kind: column ? this.tool : "empty", startX, startY, cameraX: this.builderCameraX, column };
      if (column) this.selectedColumnId = column.id;
      if (column && this.tool === "column") {
        this.dragColumn = column;
        this.dragOffsetX = startX - (column.x - this.builderCameraX);
      }
      if (column && this.tool === "gap") this.draftGap = { column, startY, currentY: pointer.y };
    }
    const gesture = this.builderGesture;
    const distance = Math.max(pointer.dragDistance || 0, Math.hypot(pointer.x - gesture.startX, pointer.y - gesture.startY));
    if (gesture.kind === "empty" && distance >= 8) {
      // Lock the gesture at its starting point: crossing a column while panning
      // never turns an empty-canvas drag into an edit.
      this.panBuilder(gesture.cameraX + gesture.startX - pointer.x);
    } else if (gesture.kind === "column") {
      const x = clamp(this.builderCameraX + pointer.x - this.dragOffsetX, this.player.x + 60, this.columns.at(-1).x + 300);
      if (x !== gesture.column.x) {
        gesture.column.x = x;
        this.reorderColumn(gesture.column);
        this.layoutAuthored = true;
      }
    } else if (gesture.kind === "gap") this.draftGap.currentY = pointer.y;
    if (pointer.released && gesture.kind === "gap") {
      const gapY = clamp(Math.min(this.draftGap.startY, this.draftGap.currentY), 60, 420);
      this.draftGap.column.gapY = gapY;
      this.draftGap.column.gapHeight = clamp(Math.abs(this.draftGap.currentY - this.draftGap.startY), 50, Math.min(240, 560 - gapY));
      this.layoutAuthored = true;
    }
    if (pointer.released && gesture.kind === "empty" && distance < 8 && this.tool === "column") this.addColumn(this.builderCameraX + pointer.x, 280);
    if (pointer.released) this.clearBuilderGesture();
  }
  columnAt(x, maxDistance = 50) {
    const index = this.columnInsertionIndex(x);
    const left = this.columns[index - 1];
    const right = this.columns[index];
    const closest = !left ? right : !right || Math.abs(left.x - x) <= Math.abs(right.x - x) ? left : right;
    return closest && Math.abs(closest.x - x) <= maxDistance ? closest : null;
  }
  columnInsertionIndex(x) {
    let low = 0;
    let high = this.columns.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.columns[middle].x < x) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  reorderColumn(column) {
    this.columns.splice(this.columns.indexOf(column), 1);
    this.columns.splice(this.columnInsertionIndex(column.x), 0, column);
    this.nextColumn = this.columns.find((candidate) => !candidate.passed) || null;
  }
  addColumn(x, gapY = 280) {
    if (this.columns.length >= SPLAT_MAX_COLUMNS) {
      this.routeLimitReached = true;
      return null;
    }
    const minimumX = this.player.x + 60;
    const column = { id: this.nextColumnId++, x: clamp(x, minimumX, this.columns.at(-1).x + 300), y: 0, width: COLUMN_WIDTH, height: 560, gapY: clamp(gapY, 60, 420), gapHeight: GAP_HEIGHT, passed: false };
    this.columns.splice(this.columnInsertionIndex(column.x), 0, column);
    this.layoutAuthored = true;
    this.selectedColumnId = column.id;
    if (!this.nextColumn) this.nextColumn = column;
    return column;
  }
  horizontalCollision(player, column) { return player.x + player.radius > column.x && player.x - player.radius < column.x + column.width; }
  resolvePlayer(player, human = false) {
    for (const column of this.columns) {
      const passed = this.side === "race" ? player.passedColumns.has(column) : column.passed;
      if (passed || !this.horizontalCollision(player, column)) continue;
      const insideGap = player.y + player.radius > column.gapY && player.y - player.radius < column.gapY + column.gapHeight;
      if (!insideGap) {
        if (!this.lostPlayers.includes(player)) {
          this.lostPlayers.push(player);
          this.recordEvent("column-collision", { columnId: column.id ?? null, attempt: player.attempt, owner: player === this.player ? "human" : "computer" });
          this.recordEvent("life-loss", { owner: player === this.player ? "human" : "computer", attempt: player.attempt, cause: "column" });
        }
        this.lifeLost = true;
        this.emit("life");
        player.vy *= -0.25;
        break;
      }
      if (player.x > column.x + column.width / 2) {
        if (this.side === "race") player.passedColumns.add(column);
        else { column.passed = true; this.emit("column"); }
        player.columnsPassed += 1;
        this.recordEvent("column-cleared", { columnId: column.id ?? null, attempt: player.attempt, owner: player === this.player ? "human" : "computer" });
        if (human) {
          this.score = player.columnsPassed;
          this.furthestColumns = Math.max(this.furthestColumns, this.score);
        } else if (this.side !== "race") {
          this.score = player.columnsPassed;
          this.furthestColumns = Math.max(this.furthestColumns, this.score);
        }
        this.nextColumn = this.columns.find((candidate) => this.side === "race" ? !player.passedColumns.has(candidate) : !candidate.passed) || null;
        this.aiClock = 0;
      }
    }
  }
  applyPlayerInput(input) {
    const drift = input.drift || 0;
    if (drift < 0) {
      this.driftActive = -1;
      this.player.vy = Math.min(this.player.vy, -DRIFT_SPEED);
    }
    if (drift > 0) {
      this.driftActive = 1;
      this.player.vy = Math.max(this.player.vy, DRIFT_SPEED);
    }
    if (!drift && this.driftActive) this.player.vy = 0;
    if (!drift) this.driftActive = 0;
    if (input.bounce < 0) {
      this.emit("bounce");
      this.player.y = clamp(this.player.y - BOUNCE_DISTANCE, 18, 542);
      this.player.vy = 0;
      this.driftActive = 0;
    }
    if (input.bounce > 0) {
      this.emit("bounce");
      this.player.y = clamp(this.player.y + BOUNCE_DISTANCE, 18, 542);
      this.player.vy = 0;
      this.driftActive = 0;
    }
  }
  moveComputer(player, dt) {
    const column = this.columns.find((candidate) => {
      const passed = this.side === "race" ? player.passedColumns.has(candidate) : candidate.passed;
      return !passed && candidate.x > player.x;
    });
    if (!column) return;
    const targetY = column.gapY + column.gapHeight / 2;
    const computerSide = this.side === "race" || this.side === "builder";
    let desiredY = targetY;
    if (computerSide) {
      player.aiReaction = Math.max(0, player.aiReaction - dt);
      player.aiCommit = Math.max(0, player.aiCommit - dt);
      // It only starts lining up for a gap once that gap is close enough to be
      // worth the reaction, and once it has committed it holds that gap rather
      // than re-aiming every frame at whichever column happens to be nearest.
      const engaged = player.x > column.x - this.aiTuning.lookahead;
      if (engaged && player.aiCommit <= 0 && (player.aiTargetY === null || Math.abs(targetY - player.aiTargetY) > this.aiTuning.targetTolerance)) {
        player.aiTargetY = targetY;
        player.aiReaction = this.aiTuning.reactionMin + Math.random() * (this.aiTuning.reactionMax - this.aiTuning.reactionMin);
        player.aiCommit = this.aiTuning.commitMin + Math.random() * (this.aiTuning.commitMax - this.aiTuning.commitMin);
        recordDecision(this, { side: this.side, targetY: Math.round(targetY), engaged, columnX: Math.round(column.x), playerX: Math.round(player.x) });
      }
      // While reacting or committed it is still steering for the gap it last
      // chose, not the one it is looking at now. The commitment is meaningful
      // only if it controls the actual steering target as well as replanning.
      desiredY = (player.aiReaction > 0 || player.aiCommit > 0) && player.aiTargetY !== null ? player.aiTargetY : targetY;
    }
    const difference = desiredY - player.y;
    // Acceleration rather than a velocity that snaps to the answer, so a late or
    // committed decision costs the ball time it does not have.
    const desiredVelocity = clamp(difference * this.aiTuning.velocityGain, -this.aiTuning.maxFall, this.aiTuning.maxFall);
    const change = clamp(desiredVelocity - player.vy, -this.aiTuning.thrust * dt, this.aiTuning.thrust * dt);
    player.vy += change;
    this.aiClock += dt;
  }
  handleLifeLoss() {
    const lostPlayers = [...this.lostPlayers];
    if (!lostPlayers.length || this.lifeLossHandled) return null;
    this.lifeLossHandled = true;
    this.lifeLost = false;
    if (this.side !== "race") {
      if (this.side === "builder") {
        const remaining = Math.max(0, this.raceLives.human - 1);
        this.raceLives.human = remaining;
        this.raceLives.computer = remaining;
        // Running the computer out of lives means the route is not solvable as
        // drawn. That is a failed puzzle, not a defeat, and the copy says so.
        if (remaining === 0) {
          this.puzzleResult = "unsolved";
          this.gameOver = true;
          return { gameOver: true, message: "Unsolved — the computer ran out of lives. Widen the gaps and try again." };
        }
      }
      return { gameOver: false, message: "One life lost — starting again in 3…" };
    }
    const owners = lostPlayers.map((player) => player === this.player ? "human" : "computer");
    for (const owner of owners) this.raceLives[owner] = Math.max(0, this.raceLives[owner] - 1);
    const eliminated = owners.find((owner) => this.raceLives[owner] === 0);
    if (eliminated) {
      this.gameOver = true;
      if (this.raceLives.human === 0 && this.raceLives.computer === 0) {
        this.versusTie = true;
        this.winner = null;
        return { gameOver: true, message: "Race tie — both balls lost their final life." };
      }
      this.winner = eliminated === "human" ? "computer" : "human";
      return { gameOver: true, message: `${eliminated === "human" ? "You" : "Computer"} lost all lives.` };
    }
    return { gameOver: false, message: `${owners.map((owner) => owner === "human" ? "You" : "Computer").join(" and ")} lost a ball.` };
  }
  resetAfterLife() {
    this.lifeLossHandled = false;
    for (const player of this.lostPlayers.splice(0)) {
      player.x = 70;
      player.y = 280;
      player.vy = 0;
      player.columnsPassed = 0;
      player.attempt += 1;
      player.passedColumns.clear();
      player.aiTargetY = null;
      player.aiReaction = 0;
      player.aiCommit = 0;
    }
    if (this.side !== "race") {
      this.columns.forEach((column) => { column.passed = false; });
      this.nextColumn = this.columns[0] || null;
      this.score = 0;
      this.cameraX = 0;
      this.builderCameraX = 0;
      this.builderManualCamera = false;
      this.clearBuilderGesture();
      this.lifeLost = false;
      return;
    }
    this.score = this.player.columnsPassed;
    this.lifeLost = false;
  }
  publicState() {
    const status = this.side === "race" ? "Race the computer; the first ball to finish wins." : this.side === "builder" ? `Design a route the computer can clear: every column needs a reachable gap. Route: ${this.columns?.length || 0}/${SPLAT_MAX_COLUMNS} columns.${this.routeLimitReached ? " Route limit reached — remove a column before adding another." : ""}` : "Clear the gaps to score; reach the far right to win.";
    const raceStatus = this.versusTie ? "Race tie — both balls finished together or lost their final life together." : this.winner ? `${this.winner === "human" ? "You win" : "Computer wins"} the race.` : "Race the computer; the first ball to finish wins. Simultaneous finishers tie.";
    return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "race" ? raceStatus : status };
  }
}
