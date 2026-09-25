export const CHANNEL_NAME = "cocktail-cabinet-imitation-v3";

export class ImitationController {
  constructor(model) { this.model = model; }
  reset(keepScore = false) {
    this.closeChannel();
    this.model.reset(keepScore);
    if (this.model.side === "human" || this.model.side === "guess" || this.model.side === "provide") this.connectChannel();
  }
  closeChannel() { clearInterval(this.announceTimer); this.announceTimer = null; this.channel?.close(); this.channel = null; }
  connectChannel() {
    if (typeof BroadcastChannel === "undefined") {
      this.model.addMessage("System", "This browser does not support tab or window chat.");
      this.model.phase = "result";
      return;
    }
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event) => {
      this.model.receive(event.data);
      if (event.data?.type === "hello" && event.data.from !== this.model.matchId) this.channel.postMessage({ type: "hello-ack", from: this.model.matchId, mode: this.model.side });
      if (this.model.peerId) this.announceTimer && clearInterval(this.announceTimer);
    };
    const announce = () => {
      if (this.model.peerId) { clearInterval(this.announceTimer); this.announceTimer = null; return; }
      this.channel?.postMessage({ type: "hello", from: this.model.matchId, mode: this.model.side });
    };
    announce();
    this.announceTimer = setInterval(announce, 1000);
  }
  sendMessage(text) {
    const clean = this.model.sendMessage(text);
    if (clean && this.model.side === "human") this.channel?.postMessage({ type: "chat", from: this.model.matchId, text: clean });
    if (clean && this.model.side === "guess" && this.model.peerId && !["start", "new", "ai", "human"].includes(clean.toLowerCase())) this.channel?.postMessage({ type: "guess-sample", from: this.model.matchId, text: clean });
    if (clean && this.model.side === "provide") {
      if (this.model.peerId) this.channel?.postMessage({ type: "guess-sample", from: this.model.matchId, text: clean });
      else this.model.addMessage("System", "No Guess tab is connected. Open Guess AI or human in another tab first.");
    }
  }
  update(dt) { this.model.update(dt); }
}
