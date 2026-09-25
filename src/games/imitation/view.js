import { drawText } from "../../engine.js";

export function draw(model, context) {
  context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
  const title = model.side === "ai" ? "AI COMPANION" : model.side === "human" ? model.peerId ? "SECOND TAB OR WINDOW CONNECTED" : `SEARCHING · ${Math.ceil(model.matchmaking)}s` : model.side === "guess" ? "AI OR HUMAN?" : "CLASSIFY THIS TEXT";
  drawText(context, title, 28, 48, 18, "#22d3ee");
  drawText(context, model.side === "ai" ? "Your conversation is in the chat panel below." : model.side === "human" ? model.peerId ? "Messages appear in the chat panel below." : "Open another tab or window to join." : model.side === "guess" ? "Submit a message and make your guess in the panel below." : "Submit a sample for the future AI classifier.", 28, 88, 16, "#cbd5e1");
  drawText(context, "Type below and press Enter or Send.", 28, 120, 14, "#64748b");
}
