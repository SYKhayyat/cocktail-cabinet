// All canvas text uses the normal-text (4.5:1) threshold, including headings:
// the 800px drawing surface can be scaled below large-text sizes by CSS.
export const CANVAS_PALETTE = Object.freeze({
  background: "#080d18",
  text: "#f8fafc",
  secondary: "#cbd5e1",
  muted: "#94a3b8",
  accent: "#22d3ee",
  warning: "#fbbf24",
  human: "#fb7185",
  computer: "#f472b6",
  onBright: "#07111f"
});

export function drawText(context, text, x, y, size = 16, color = CANVAS_PALETTE.text, align = "left") {
  context.font = `700 ${size}px system-ui, sans-serif`;
  context.textAlign = align;
  // Moving rocks, columns, bricks and projectiles can pass under HUD text.
  // An opaque backplate makes its palette contrast independent of game state.
  // Dark object badges instead sit directly on their audited bright objects.
  if (color !== CANVAS_PALETTE.onBright) {
    const width = context.measureText?.(String(text))?.width ?? String(text).length * size * 0.65;
    const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    context.fillStyle = CANVAS_PALETTE.background;
    context.fillRect(left - 2, y - size, width + 4, size + 4);
  }
  context.fillStyle = color;
  context.fillText(text, x, y);
}
