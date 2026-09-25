import { loadLocalModel } from "../../ai/on-device.js";

export class ImitationModel {
  constructor() {
    this.id = "imitation";
    this.title = "Imitation";
    this.description = "Explore AI and human conversation: chat, guess the source, or submit text for classification.";
    this.side = "ai";
    this.matchId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    this.score = 0;
    this.chatLog = [];
    this.chatRevision = 0;
  }
  sideLabel() { return this.side === "ai" ? "Chat with the AI companion" : this.side === "human" ? "Chat with another tab or window" : this.side === "guess" ? "Guess AI or human" : "Write text for AI to classify"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.chatLog = [];
    this.phase = this.side === "ai" ? "ai" : this.side === "human" ? "searching" : this.side;
    this.matchmaking = 2.5;
    this.peerId = null;
    this.aiClock = 0;
    this.aiReady = false;
    this.aiUnavailable = false;
    this.lastModelStatus = "";
    this.addMessage("System", this.side === "ai" ? "AI companion ready. Say hello when you are ready." : this.side === "human" ? "Looking for another tab or window…" : this.side === "guess" ? "Read the message, then decide whether it came from an AI or a human." : "Write a sample message for the AI to classify.");
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
    if (!clean || this.phase === "result") return null;
    this.addMessage("You", clean);
    if (this.side === "ai") void this.askAi(clean);
    if (this.side === "guess") this.addMessage("System", "Your guess is recorded. The classifier provider can be connected next.");
    if (this.side === "write") this.addMessage("System", "Sample recorded. The AI classifier provider can be connected next.");
    return clean;
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
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "ai" ? "Local AI companion · provider-ready" : this.side === "human" ? this.peerId ? "Two tabs or windows are connected" : "Open another tab or window to join" : this.side === "guess" ? "Guess whether a message came from AI or human" : "Submit text for AI classification", chatRevision: this.chatRevision }; }
}

function wait(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}
