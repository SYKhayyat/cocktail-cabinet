import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  model.platforms.forEach((platform) => { context.fillStyle = platform.color; context.fillRect(platform.x, platform.y, platform.width, platform.height); });
  const next = model.platforms.filter((platform) => platform.y < model.climber.y).sort((a, b) => b.y - a.y)[0];
  if (next && model.side === "climber") { context.strokeStyle = "#fbbf24"; context.lineWidth = 3; context.strokeRect(next.x - 3, next.y - 3, next.width + 6, next.height + 6); }
  context.fillStyle = model.side === "climber" ? "#fbbf24" : "#fb7185"; context.fillRect(model.climber.x, model.climber.y, model.climber.width, model.climber.height);
  drawText(context, model.side === "climber" ? "The climber jumps automatically · move the mouse left and right" : "Click to lay a platform · the computer climbs toward it", 16, 28, 14, "#cbd5e1");
  drawText(context, model.side === "climber" ? "Land on the glowing platform above. The next one appears higher." : "Build a reachable route upward; do not trap the climber.", 16, 542, 12, "#64748b");
}
