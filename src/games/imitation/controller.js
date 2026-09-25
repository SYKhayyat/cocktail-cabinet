export const CHANNEL_NAME = "cocktail-cabinet-imitation-v3";

export class ImitationController {
  constructor(model) { this.model = model; }
  reset(keepScore = false) {
    this.closeChannel();
    this.model.reset(keepScore);
    if (this.model.side === "human") this.connectChannel();
  }
  closeChannel() { this.channel?.close(); this.channel = null; }
  connectChannel() {
    if (typeof BroadcastChannel === "undefined") {
      this.model.addMessage("System", "This browser does not support tab or window chat.");
      this.model.phase = "result";
      return;
    }
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event) => this.model.receive(event.data);
    this.channel.postMessage({ type: "hello", from: this.model.matchId });
  }
  sendMessage(text) {
    const clean = this.model.sendMessage(text);
    if (clean && this.model.side === "human") this.channel?.postMessage({ type: "chat", from: this.model.matchId, text: clean });
  }
  update(dt) { this.model.update(dt); }
}
