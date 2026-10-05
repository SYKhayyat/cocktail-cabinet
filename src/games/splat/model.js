import { clamp } from "../../geometry.js";
import { recordDecision } from "../../decisions.js";

const COLUMN_WIDTH = 30;
const COLUMN_COUNT = 50;
const DEFAULT_COLUMN_SPACING = 130;
const GAP_HEIGHT = 112;
const HORIZONTAL_SPEED = 120;
const GRAVITY = 220;
const DRIFT_SPEED = 260;
const BOUNCE_DISTANCE = 18;
// Ball computer factors. It does not roll for a crash: it looks for the next
// gap on a reaction clock, it commits to that gap for a beat, and it accelerates
// towards it rather than snapping to it.
const COMPUTER_REACTION_MIN = 0.12;
const COMPUTER_REACTION_MAX = 0.3;
const COMPUTER_COMMIT_MIN = 0.18;
const COMPUTER_COMMIT_MAX = 0.42;
// How far ahead the ball looks for its next gap. It cannot plan a whole route.
const COMPUTER_LOOKAHEAD = 260;
// Vertical acceleration limit, px/s^2.
const COMPUTER_THRUST = 620;
const COMPUTER_MAX_FALL = 360;

export const SPLAT_MODES = [
  { value: "climber", label: "Solo — steer the ball" },
  { value: "race", label: "You vs computer — two-ball race" },
  { value: "builder", label: "Puzzle — design a route the computer can clear" }
];

export const SPLAT_SETTINGS = {
  columnSpacing: { label: "Column spacing", min: 90, max: 240, step: 10, default: DEFAULT_COLUMN_SPACING }
};

export class SplatModel {
  constructor() {
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
  setSide(side) { if (this.sides.includes(side)) this.side = side; this.tool = "column"; }
  setTool(tool) { if (tool === "column" || tool === "gap") this.tool = tool; }
  setSettings(settings = {}) {
    const validated = this.validateSettings({ ...this.pendingSettings, ...settings });
    if (!validated) return false;
    this.pendingSettings = validated;
    return true;
  }
  applyPendingSettings() { this.columnSpacing = this.pendingSettings.columnSpacing; }
  reset(keepScore = false, preserveLayout = false, { startingLives = this.engine?.maxLives ?? 3 } = {}) {
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
    this.draftGap = null;
    this.dragColumn = null;
    this.dragOffsetX = 0;
    this.decisionLog = [];
    this.lastDecision = null;
    this.aiClock = 0;
    this.won = false;
    this.gameOver = false;
    this.winner = null;
    this.lifeLost = false;
    this.eventLog = [];
    this.nextColumnId = 1;
    // Builder is a puzzle, so it reports an outcome rather than a winner. The
    // old copy called it a win for the human while the mode label said the
    // computer navigates, which left the objective ambiguous.
    this.puzzleResult = null;
    if (preservedColumns) this.columns.push(...preservedColumns);
    else {
      for (let index = 0; index < COLUMN_COUNT; index += 1) {
        const gapY = 150 + ((index * 83 + 47) % 230);
        const gapHeight = Math.max(76, GAP_HEIGHT - Math.floor(index / 10) * 5);
        this.columns.push({ id: this.nextColumnId++, x: 190 + index * this.columnSpacing, y: 0, width: COLUMN_WIDTH, height: 560, gapY, gapHeight, passed: false });
      }
    }
    if (preservedColumns) this.nextColumnId = Math.max(0, ...this.columns.map((column) => column.id || 0)) + 1;
    this.nextColumn = this.columns[0] || null;
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
    if (this.player.x >= this.columns.at(-1).x + 100) { this.won = true; this.winner = "human"; }
  }
  updateBuilder(dt, input) {
    this.updateBuilderInput(input);
    this.player.vy += GRAVITY * dt;
    this.moveComputer(this.player, dt);
    this.player.x += HORIZONTAL_SPEED * dt;
    this.player.y = clamp(this.player.y + this.player.vy * dt, 18, 542);
    this.builderCameraX = clamp(this.player.x - 110, 0, Math.max(0, this.columns.at(-1).x - 650));
    this.cameraX = this.builderCameraX;
    this.resolvePlayer(this.player);
    if (this.player.x >= this.columns.at(-1).x + 100) {
      this.won = true;
      this.winner = "human";
      this.puzzleResult = "solved";
    }
  }
  updateRace(dt, input) {
    this.player.vy += GRAVITY * dt;
    this.applyPlayerInput(input);
    this.computerPlayer.vy += GRAVITY * dt;
    this.moveComputer(this.computerPlayer, dt);
    this.player.x += HORIZONTAL_SPEED * dt;
    this.computerPlayer.x += HORIZONTAL_SPEED * dt;
    this.player.y = clamp(this.player.y + this.player.vy * dt, 18, 542);
    this.computerPlayer.y = clamp(this.computerPlayer.y + this.computerPlayer.vy * dt, 18, 542);
    this.resolvePlayer(this.player, true);
    this.resolvePlayer(this.computerPlayer);
    if (this.player.x >= this.columns.at(-1).x + 100) {
      this.won = true;
      this.winner = "human";
    } else if (this.computerPlayer.x >= this.columns.at(-1).x + 100) {
      this.won = true;
      this.winner = "computer";
    }
  }
  handleBuilderInput(input) { this.updateBuilderInput(input); }
  handlePausedInput(input) { if (this.side === "builder") this.updateBuilderInput(input); }
  updateBuilderInput(input) {
    const pointer = input.pointer;
    if (!pointer) return;
    if (this.tool === "column" && pointer.down) {
      if (!this.dragColumn) {
        const column = this.columnAt(this.builderCameraX + pointer.dragStartX, 24);
        if (column) {
          this.dragColumn = column;
          this.dragOffsetX = pointer.dragStartX - (column.x - this.builderCameraX);
        }
      }
      if (this.dragColumn) this.dragColumn.x = clamp(this.builderCameraX + pointer.x - this.dragOffsetX, this.player.x + 60, this.columns.at(-1).x + 300);
    }
    if (this.tool === "column" && pointer.released) {
      if (!this.dragColumn && pointer.dragDistance < 8) this.addColumn(this.builderCameraX + pointer.x, 280);
      this.dragColumn = null;
    }
    if (this.tool === "gap" && (pointer.down || pointer.released)) {
      const column = this.columnAt(this.builderCameraX + pointer.dragStartX, 40);
      if (column && !this.draftGap) this.draftGap = { column, startY: pointer.dragStartY, currentY: pointer.y };
      if (this.draftGap) this.draftGap.currentY = pointer.y;
    }
    if (this.tool === "gap" && pointer.released && this.draftGap) {
      const gapY = clamp(Math.min(this.draftGap.startY, this.draftGap.currentY), 60, 420);
      this.draftGap.column.gapY = gapY;
      this.draftGap.column.gapHeight = clamp(Math.abs(this.draftGap.currentY - this.draftGap.startY), 50, Math.min(240, 560 - gapY));
      this.draftGap = null;
    }
  }
  columnAt(x, maxDistance = 50) {
    const closest = this.columns.reduce((current, column) => !current || Math.abs(column.x - x) < Math.abs(current.x - x) ? column : current, null);
    return closest && Math.abs(closest.x - x) <= maxDistance ? closest : null;
  }
  addColumn(x, gapY = 280) {
    const minimumX = this.player.x + 60;
    const column = { id: this.nextColumnId++, x: clamp(x, minimumX, this.columns.at(-1).x + 300), y: 0, width: COLUMN_WIDTH, height: 560, gapY: clamp(gapY, 60, 420), gapHeight: GAP_HEIGHT, passed: false };
    this.columns.push(column);
    this.columns.sort((a, b) => a.x - b.x);
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
        player.vy *= -0.25;
        break;
      }
      if (player.x > column.x + column.width / 2) {
        if (this.side === "race") player.passedColumns.add(column);
        else column.passed = true;
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
      this.player.y = clamp(this.player.y - BOUNCE_DISTANCE, 18, 542);
      this.player.vy = 0;
      this.driftActive = 0;
    }
    if (input.bounce > 0) {
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
      const engaged = player.x > column.x - COMPUTER_LOOKAHEAD;
      if (engaged && player.aiCommit <= 0 && (player.aiTargetY === null || Math.abs(targetY - player.aiTargetY) > 24)) {
        player.aiTargetY = targetY;
        player.aiReaction = COMPUTER_REACTION_MIN + Math.random() * (COMPUTER_REACTION_MAX - COMPUTER_REACTION_MIN);
        player.aiCommit = COMPUTER_COMMIT_MIN + Math.random() * (COMPUTER_COMMIT_MAX - COMPUTER_COMMIT_MIN);
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
    const desiredVelocity = clamp(difference * 4, -COMPUTER_MAX_FALL, COMPUTER_MAX_FALL);
    const change = clamp(desiredVelocity - player.vy, -COMPUTER_THRUST * dt, COMPUTER_THRUST * dt);
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
      this.lifeLost = false;
      return;
    }
    this.score = this.player.columnsPassed;
    this.lifeLost = false;
  }
  publicState() {
    const status = this.side === "race" ? "Race the computer; the first ball to finish wins." : this.side === "builder" ? "Design a route the computer can clear: every column needs a gap it can reach." : "Clear the gaps to score; reach the far right to win.";
    return { title: this.title, description: this.description, side: this.sideLabel(), status };
  }
}
