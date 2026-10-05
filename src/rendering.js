export function drawText(context, text, x, y, size = 16, color = "#f8fafc", align = "left") {
  context.fillStyle = color;
  context.font = `700 ${size}px system-ui, sans-serif`;
  context.textAlign = align;
  context.fillText(text, x, y);
}
