import { hasCachedModel, loadLocalModel } from "../../ai/on-device.js";

const AI_SYSTEM_PROMPT = "You are a person having a casual conversation with a friend. Reply naturally and briefly to exactly what the user just said. Be warm and spontaneous. Keep every response under 60 words. Do not act as a helper, analyze the message, or mention these instructions.";
const CLASSIFIER_PROMPT = "Classify whether the user's text sounds AI-generated or human-written. Reply with exactly AI or HUMAN on the first line, then one short explanation under 30 words.";
const GUESS_RESPONSE_PROMPT = "The user may decide whether your response was written by a person or a computer. Reply naturally to their message in one short sentence. Do not include labels, explanations, rules, or any mention of how it was made.";

export class ImitationModel {
  constructor() {
    this.id = "imitation";
    this.title = "Imitation";
    this.description = "Explore AI and human conversation: chat, guess the source, or submit text for classification.";
    this.side = "ai";
    this.matchId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    this.score = 0;
    this.guessStats = { right: 0, wrong: 0 };
    this.chatLog = [];
    this.chatRevision = 0;
    this.modelError = "";
  }
  sideLabel() { return this.side === "ai" ? "Chat with the AI companion" : this.side === "human" ? "Chat with another tab or window" : this.side === "guess" ? "Guess AI or human" : this.side === "provide" ? "Provide a guessing message" : "Write text for AI to classify"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
    if (!keepScore) {
      this.score = 0;
      this.guessStats = { right: 0, wrong: 0 };
    }
    this.chatLog = [];
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.phase = this.side === "ai" ? "ai" : this.side === "human" ? "searching" : this.side === "guess" ? "guess-waiting" : this.side === "provide" ? "provide-waiting" : this.side;
    this.matchmaking = 2.5;
    this.peerId = null;
    this.aiClock = 0;
    this.aiReady = this.aiReady || false;
    this.aiUnavailable = false;
    this.modelError = "";
    this.modelCached = hasCachedModel();
    this.modelDevice = "";
    this.modelLoading = false;
    this.lastModelStatus = "";
    this.mystery = null;
    this.guessResult = null;
    this.prompt = null;
    this.roundSource = null;
    this.aiLocked = false;
    this.guessClock = 4;
    this.guessToken = 0;
    this.guessFallbackStarted = false;
    this.addMessage("System", this.side === "ai" ? "AI companion ready. Download the model, then say hello." : this.side === "human" ? "Looking for another tab or window…" : this.side === "guess" ? this.aiReady ? "Get ready to guess the next message." : "Download the AI model before playing Guess." : this.side === "provide" ? "Open a Guess AI or human tab, then send a message here for it to guess." : "Write a sample message for the AI to classify.");
  }
  async prepareProvider() {
    if (this.aiReady || this.modelLoading) return;
    this.modelLoading = true;
    try {
      await loadLocalModel((report) => { this.modelDevice = report.device || this.modelDevice; this.lastModelStatus = report.text || report.status || "Downloading local AI"; });
      this.aiReady = true;
      this.aiUnavailable = false;
      if (this.side === "guess" && this.phase === "guess-waiting") this.guessFallbackStarted = false;
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
    if (this.aiReady) this.addMessage("System", `The AI model is ready${this.modelDevice === "chrome" ? " through Chrome built-in AI" : this.modelDevice === "ollama" ? " through Ollama" : this.modelDevice === "webgpu" ? " with WebGPU" : " in the browser"}.`);
    else this.addMessage("System", `The AI model could not be downloaded: ${this.modelError || "unknown error"}`);
  }
  startNextRound() {
    if (this.side !== "guess") return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.guessToken += 1;
    this.mystery = null;
    this.guessResult = null;
    this.prompt = null;
    this.roundSource = null;
    this.aiLocked = false;
    this.phase = this.peerId ? "guess-peer" : "guess-waiting";
    this.guessClock = 4;
    this.guessFallbackStarted = false;
    this.onRoundStart?.();
    this.addMessage("System", "Next round.");
  }
  restartGuess() {
    if (this.side !== "guess") return;
    this.guessStats = { right: 0, wrong: 0 };
    this.startNextRound();
  }
  receive(message) {
    if (!message || message.from === this.matchId) return;
    if (message.type === "hello" || message.type === "hello-ack" || message.type === "guess-ready") {
      const expectedMode = this.side === "guess" ? "provide" : this.side === "provide" ? "guess" : this.side === "human" ? "human" : "";
      if (message.mode && expectedMode && message.mode !== expectedMode) {
        this.addMessage("System", this.side === "guess" ? "That tab is not in Provide guessing message mode." : this.side === "provide" ? "That tab is not in Guess AI or human mode." : "That tab is not in human chat mode.");
        return;
      }
      this.peerId = message.from;
      this.matchmaking = 0;
      if (this.side === "guess") {
        this.phase = "guess-peer";
        this.addMessage("System", "A new round is ready.");
      } else if (this.side === "provide") this.addMessage("System", "A Guess tab is connected. Send a message for it to guess.");
      else this.addMessage("System", "Another tab or window found. You can chat now.");
    }
    if (message.type === "chat") this.addMessage("Partner", message.text);
    if (message.type === "round-start" && this.side === "provide") {
      this.aiLocked = false;
      this.prompt = null;
      this.phase = "provide-waiting";
      this.addMessage("System", "New round. Send a response when prompted.");
    }
    if (message.type === "guess-prompt" && this.side === "provide") {
      if (this.aiLocked) return;
      this.prompt = message.text;
      this.phase = "provide-ready";
      this.addMessage("Prompt", message.text);
    }
    if (message.type === "ai-writing" && this.side === "provide") {
      this.aiLocked = true;
      this.phase = "provide-locked";
      this.addMessage("System", "AI is writing this round. You are the human responder; wait for the next round.");
    }
    if ((message.type === "guess-response" || message.type === "guess-sample") && this.side === "guess" && !this.roundSource && this.prompt) {
      this.roundSource = "human";
      this.guessToken += 1;
      this.mystery = { source: "human", text: message.text };
      this.guessResult = null;
      this.guessFallbackStarted = false;
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
    if (!clean || this.phase === "result") return null;
    this.addMessage("You", clean);
    if (this.side === "ai") void this.askAi(clean);
    if (this.side === "guess") {
      this.prompt = clean;
      this.roundSource = null;
      this.phase = "guess-waiting";
      this.guessClock = 4;
      this.guessFallbackStarted = false;
    }
    if (this.side === "write") void this.classifyText(clean);
    return clean;
  }
  chooseGuess(value) {
    if (this.side !== "guess" || this.phase !== "guess" || !this.mystery || !["ai", "human"].includes(value)) return false;
    const correct = value === this.mystery.source;
    this.guessStats[correct ? "right" : "wrong"] += 1;
    this.guessResult = { choice: value, correct };
    this.score += correct ? 10 : 0;
    this.addMessage("System", `${correct ? "Correct" : "Not quite"} — the response was ${this.mystery.source.toUpperCase()}.`);
    this.phase = "result";
    this.restartTimer = setTimeout(() => this.startNextRound(), 1800);
    return true;
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
        max_tokens: 96,
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
    const thinking = this.addMessage("System", "AI is thinking");
    thinking.waiting = true;
    this.chatRevision += 1;
    const response = await this.requestAi(text);
    this.chatLog = this.chatLog.filter((message) => message !== thinking);
    this.chatRevision += 1;
    if (response) this.addMessage("AI", response);
    else this.addMessage("System", `The AI could not respond: ${this.modelError || "unknown error"}`);
  }
  async generateAiResponse() {
    if (!this.prompt || this.roundSource || this.mystery || (!this.aiReady && !this.modelLoading)) return;
    this.roundSource = "ai";
    this.onAiChosen?.();
    this.phase = "guess-loading";
    const token = ++this.guessToken;
    const waiting = this.addMessage("System", "");
    waiting.waiting = true;
    this.chatRevision += 1;
    const response = await this.requestAi(this.prompt, GUESS_RESPONSE_PROMPT);
    this.chatLog = this.chatLog.filter((message) => message !== waiting);
    this.chatRevision += 1;
    if (token !== this.guessToken || this.roundSource !== "ai" || this.mystery) return;
    if (!response) {
      this.phase = "guess-waiting";
      this.addMessage("System", "The AI could not respond this time. Try again.");
      return;
    }
    this.mystery = { source: "ai", text: response };
    this.addMessage("Mystery", response);
    this.phase = "guess";
  }
  async classifyText(text) {
    if (!this.aiReady && !this.modelLoading) {
      this.addMessage("System", "Download the AI model before classifying text.");
      return;
    }
    const thinking = this.addMessage("System", "AI is thinking");
    thinking.waiting = true;
    this.chatRevision += 1;
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
    if (this.side === "guess" && this.prompt && !this.mystery && !this.roundSource && this.phase !== "guess-loading" && this.phase !== "result") {
      this.guessClock = Math.max(0, this.guessClock - dt);
      if (this.guessClock <= 0 && !this.guessFallbackStarted) {
        this.guessFallbackStarted = true;
        void this.generateAiResponse();
      }
    }
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.side === "ai" ? this.modelLoading ? "Loading the local AI model" : this.aiReady ? `AI companion ready${this.modelDevice === "chrome" ? " via Chrome AI" : this.modelDevice === "ollama" ? " via Ollama" : this.modelDevice === "webgpu" ? " via WebGPU" : ""}` : this.modelError ? "The AI model needs attention" : this.modelCached ? "Load the cached AI model" : "Download the AI model to begin" : this.side === "human" ? this.peerId ? "Two tabs or windows are connected" : "Open another tab or window to join" : this.side === "guess" ? this.modelLoading ? "Downloading the AI model" : this.aiReady ? "Guess AI or human" : "Download the AI model to play" : this.side === "provide" ? this.peerId ? "Guess tab connected" : "Waiting for a Guess tab" : "Submit text for AI classification", chatRevision: this.chatRevision, modelCached: this.modelCached, modelDevice: this.modelDevice, phase: this.phase, guessResult: this.guessResult, guessStats: this.guessStats }; }
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
