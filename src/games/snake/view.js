import { drawText } from "../../engine.js";
import { BOARD_WIDTH, BOARD_HEIGHT } from "./model.js";

export function draw(model, context) {
  const cellWidth = model.cellWidth();
  const cellHeight = model.cellHeight();
  context.fillStyle = "#080d18"; context.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  context.strokeStyle = "#1e293b"; context.lineWidth = 1;
  for (let x = 0; x <= model.cols; x += 1) { context.beginPath(); context.moveTo(x * cellWidth, 0); context.lineTo(x * cellWidth, BOARD_HEIGHT); context.stroke(); }
  for (let y = 0; y <= model.rows; y += 1) { context.beginPath(); context.moveTo(0, y * cellHeight); context.lineTo(BOARD_WIDTH, y * cellHeight); context.stroke(); }
  if (model.apple) { const center = model.cellCenter(model.apple); context.fillStyle = "#fb7185"; context.beginPath(); context.arc(center.x, center.y, Math.min(cellWidth, cellHeight) * 0.38, 0, Math.PI * 2); context.fill(); }
  model.snake.forEach((part, index) => { context.fillStyle = index === 0 ? "#22d3ee" : "#0e7490"; context.fillRect(part.x * cellWidth + 2, part.y * cellHeight + 2, cellWidth - 4, cellHeight - 4); });
  drawText(context, model.gameOver ? "Game over — press New round" : model.side === "apples" ? "Click to place apples · computer steers" : "Hold the mouse to steer · arrow keys also work", 16, 28, 14, "#cbd5e1");
  drawText(context, `${model.cols} × ${model.rows} board · ${model.wrap ? "walls wrap" : "walls end the round"} · starts at ${model.startingLength}`, 16, 542, 12, "#64748b");
}
