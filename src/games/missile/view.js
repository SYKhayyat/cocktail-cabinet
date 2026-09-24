import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  context.strokeStyle = "#334155"; context.lineWidth = 2; context.beginPath(); context.moveTo(0, 530); context.lineTo(800, 530); context.stroke();
  model.bases.forEach((base) => {
    context.fillStyle = base.alive ? "#38bdf8" : "#475569"; context.beginPath(); context.arc(base.x, base.y, base.radius, 0, Math.PI * 2); context.fill();
    drawText(context, base.label, base.x, base.y + 5, 14, "#06111f", "center");
  });
  model.enemyMissiles.forEach((missile) => { drawMissile(context, missile); drawTarget(context, missile.targetX, missile.targetY, "#fb7185"); });
  model.interceptors.forEach((missile) => drawMissile(context, missile));
  if (model.side === "defender") { context.strokeStyle = "#fbbf24"; context.lineWidth = 2; context.beginPath(); context.arc(model.target.x, model.target.y, 13, 0, Math.PI * 2); context.stroke(); context.beginPath(); context.moveTo(model.target.x - 18, model.target.y); context.lineTo(model.target.x + 18, model.target.y); context.moveTo(model.target.x, model.target.y - 18); context.lineTo(model.target.x, model.target.y + 18); context.stroke(); }
  drawText(context, model.side === "defender" ? "Move the mouse to aim · press Space to launch a blue interceptor" : "Click a city area to launch a red missile · the computer intercepts", 16, 28, 14, "#cbd5e1");
  drawText(context, "Red = incoming · blue = yours · protect the three city circles", 16, 556, 12, "#64748b");
}

function drawMissile(context, missile) {
  const dx = missile.targetX - missile.x; const dy = missile.targetY - missile.y; const length = Math.max(Math.hypot(dx, dy), 1);
  context.strokeStyle = missile.color; context.lineWidth = 3; context.beginPath(); context.moveTo(missile.x, missile.y); context.lineTo(missile.x - dx / length * 18, missile.y - dy / length * 18); context.stroke();
}
function drawTarget(context, x, y, color) { context.strokeStyle = color; context.lineWidth = 2; context.beginPath(); context.moveTo(x - 6, y - 6); context.lineTo(x + 6, y + 6); context.moveTo(x + 6, y - 6); context.lineTo(x - 6, y + 6); context.stroke(); }
