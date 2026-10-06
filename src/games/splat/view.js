import { CANVAS_PALETTE, drawText } from "../../rendering.js";
import { SPLAT_MAX_COLUMNS } from "./model.js";

function drawColumns(context, model, cameraX, offset, width) {
  for (const column of model.columns) {
    const x = offset + column.x - cameraX;
    if (x + column.width < offset) continue;
    if (x > offset + width) break;
    context.fillStyle = column.passed ? "#1e293b" : "#475569";
    context.fillRect(x, column.y, column.width, column.gapY);
    context.fillRect(x, column.gapY + column.gapHeight, column.width, column.height - column.gapY - column.gapHeight);
    if (model.side === "builder" && column.id === model.selectedColumnId) {
      context.strokeStyle = "#22d3ee";
      context.lineWidth = 2;
      context.strokeRect(x - 2, column.gapY - 2, column.width + 4, column.gapHeight + 4);
    }
  }
}

function drawPlayer(context, player, cameraX, offset, color) {
  const x = offset + player.x - cameraX;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, player.y, player.radius, 0, Math.PI * 2);
  context.fill();
}

function drawDraftGap(context, model, cameraX, offset) {
  if (!model.draftGap) return;
  const x = offset + model.draftGap.column.x - cameraX;
  const top = Math.min(model.draftGap.startY, model.draftGap.currentY);
  const height = Math.abs(model.draftGap.currentY - model.draftGap.startY);
  context.fillStyle = "#22c55e88";
  context.fillRect(x, top, model.draftGap.column.width, height);
}

export function draw(model, context) {
  context.fillStyle = CANVAS_PALETTE.background;
  context.fillRect(0, 0, 800, 560);
  if (model.side === "race") {
    const distance = Math.abs(model.player.x - model.computerPlayer.x);
    if (distance > 500) {
      drawColumns(context, model, model.player.x - 110, 0, 398);
      drawColumns(context, model, model.computerPlayer.x - 110, 402, 398);
      drawPlayer(context, model.player, model.player.x - 110, 0, "#fbbf24");
      drawPlayer(context, model.computerPlayer, model.computerPlayer.x - 110, 402, "#fb7185");
      context.fillStyle = "#f8fafc";
      context.fillRect(399, 0, 2, 560);
      drawText(context, "YOU", 24, 28, 14, CANVAS_PALETTE.warning);
      drawText(context, "COMPUTER", 426, 28, 14, CANVAS_PALETTE.human);
    } else {
      const cameraX = Math.max(0, Math.min(model.player.x, model.computerPlayer.x) - 110);
      drawColumns(context, model, cameraX, 0, 800);
      drawPlayer(context, model.player, cameraX, 0, "#fbbf24");
      drawPlayer(context, model.computerPlayer, cameraX, 0, "#fb7185");
      drawText(context, "YOU", 16, 28, 14, CANVAS_PALETTE.warning);
      drawText(context, "COMPUTER", 112, 28, 14, CANVAS_PALETTE.human);
    }
    drawText(context, `You: ${model.player.columnsPassed} columns · Lives ${model.raceLives.human}    Computer: ${model.computerPlayer.columnsPassed} columns · Lives ${model.raceLives.computer}`, 16, 542, 12, CANVAS_PALETTE.muted);
  } else {
    drawColumns(context, model, model.cameraX, 0, 800);
    drawDraftGap(context, model, model.cameraX, 0);
    drawPlayer(context, model.player, model.cameraX, 0, model.side === "climber" ? "#fbbf24" : "#fb7185");
    if (model.side === "builder") {
      drawText(context, `Builder: ${model.tool === "gap" ? "draw a gap" : "add/move columns"} · drag empty canvas to pan`, 16, 28, 14, CANVAS_PALETTE.secondary);
      drawText(context, "←→ select · A/D move · ↑↓ gap · Q/E size · C/G tool · N add · Delete remove · PgUp/PgDn pan", 16, 48, 12, CANVAS_PALETTE.secondary);
      if (model.routeLimitReached) drawText(context, `Route limit reached (${SPLAT_MAX_COLUMNS}) — Delete removes the selected column`, 16, 68, 12, CANVAS_PALETTE.warning);
    } else {
      drawText(context, "Hold Up/Down to drift · tap/click the upper/lower half to bounce", 16, 28, 14, CANVAS_PALETTE.secondary);
    }
    drawText(context, model.side === "builder" ? `Route: ${model.columns.length}/${SPLAT_MAX_COLUMNS} columns` : `Furthest: ${model.furthestColumns} columns`, 400, 516, 14, CANVAS_PALETTE.accent, "center");
    drawText(context, `Score: ${model.score} · reach the far right to win`, 16, 542, 12, CANVAS_PALETTE.muted);
  }
}
