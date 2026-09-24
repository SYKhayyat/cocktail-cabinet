import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  model.columns.forEach((column) => {
    context.fillStyle = column.passed ? "#334155" : "#475569";
    context.fillRect(column.x, column.y, column.width, column.gapY);
    context.fillRect(column.x, column.gapY + column.gapHeight, column.width, column.height - column.gapY - column.gapHeight);
    if (column === model.nextColumn && !column.passed) {
      context.strokeStyle = "#fbbf24"; context.lineWidth = 3; context.strokeRect(column.x - 3, column.gapY - 3, column.width + 6, column.gapHeight + 6);
    }
  });
  context.fillStyle = model.side === "climber" ? "#fbbf24" : "#fb7185";
  context.beginPath(); context.arc(model.player.x, model.player.y, model.player.radius, 0, Math.PI * 2); context.fill();
  drawText(context, model.side === "climber" ? "Click or press Space to boost upward · move with the mouse or A/D" : "Click to place a column gap · the computer climbs toward it", 16, 28, 14, "#cbd5e1");
  drawText(context, "Pass through the highlighted gap before falling into a column.", 16, 542, 12, "#64748b");
}
