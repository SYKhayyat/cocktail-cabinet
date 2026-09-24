import { drawText } from "../engine.js";

const CHANNEL_NAME = "cocktail-cabinet-imitation-v1";

export class ImitationGame {
  constructor() {
    this.id = "imitation";
    this.title = "Imitation";
    this.description = "Repeat the pattern. Play the machine, or share a pattern with a second browser tab.";
    this.side = "ai";
    this.id = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    this.score = 0;
  }
  sideLabel() { return this.side === "ai" ? "You play against the machine" : "You play a second browser tab"; }
  setSide(side) { this.side = side; }
  reset() {
    this.score = 0; this.sequence = []; this.playerIndex = 0; this.showing = 0; this.showTimer = 0; this.phase = "ready"; this.channel = null; this.connected = false; this.matchmaking = 0; this.peerId = null; this.message = "";
    if (this.side === "human") this.connectChannel();
  }
  connectChannel() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event) => this.receive(event.data);
    this.connected = true; this.matchmaking = 2.5; this.phase = "searching";
    this.channel.postMessage({ type: "hello", from: this.id });
  }
  receive(message) {
    if (message.type === "hello" && message.from !== this.id) this.peerId = message.from;
    if (message.type === "sequence" && message.from !== this.id) { this.sequence = message.sequence; this.phase = "showing"; this.showing = 0; this.showTimer = 0; }
    if (message.type === "result" && message.from !== this.id) { this.phase = "result"; this.message = `${message.winner === "you" ? "You won" : "Your partner won"} that round.`; }
  }
  play(index) {
    if (this.phase !== "input" || index >= this.sequence.length) return;
    if (this.sequence[this.playerIndex] === index) {
      this.playerIndex += 1; this.score += 10;
      if (this.playerIndex === this.sequence.length) this.finishRound();
    } else this.failRound();
  }
  finishRound() {
    this.sequence.push(Math.floor(Math.random() * 4)); this.phase = "ready"; this.playerIndex = 0;
    if (this.channel) this.channel.postMessage({ type: "sequence", sequence: this.sequence, from: this.id });
    this.phase = "showing"; this.showing = 0;
  }
  failRound() { this.phase = "result"; this.message = "That was the wrong pad. The pattern starts again."; this.score = Math.max(0, this.score - 15); }
  update(dt, input) {
    if (this.phase === "searching") {
      this.matchmaking -= dt;
      if (this.matchmaking <= 0 && this.peerId && this.id < this.peerId) {
        this.sequence = [Math.floor(Math.random() * 4)];
        this.phase = "showing"; this.showing = 0; this.showTimer = 0;
        this.channel.postMessage({ type: "sequence", sequence: this.sequence, from: this.id });
      }
      return;
    }
    if (this.phase === "showing") { this.showTimer += dt; const step = Math.floor(this.showTimer / 0.55); if (step > this.showing && this.showing < this.sequence.length) this.showing += 1; if (this.showTimer > this.sequence.length * 0.55 + 0.35) { this.phase = "input"; this.playerIndex = 0; this.showing = 0; } return; }
    if (this.phase === "input" && input.pointer.clicked) { const pad = Math.floor(input.pointer.x / 200); if (pad >= 0 && pad < 4) this.play(pad); }
    if (this.phase === "ready" && (input.pressed.has(" ") || input.pointer.clicked)) { this.phase = "showing"; this.showing = 0; this.showTimer = 0; }
  }
  draw(context) {
    context.fillStyle = "#080d18"; context.fillRect(0, 0, 800, 560);
    const colors = ["#fb7185", "#fbbf24", "#22d3ee", "#a78bfa"];
    for (let index = 0; index < 4; index += 1) { const x = 40 + index * 185; context.fillStyle = colors[index]; context.globalAlpha = this.showing === index + 1 || (this.phase === "input" && this.sequence[this.playerIndex] === index) ? 0.85 : 0.3; context.fillRect(x, 180, 150, 150); }
    context.globalAlpha = 1; drawText(context, this.message || (this.phase === "searching" ? `Finding a second player… ${Math.ceil(this.matchmaking)}` : this.phase === "showing" ? "Watch closely" : "Repeat the pattern"), 400, 100, 22, "#f8fafc", "center");
    drawText(context, "Click the four colored pads in order.", 400, 390, 16, "#cbd5e1", "center");
  }
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: this.connected ? "A second tab can join without an instant connection." : "Machine mode has no hidden shortcut." }; }
}
