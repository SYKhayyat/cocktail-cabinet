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

export const MIN_CANVAS_TEXT_CSS_PX = 12;
const frames = new WeakMap();

// The engine brackets the complete frame, including its lifecycle overlay.
// Keep drawing positions/sizes unchanged; enlarged labels would overlap the
// playfield on narrow screens. Instead expose *the actual drawn strings* in an
// unscaled, wrapping visual companion. The cabinet's semantic status region is
// separate; this visual duplicate is intentionally hidden from screen readers.
export function beginCanvasTextFrame(context) {
  let frame = frames.get(context);
  if (!frame) {
    frame = { entries: [], panel: null, signature: "" };
    frames.set(context, frame);
  }
  frame.entries = [];
}

export function endCanvasTextFrame(context) {
  const frame = frames.get(context);
  const canvas = context.canvas;
  if (!frame || !canvas?.ownerDocument || !canvas.parentNode) return;
  const width = canvas.getBoundingClientRect().width;
  const scale = width / canvas.width;
  // Small object badges (e.g. Breakout's 7px text) also need full-size copies.
  const needsCompanion = width > 0 && frame.entries.some(({ size }) => size * scale < MIN_CANVAS_TEXT_CSS_PX);
  const screen = canvas.closest?.(".screen-frame");
  if (!needsCompanion || screen?.hidden) {
    if (frame.panel) frame.panel.hidden = true;
    return;
  }
  if (!frame.panel) {
    const document = canvas.ownerDocument;
    const panel = document.createElement("div");
    panel.className = "canvas-text-companion";
    panel.setAttribute("aria-hidden", "true");
    Object.assign(panel.style, {
      boxSizing: "border-box", width: "100%", minWidth: "0",
      padding: "0.75rem", backgroundColor: CANVAS_PALETTE.background,
      color: CANVAS_PALETTE.text, fontFamily: "system-ui, sans-serif",
      fontSize: "max(0.875rem, 14px)", fontWeight: "700", lineHeight: "1.5",
      overflowWrap: "anywhere", whiteSpace: "normal"
    });
    // The cabinet's screen-frame is a horizontal flex container. Do not insert
    // into it: that would shrink the canvas itself and create a feedback loop.
    (screen || canvas).insertAdjacentElement("afterend", panel);
    frame.panel = panel;
  }
  frame.panel.hidden = false;
  const labels = [...new Set(frame.entries.map(({ text }) => text))];
  const signature = JSON.stringify(labels);
  if (signature === frame.signature) return; // No DOM churn at animation rate.
  frame.signature = signature;
  const document = canvas.ownerDocument;
  const title = document.createElement("div");
  title.textContent = "Canvas labels (full size)";
  const list = document.createElement("ul");
  Object.assign(list.style, { margin: "0.5rem 0 0", paddingInlineStart: "1.25rem" });
  for (const label of labels) {
    const item = document.createElement("li");
    item.textContent = label;
    list.append(item);
  }
  frame.panel.replaceChildren(title, list);
}

export function drawText(context, text, x, y, size = 16, color = CANVAS_PALETTE.text, align = "left", companionText = text) {
  frames.get(context)?.entries.push({ text: String(companionText), size });
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
