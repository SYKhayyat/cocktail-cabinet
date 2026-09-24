import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  model.columns.forEach((column) => {
    const x = column.x - model.cameraX;
    if (x + column.width < 0 || x > 800) return;
    context.fillStyle = column.passed ? "#1e293b" : "#475569";
    context.fillRect(x, column.y, column.width, column.gapY);
    context.fillRect(x, column.gapY + column.gapHeight, column.width, column.height - column.gapY - column.gapHeight);
    if (column === model.nextColumn && !column.passed) {
      context.strokeStyle = "#fbbf24"; context.lineWidth = 3; context.strokeRect(x - 3, column.gapY - 3, column.width + 6, column.gapHeight + 6);
    }
  });
  const playerX = model.player.x - model.cameraX;
  context.fillStyle = model.side === "climber" ? "#fbbf24" : "#fb7185";
  context.beginPath(); context.arc(playerX, model.player.y, model.player.radius, 0, Math.PI * 2); context.fill();
  drawText(context, model.side === "climber" ? "Click the upper half to thrust up · click the lower half to thrust down" : "Click to place a column gap · the computer steers through the route", 16, 28, 14, "#cbd5e1");
  drawText(context, `Score: ${model.score} · reach the far right to win`, 16, 542, 12, "#64748b");
}
