import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  model.asteroids.forEach((asteroid) => {
    context.save(); context.translate(asteroid.x, asteroid.y); context.rotate(asteroid.rotation); context.fillStyle = asteroid.tone > 0.5 ? "#64748b" : "#475569"; context.strokeStyle = "#cbd5e1"; context.lineWidth = 2;
    context.beginPath(); asteroid.shape.forEach((scale, point) => { const angle = point / asteroid.shape.length * Math.PI * 2; const x = Math.cos(angle) * asteroid.radius * scale; const y = Math.sin(angle) * asteroid.radius * scale; if (point === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.closePath(); context.fill(); context.stroke(); context.restore();
  });
  const drawShip = (ship, color) => { context.save(); context.translate(ship.x, ship.y); context.rotate(ship.angle); context.fillStyle = color; context.beginPath(); context.moveTo(18, 0); context.lineTo(-12, -11); context.lineTo(-6, 0); context.lineTo(-12, 11); context.closePath(); context.fill(); context.restore(); };
  drawShip(model.ship, model.invulnerable > 0 && Math.floor(model.invulnerable * 10) % 2 === 0 ? "#475569" : "#fbbf24");
  if (model.computerShip) drawShip(model.computerShip, "#f472b6");
  context.lineWidth = 3; model.bullets.forEach((bullet) => { context.strokeStyle = bullet.owner === "computer" ? "#f472b6" : "#22d3ee"; context.beginPath(); context.moveTo(bullet.x, bullet.y); context.lineTo(bullet.x - bullet.vx * 0.025, bullet.y - bullet.vy * 0.025); context.stroke(); });
  if (model.side === "ship" && model.ship.speed > 20) { context.fillStyle = "#fb923c"; context.beginPath(); context.moveTo(model.ship.x - Math.cos(model.ship.angle) * 16, model.ship.y - Math.sin(model.ship.angle) * 16); context.lineTo(model.ship.x - Math.cos(model.ship.angle + 0.5) * 28, model.ship.y - Math.sin(model.ship.angle + 0.5) * 28); context.lineTo(model.ship.x - Math.cos(model.ship.angle - 0.5) * 28, model.ship.y - Math.sin(model.ship.angle - 0.5) * 28); context.fill(); }
  if (model.side === "versus") { drawText(context, `You ${model.playerLives.human} lives · ${model.scores.human} pts`, 16, 28, 14, "#fbbf24"); drawText(context, `Computer ${model.playerLives.computer} lives · ${model.scores.computer} pts`, 16, 48, 14, "#f472b6"); }
  else drawText(context, model.side === "ship" ? "Move the mouse to aim · click or hold to fire · WASD also works" : "Click the sky to send a rock · the computer shoots it", 16, 28, 14, "#cbd5e1");
  drawText(context, model.side === "versus" ? "Shoot the opposing ship. Asteroids remain dangerous to both pilots." : "Rocks are real obstacles: shoot them before they reach the ship.", 16, 542, 12, "#64748b");
}
