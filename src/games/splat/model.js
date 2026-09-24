import { clamp } from "../../engine.js";

const COLUMN_WIDTH = 30;
const COLUMN_COUNT = 50;
const DEFAULT_COLUMN_SPACING = 130;
const MIN_COLUMN_SPACING = 90;
const MAX_COLUMN_SPACING = 240;
const GAP_HEIGHT = 112;
const HORIZONTAL_SPEED = 120;
const GRAVITY = 220;
const DRIFT_SPEED = 260;
const BOUNCE_DISTANCE = 18;
const COMPUTER_MISTAKE_CHANCE = 0.002;

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
  }
  sideLabel() {
    if (this.side === "builder") return "You place columns while the computer navigates";
    if (this.side === "race") return "You and the computer race two balls";
    if (this.side === "layout") return "Computer navigates while you place columns";
    return "You steer the falling object";
  }
  setSide(side) { this.side = side; this.tool = "column"; }
  setTool(tool) { if (tool === "column" || tool === "gap") this.tool = tool; }
  setSettings(settings = {}) {
    if (Number.isInteger(settings.columnSpacing)) this.pendingSettings.columnSpacing = clamp(settings.columnSpacing, MIN_COLUMN_SPACING, MAX_COLUMN_SPACING);
  }
  applyPendingSettings() { this.columnSpacing = this.pendingSettings.columnSpacing; }
  reset(keepScore = false) {
    if (!keepScore) {
      this.score = 0;
      this.furthestColumns = 0;
    }
    this.driftActive = 0;
    this.player = this.newPlayer();
    this.computerPlayer = this.side === "race" ? this.newPlayer() : null;
    this.columns = [];
    this.cameraX = 0;
    this.builderCameraX = 0;
    this.draftGap = null;
    this.dragColumn = null;
    this.dragOffsetX = 0;
    this.aiClock = 0;
    this.computerMistake = false;
    this.won = false;
    this.gameOver = false;
    this.winner = null;
    for (let index = 0; index < COLUMN_COUNT; index += 1) {
      const gapY = 150 + ((index * 83 + 47) % 230);
      this.columns.push({ x: 190 + index * this.columnSpacing, y: 0, width: COLUMN_WIDTH, height: 560, gapY, gapHeight: GAP_HEIGHT, passed: false });
    }
    this.nextColumn = this.columns[0];
  }
  newPlayer() { return { x: 70, y: 280, radius: 12, vy: 0, columnsPassed: 0, passedColumns: new Set() }; }
  update(dt, input) {
    if (this.side === "race") this.updateRace(dt, input);
    else if (this.side === "builder" || this.side === "layout") this.updateBuilder(dt, input);
    else this.updateClimber(dt, input);
  }
  updateClimber(dt, input) {
    this.player.vy += GRAVITY * dt;
    this.applyPlayerInput(input);
    this.player.x += HORIZONTAL_SPEED * dt;
    this.player.y = clamp(this.player.y + this.player.vy * dt, 18, 542);
    this.cameraX = clamp(this.player.x - 110, 0, this.columns.at(-1).x - 650);
    this.resolvePlayer(this.player);
    if (this.player.x >= this.columns.at(-1).x + 100) this.won = true;
  }
  updateBuilder(dt, input) {
    this.updateBuilderInput(input);
    this.player.vy += GRAVITY * dt;
    this.moveComputer(this.player, dt);
    this.player.x += HORIZONTAL_SPEED * dt;
    this.player.y = clamp(this.player.y + this.player.vy * dt, 18, 542);
    this.cameraX = this.builderCameraX;
    this.resolvePlayer(this.player);
    if (this.player.x >= this.columns.at(-1).x + 100) this.won = true;
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
  updateBuilderInput(input) {
    const pointer = input.pointer;
    if (input.scrollDeltaX) this.builderCameraX = clamp(this.builderCameraX + input.scrollDeltaX, 0, Math.max(0, this.columns.at(-1).x - 650));
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
      else if (pointer.dragDeltaX) this.builderCameraX = clamp(this.builderCameraX - pointer.dragDeltaX, 0, Math.max(0, this.columns.at(-1).x - 650));
    }
    if (this.tool === "column" && pointer.released) {
      if (!this.dragColumn && pointer.dragDistance < 8) this.addColumn(this.builderCameraX + pointer.x, 280);
      this.dragColumn = null;
    }
    if (this.tool === "gap" && pointer.down) {
      const column = this.columnAt(this.builderCameraX + pointer.dragStartX, 40);
      if (column) this.draftGap = { column, startY: pointer.dragStartY, currentY: pointer.y };
    }
    if (this.tool === "gap" && pointer.released && this.draftGap) {
      this.draftGap.column.gapY = clamp(Math.min(this.draftGap.startY, this.draftGap.currentY), 60, 420);
      this.draftGap.column.gapHeight = clamp(Math.abs(this.draftGap.currentY - this.draftGap.startY), 50, 240);
      this.draftGap = null;
    }
  }
  columnAt(x, maxDistance = 50) {
    const closest = this.columns.reduce((current, column) => !current || Math.abs(column.x - x) < Math.abs(current.x - x) ? column : current, null);
    return closest && Math.abs(closest.x - x) <= maxDistance ? closest : null;
  }
  addColumn(x, gapY = 280) {
    const minimumX = this.player.x + 60;
    const column = { x: clamp(x, minimumX, this.columns.at(-1).x + 300), y: 0, width: COLUMN_WIDTH, height: 560, gapY: clamp(gapY, 60, 420), gapHeight: GAP_HEIGHT, passed: false };
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
        this.lifeLost = true;
        player.vy *= -0.25;
        break;
      }
      if (player.x > column.x + column.width / 2) {
        if (this.side === "race") player.passedColumns.add(column);
        else column.passed = true;
        player.columnsPassed += 1;
        if (human) {
          this.score = player.columnsPassed;
          this.furthestColumns = Math.max(this.furthestColumns, this.score);
        } else if (this.side !== "race") {
          this.score = player.columnsPassed;
          this.furthestColumns = Math.max(this.furthestColumns, this.score);
        }
        this.nextColumn = this.columns.find((candidate) => this.side === "race" ? !player.passedColumns.has(candidate) : !candidate.passed) || null;
        if (!human) this.computerMistake = Math.random() < COMPUTER_MISTAKE_CHANCE;
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
    const difference = targetY - player.y;
    if (this.computerMistake && player.x > column.x - 60) {
      this.lifeLost = true;
      return;
    }
    const desiredVelocity = clamp(difference * 4, -360, 360);
    player.vy += (desiredVelocity - player.vy) * Math.min(1, dt * 8);
    this.aiClock += dt;
  }
  publicState() {
    const status = this.side === "race" ? "Race the computer; the first ball to finish wins." : this.side === "builder" || this.side === "layout" ? "Place columns and draw gaps for the computer." : "Clear the gaps to score; reach the far right to win.";
    return { title: this.title, description: this.description, side: this.sideLabel(), status };
  }
}
