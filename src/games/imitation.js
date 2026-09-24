import { drawText } from "../engine.js";
import { loadLocalModel, localModelSupport } from "../ai/on-device.js";

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
  reset() {
    this.closeChannel();
    this.score = 0;
    this.chatLog = [];
    this.phase = this.side === "ai" ? "ai" : "searching";
    this.matchmaking = 2.5;
    this.peerId = null;
    this.aiClock = 0;
    this.aiReady = false;
    this.lastModelStatus = "";
    this.addMessage("System", this.side === "ai" ? "AI companion online. The local model loads on your first message." : "Looking for another tab…");
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
    try {
      const support = localModelSupport();
      if (!support.ok) throw new Error(support.reason);
      if (!this.aiReady) this.addMessage("System", "Loading the local Llama model…");
      const engine = await loadLocalModel((report) => {
        if (report?.text && report.text !== this.lastModelStatus) {
          this.lastModelStatus = report.text;
          this.addMessage("System", `Model: ${report.text}`);
        }
      });
      this.aiReady = true;
      const reply = await engine.chat.completions.create({
        messages: [
          { role: "system", content: "You are a friendly companion in a small arcade game. Reply in one or two short sentences. Do not claim to be Claude." },
          { role: "user", content: text },
        ],
        temperature: 0.7,
        max_tokens: 90,
      });
      this.addMessage("AI", reply?.choices?.[0]?.message?.content?.trim() || this.chooseAiReply(text));
    } catch (error) {
      this.addMessage("System", `${error.message} Using the offline companion.`);
      this.addMessage("AI", this.chooseAiReply(text));
    }
  }
  chooseAiReply(text) {
    const lower = text.toLowerCase();
    if (lower.includes("name")) return "I am the Cocktail Cabinet's local AI companion. What should I call you?";
    if (lower.includes("game") || lower.includes("play")) return "I like Breakout, but Snake has excellent apple placement. Which one do you want to try?";
    if (lower.includes("hello") || lower.includes("hi")) return "Hello! I am listening. Ask me about the cabinet or tell me what you are building.";
    if (lower.includes("python")) return "Python is a great language for readable game logic. JavaScript is what the browser understands here.";
    if (lower.includes("?")) return "That is a thoughtful question. I can chat, pattern-match, and help you explore the cabinet, but I am a small local responder rather than a giant cloud model.";
    return "I heard you. Tell me a little more, or ask me about games, Python, or the cabinet.";
  }
  update(dt) {
    if (this.side === "human" && !this.peerId) this.matchmaking = Math.max(0, this.matchmaking - dt);
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    const title = this.side === "ai" ? "AI COMPANION" : this.peerId ? "SECOND TAB CONNECTED" : `SEARCHING · ${Math.ceil(this.matchmaking)}s`;
    drawText(context, title, 28, 38, 16, "#22d3ee");
    const visible = this.chatLog.slice(-7);
    visible.forEach((message, index) => {
      const y = 78 + index * 58;
      const color = message.sender === "You" ? "#fbbf24" : message.sender === "AI" ? "#a78bfa" : message.sender === "System" ? "#64748b" : "#22d3ee";
      drawText(context, `${message.sender} · ${message.time}`, 28, y, 12, color);
      wrapText(context, message.text, 28, y + 22, 730, 18, "#e2e8f0");
    });
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "ai" ? "Local AI companion · no API key" : this.peerId ? "Two tabs are connected" : "Open this page in a second tab to join", chatRevision: this.chatRevision }; }
}

function wrapText(context, text, x, y, maxWidth, lineHeight, color) {
  context.font = "700 16px system-ui, sans-serif";
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      drawText(context, line, x, lineY, 16, color);
      line = word; lineY += lineHeight;
    } else line = candidate;
  }
  if (line) drawText(context, line, x, lineY, 16, color);
}
