import { hasCachedModel, loadLocalModel } from "../../ai/on-device.js";

const AI_SYSTEM_PROMPT = "You are a friendly, general-purpose chat companion. Reply naturally in one or two short sentences. Do not mention this website or games unless the user asks.";
const CLASSIFIER_PROMPT = "Classify whether the user's text sounds AI-generated or human-written. Reply with exactly AI or HUMAN on the first line, then one short explanation.";
const MYSTERY_PROMPT = "Write one natural short message of eight to twenty words. Do not label it, explain it, or mention that it was generated.";

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
    this.modelError = "";
  }
  sideLabel() { return this.side === "ai" ? "Chat with the AI companion" : this.side === "human" ? "Chat with another tab or window" : this.side === "guess" ? "Guess AI or human" : "Write text for AI to classify"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) this.score = 0;
    this.chatLog = [];
    this.phase = this.side === "ai" ? "ai" : this.side === "human" ? "searching" : this.side === "guess" ? "guess-waiting" : this.side;
    this.matchmaking = 2.5;
    this.peerId = null;
    this.aiClock = 0;
    this.aiReady = this.aiReady || false;
    this.aiUnavailable = false;
    this.modelError = "";
    this.modelCached = hasCachedModel();
    this.modelLoading = false;
    this.lastModelStatus = "";
    this.mystery = null;
    this.guessClock = 4;
    this.guessToken = 0;
    this.addMessage("System", this.side === "ai" ? "AI companion ready. Download the model, then say hello." : this.side === "human" ? "Looking for another tab or window…" : this.side === "guess" ? "Waiting a few seconds for another window. The AI will provide a mystery message if none joins." : "Write a sample message for the AI to classify.");
  }
  async prepareProvider() {
    if (this.aiReady || this.modelLoading) return;
    this.modelLoading = true;
    try {
      await loadLocalModel((report) => { this.lastModelStatus = report.text || report.status || "Downloading local AI"; });
      this.aiReady = true;
      this.aiUnavailable = false;
    } catch (error) {
      this.aiUnavailable = true;
      this.modelError = error?.message || "The local AI model failed to load.";
      console.error("[Imitation] Local AI model preparation failed:", error);
    } finally {
      this.modelLoading = false;
    }
  }
  async downloadModel() {
    if (this.side === "human" || this.aiReady || this.modelLoading) return;
    this.aiUnavailable = false;
    this.modelError = "";
    this.modelCached = hasCachedModel();
    this.addMessage("System", this.modelCached ? "Loading the cached local AI model…" : "Starting the local AI model download…");
    await this.prepareProvider();
    if (this.aiReady) this.addMessage("System", "The AI model is ready.");
    else this.addMessage("System", `The AI model could not be downloaded: ${this.modelError || "unknown error"}`);
  }
  receive(message) {
    if (!message || message.from === this.matchId) return;
    if (message.type === "hello" || message.type === "hello-ack" || message.type === "guess-ready") {
      this.peerId = message.from;
      this.matchmaking = 0;
      if (this.side === "guess") {
        this.phase = "guess-peer";
        this.addMessage("System", "Another window joined. They can provide the mystery message.");
      } else this.addMessage("System", "Another tab or window found. You can chat now.");
    }
    if (message.type === "chat") this.addMessage("Partner", message.text);
    if (message.type === "guess-sample" && this.side === "guess") {
      this.guessToken += 1;
      this.mystery = { source: "human", text: message.text };
      this.addMessage("Mystery", message.text);
      this.phase = "guess";
    }
  }
  addMessage(sender, text) {
    const message = { sender, text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    this.chatLog.push(message);
    this.chatLog = this.chatLog.slice(-18);
    this.chatRevision += 1;
    if (sender === "Partner") this.score += 5;
    return message;
  }
  sendMessage(text) {
    const clean = text.trim().slice(0, 240);
    if (!clean) return null;
    if (this.phase === "result") {
      if (this.side === "guess" && ["next", "continue", "new"].includes(clean.toLowerCase())) {
        this.addMessage("You", clean);
        this.phase = "guess-waiting";
        this.mystery = null;
        this.guessClock = 4;
        this.addMessage("System", "Send start to generate the next mystery message.");
        return clean;
      }
      return null;
    }
    this.addMessage("You", clean);
    if (this.side === "ai") void this.askAi(clean);
    if (this.side === "guess") void this.handleGuess(clean);
    if (this.side === "write") void this.classifyText(clean);
    return clean;
  }
  async requestAi(text, systemPrompt = AI_SYSTEM_PROMPT) {
    if (!this.aiReady && !this.modelLoading) return "";
    this.aiUnavailable = false;
    this.modelError = "";
    const started = Date.now();
    try {
      const engine = await loadLocalModel((report) => { this.lastModelStatus = report.text || report.status || "Thinking"; });
      this.aiReady = true;
      const reply = await withTimeout(engine.chat({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
        temperature: 0.7,
        max_tokens: 90,
      }), 120000, "The local AI took too long to respond.");
      const response = reply?.choices?.[0]?.message?.content?.trim() || "";
      const wait = humanDelay(text, response) - (Date.now() - started);
      if (wait > 0) await waitFor(wait);
      return response;
    } catch (error) {
      this.aiUnavailable = true;
      this.modelError = error?.message || "The local AI request failed.";
      console.error("[Imitation] Local AI request failed:", error);
      return "";
    }
  }
  async askAi(text) {
    if (!this.aiReady && !this.modelLoading) {
      this.addMessage("System", "Download the AI model before chatting.");
      return;
    }
    const thinking = this.addMessage("System", "AI is thinking…");
    const response = await this.requestAi(text);
    this.chatLog = this.chatLog.filter((message) => message !== thinking);
    this.chatRevision += 1;
    if (response) this.addMessage("AI", response);
    else this.addMessage("System", `The AI could not respond: ${this.modelError || "unknown error"}`);
  }
  async handleGuess(text, forceAi = false) {
    const value = text.toLowerCase();
    if (value === "start" || value === "new") {
      if (this.peerId && !forceAi) {
        this.phase = "guess-peer";
        this.addMessage("System", "Your partner can now send the mystery message.");
        return;
      }
      if (!this.aiReady && !this.modelLoading) {
        this.phase = "guess-waiting";
        this.addMessage("System", "Download the AI model before generating a mystery message.");
        return;
      }
      this.phase = "guess-loading";
      const token = ++this.guessToken;
      this.addMessage("System", "Generating a mystery message…");
      const response = await this.requestAi("Create the mystery message now.", MYSTERY_PROMPT);
      if (token !== this.guessToken || this.mystery) return;
      if (!response) {
        this.phase = "guess-waiting";
        this.addMessage("System", "The AI could not create a mystery message this time. Try again.");
        return;
      }
      this.mystery = { source: "ai", text: response };
      this.addMessage("Mystery", response);
      this.phase = "guess";
      return;
    }
    if (this.phase !== "guess" || !this.mystery || (value !== "ai" && value !== "human")) return;
    const correct = value === this.mystery.source;
    this.score += correct ? 10 : 0;
    this.addMessage("System", `${correct ? "Correct" : "Not quite"} — the message was ${this.mystery.source.toUpperCase()}.`);
    this.phase = "result";
  }
  async classifyText(text) {
    if (!this.aiReady && !this.modelLoading) {
      this.addMessage("System", "Download the AI model before classifying text.");
      return;
    }
    const thinking = this.addMessage("System", "AI is thinking…");
    const response = await this.requestAi(text, CLASSIFIER_PROMPT);
    this.chatLog = this.chatLog.filter((message) => message !== thinking);
    this.chatRevision += 1;
    if (!response) {
      this.addMessage("System", "The AI could not classify that text this time. Try again.");
      return;
    }
    const classification = response.match(/\b(AI|HUMAN)\b/i)?.[1]?.toUpperCase() || "UNCLEAR";
    this.addMessage("AI", `${classification}\n${response.replace(/^\s*(AI|HUMAN)\s*/i, "").trim()}`);
  }
  update(dt) {
    if (this.side === "human" && !this.peerId) this.matchmaking = Math.max(0, this.matchmaking - dt);
    if (this.side === "guess" && !this.mystery && this.phase !== "guess-loading" && this.phase !== "result") {
      this.guessClock = Math.max(0, this.guessClock - dt);
      if (this.guessClock === 0) void this.handleGuess("start", true);
    }
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "ai" ? this.modelLoading ? "Loading the local AI model" : this.aiReady ? "AI companion ready" : this.modelError ? "The AI model needs attention" : this.modelCached ? "Load the cached AI model" : "Download the AI model to begin" : this.side === "human" ? this.peerId ? "Two tabs or windows are connected" : "Open another tab or window to join" : this.side === "guess" ? this.phase === "guess" ? "Guess AI or human" : this.modelLoading ? "Downloading the AI model" : "Generate a mystery message" : "Submit text for AI classification", chatRevision: this.chatRevision, modelCached: this.modelCached }; }
}

function humanDelay(prompt, response) {
  const words = `${prompt} ${response}`.trim().split(/\s+/).length;
  return Math.min(4200, 450 + words * 42 + Math.random() * 650);
}

function withTimeout(promise, milliseconds, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds))]);
}

function waitFor(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}
