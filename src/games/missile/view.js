import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  context.strokeStyle = "#334155"; context.lineWidth = 2; context.beginPath(); context.moveTo(0, 530); context.lineTo(800, 530); context.stroke();
  model.cities.forEach((city) => { context.fillStyle = city.alive ? "#34d399" : "#475569"; context.beginPath(); context.arc(city.x, city.y, city.radius, 0, Math.PI * 2); context.fill(); });
  model.bases.forEach((base, index) => {
    const selected = model.side === "defender" && index === model.selectedBattery;
    context.fillStyle = base.alive ? (selected ? "#fbbf24" : "#38bdf8") : "#475569";
    context.beginPath(); context.arc(base.x, base.y, base.radius, 0, Math.PI * 2); context.fill();
    if (selected) { context.strokeStyle = "#fbbf24"; context.lineWidth = 3; context.beginPath(); context.arc(base.x, base.y, base.radius + 7, 0, Math.PI * 2); context.stroke(); context.lineWidth = 2; }
    drawText(context, base.label, base.x, base.y + 5, 14, "#06111f", "center");
    if (model.side === "defender") drawText(context, String(base.missiles), base.x, base.y - 28, 12, base.alive ? "#e0f2fe" : "#64748b", "center");
  });
  model.enemyMissiles.forEach((missile) => { drawMissile(context, missile); if (!missile.aircraft) drawTarget(context, missile.targetX, missile.targetY, missile.smart ? "#fbbf24" : "#fb7185"); });
  model.interceptors.forEach((missile) => drawMissile(context, missile));
  model.fireballs.forEach((fireball) => { context.globalAlpha = Math.min(1, fireball.life); context.fillStyle = "#fb923c88"; context.strokeStyle = "#fde68a"; context.lineWidth = 2; context.beginPath(); context.arc(fireball.x, fireball.y, fireball.radius * Math.max(0.35, fireball.life / 4), 0, Math.PI * 2); context.fill(); context.stroke(); context.globalAlpha = 1; });
  if (model.side === "defender") { context.strokeStyle = "#fbbf24"; context.lineWidth = 2; context.beginPath(); context.arc(model.target.x, model.target.y, 13, 0, Math.PI * 2); context.stroke(); context.beginPath(); context.moveTo(model.target.x - 18, model.target.y); context.lineTo(model.target.x + 18, model.target.y); context.moveTo(model.target.x, model.target.y - 18); context.lineTo(model.target.x, model.target.y + 18); context.stroke(); }
  drawText(context, model.side === "defender" ? "Move the mouse to aim · click to launch · Left/Right selects the lit battery" : "Click a city area to launch a red missile · the computer intercepts", 16, 28, 14, "#cbd5e1");
  drawText(context, model.side === "defender" ? `Level ${model.level} · ${model.multiplier}x · Cities ${model.cities.filter((city) => city.alive).length}/6 · Reserve ${model.reserveCities}` : "Red = incoming · blue = yours · protect the three batteries", 16, 556, 12, "#64748b");
}

function drawMissile(context, missile) {
  const dx = missile.targetX - missile.x; const dy = missile.targetY - missile.y; const length = Math.max(Math.hypot(dx, dy), 1);
  context.strokeStyle = missile.color; context.lineWidth = 5; context.beginPath(); context.moveTo(missile.x, missile.y); context.lineTo(missile.x - dx / length * 22, missile.y - dy / length * 22); context.stroke();
}
function drawTarget(context, x, y, color) { context.strokeStyle = color; context.lineWidth = 2; context.beginPath(); context.moveTo(x - 6, y - 6); context.lineTo(x + 6, y + 6); context.moveTo(x + 6, y - 6); context.lineTo(x - 6, y + 6); context.stroke(); }
