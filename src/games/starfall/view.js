import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  context.strokeStyle = "#1e293b"; context.beginPath(); context.moveTo(0, 500); context.lineTo(800, 500); context.stroke();
  model.gems.forEach((gem) => { context.fillStyle = "#22d3ee"; context.beginPath(); context.arc(gem.x, gem.y, 10, 0, Math.PI * 2); context.fill(); });
  model.stars.forEach((star) => { context.strokeStyle = "#fb7185"; context.lineWidth = 3; context.beginPath(); context.moveTo(star.x - 7, star.y - 7); context.lineTo(star.x + 7, star.y + 7); context.moveTo(star.x + 7, star.y - 7); context.lineTo(star.x - 7, star.y + 7); context.stroke(); });
  context.fillStyle = "#fbbf24"; context.beginPath(); context.arc(model.runner.x, model.runner.y, model.runner.radius, 0, Math.PI * 2); context.fill();
  drawText(context, model.side === "runner" ? "Move with the mouse or A/D · collect falling blue gems · avoid red stars" : "Click or drag the sky to send a star · the computer dodges", 16, 28, 14, "#cbd5e1");
  drawText(context, "The yellow circle is the runner. Red X marks are hazards.", 16, 542, 12, "#64748b");
}
