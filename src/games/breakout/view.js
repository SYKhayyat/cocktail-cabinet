import { drawText } from "../../engine.js";
import { BRICK_LABELS } from "./model.js";

const BRICK_COLORS = { normal: "#38bdf8", extraLife: "#4ade80", double: "#f472b6", speed: "#fbbf24", shortBar: "#c084fc", longBar: "#fb923c", hazard: "#fb7185" };

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  context.strokeStyle = "#64748b"; context.lineWidth = 3; context.strokeRect(2, 2, 796, 556);
  model.bricks.forEach((brick) => {
    if (!brick.hits) return;
    context.save();
    const active = brick.type === "normal" || brick.active;
    context.globalAlpha = 1;
    context.fillStyle = active ? (model.dragIndex === model.bricks.indexOf(brick) ? "#fbbf24" : BRICK_COLORS[brick.type]) : BRICK_COLORS.normal;
    context.fillRect(brick.x, brick.y, brick.width, brick.height);
    if (brick.type !== "normal" && active) drawText(context, BRICK_LABELS[brick.type], brick.x + brick.width / 2, brick.y + 13, 7, "#07111f", "center");
    context.restore();
  });
  const paddle = model.activePaddle();
  context.fillStyle = model.side === "bottom" ? "#fb7185" : "#fbbf24"; context.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
  model.balls.forEach((ball) => { context.fillStyle = "#f8fafc"; context.beginPath(); context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2); context.fill(); });
  drawText(context, model.side === "bottom" ? "Move the mouse or use A/D to control the bottom paddle" : "Click a block to cycle its type · drag to rearrange · the computer returns the ball", 16, 28, 14, "#cbd5e1");
  drawText(context, "Green +1 life · Pink 2 balls · Yellow speed · Purple short bar · Orange long bar · Red danger", 16, 542, 12, "#cbd5e1");
}
