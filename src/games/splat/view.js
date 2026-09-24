import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  model.columns.forEach((column) => {
    const x = column.x - model.cameraX;
    if (x + column.width < 0 || x > 800) return;
    context.fillStyle = column.passed ? "#1e293b" : "#475569";
    context.fillRect(x, column.y, column.width, column.gapY);
    context.fillRect(x, column.gapY + column.gapHeight, column.width, column.height - column.gapY - column.gapHeight);
      });
  const playerX = model.player.x - model.cameraX;
  context.fillStyle = model.side === "climber" ? "#fbbf24" : "#fb7185";
  context.beginPath(); context.arc(playerX, model.player.y, model.player.radius, 0, Math.PI * 2); context.fill();
  drawText(context, model.side === "climber" ? "Hold Up/Down to drift · tap/click the upper/lower half to bounce" : "Click to place a column gap · the computer steers through the route", 16, 28, 14, "#cbd5e1");
  context.fillStyle = "#111827";
  context.fillRect(270, 492, 260, 38);
  context.strokeStyle = "#334155";
  context.strokeRect(270, 492, 260, 38);
  drawText(context, `Furthest: ${model.furthestColumns} columns`, 400, 516, 14, "#22d3ee", "center");
  drawText(context, `Score: ${model.score} · reach the far right to win`, 16, 542, 12, "#64748b");
}
