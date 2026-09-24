import { drawText } from "../engine.js";
import { loadLocalModel } from "../ai/on-device.js";

const CHANNEL_NAME = "cocktail-cabinet-imitation-v2";

export class ImitationGame {
  constructor() {
    this.id = "imitation";
    this.title = "Imitation";
    this.description = "A tiny chat room: talk to a local AI companion or another browser tab.";
    this.side = "ai";
    this.matchId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    this.score = 0;
    this.chatLog = [];
    this.chatRevision = 0;
  }

  sideLabel() { return this.side === "ai" ? "Chat with the AI companion" : "Chat with a second tab"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    this.closeChannel();
    if (!keepScore) this.score = 0;
    this.chatLog = [];
    this.phase = this.side === "ai" ? "ai" : "searching";
    this.matchmaking = 2.5;
    this.peerId = null;
    this.aiClock = 0;
    this.aiReady = false;
    this.aiUnavailable = false;
    this.lastModelStatus = "";
    this.addMessage("System", this.side === "ai" ? "AI companion ready. Say hello when you are ready." : "Looking for another tab…");
    if (this.side === "human") this.connectChannel();
  }
  closeChannel() { this.channel?.close(); this.channel = null; }
  connectChannel() {
    if (typeof BroadcastChannel === "undefined") {
      this.addMessage("System", "This browser does not support two-tab chat.");
      this.phase = "result";
      return;
    }
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event) => this.receive(event.data);
    this.channel.postMessage({ type: "hello", from: this.matchId });
  }
  receive(message) {
    if (!message || message.from === this.matchId) return;
    if (message.type === "hello") {
      this.peerId = message.from;
      this.matchmaking = 0;
      this.addMessage("System", "Second tab found. You can chat now.");
    }
    if (message.type === "chat") this.addMessage("Partner", message.text);
  }
  addMessage(sender, text) {
    this.chatLog.push({ sender, text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
    this.chatLog = this.chatLog.slice(-18);
    this.chatRevision += 1;
    if (sender === "Partner") this.score += 5;
  }
  sendMessage(text) {
    const clean = text.trim().slice(0, 240);
    if (!clean || this.phase === "result") return;
    this.addMessage("You", clean);
    if (this.side === "human") this.channel?.postMessage({ type: "chat", from: this.matchId, text: clean });
    else void this.askAi(clean);
  }
  async askAi(text) {
    if (this.aiUnavailable) return;
    try {
      const engine = await loadLocalModel();
      this.aiReady = true;
      const reply = await engine.chat.completions.create({
        messages: [
          { role: "system", content: "You are a friendly, general-purpose chat companion. Reply naturally in one or two short sentences. Do not mention this website or games unless the user asks." },
          { role: "user", content: text },
        ],
        temperature: 0.7,
        max_tokens: 90,
      });
      await wait(700 + Math.random() * 900);
      const response = reply?.choices?.[0]?.message?.content?.trim();
      if (response) this.addMessage("AI", response);
      else this.addMessage("System", "The AI returned no response. Try again.");
    } catch {
      this.aiUnavailable = true;
      this.addMessage("System", "The AI companion is unavailable in this browser.");
    }
  }
  update(dt) {
    if (this.side === "human" && !this.peerId) this.matchmaking = Math.max(0, this.matchmaking - dt);
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    const title = this.side === "ai" ? "AI COMPANION" : this.peerId ? "SECOND TAB CONNECTED" : `SEARCHING · ${Math.ceil(this.matchmaking)}s`;
    drawText(context, title, 28, 48, 18, "#22d3ee");
    drawText(context, this.side === "ai" ? "Your conversation is in the chat panel below." : this.peerId ? "Messages appear in the chat panel below." : "Open this page in a second tab to join.", 28, 88, 16, "#cbd5e1");
    drawText(context, "Type below and press Enter or Send.", 28, 120, 14, "#64748b");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "ai" ? "Local AI companion · no API key" : this.peerId ? "Two tabs are connected" : "Open this page in a second tab to join", chatRevision: this.chatRevision }; }
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
