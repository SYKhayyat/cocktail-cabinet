import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  const title = model.side === "ai" ? "AI COMPANION" : model.peerId ? "SECOND TAB CONNECTED" : `SEARCHING · ${Math.ceil(model.matchmaking)}s`;
  drawText(context, title, 28, 48, 18, "#22d3ee");
  drawText(context, model.side === "ai" ? "Your conversation is in the chat panel below." : model.peerId ? "Messages appear in the chat panel below." : "Open this page in a second tab to join.", 28, 88, 16, "#cbd5e1");
  drawText(context, "Type below and press Enter or Send.", 28, 120, 14, "#64748b");
}
