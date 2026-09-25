export const CHANNEL_NAME = "cocktail-cabinet-imitation-v3";
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export class ImitationController {
  constructor(model) {
    this.model = model;
    this.channel = null;
    this.manualPeer = null;
    this.manualChannel = null;
    this.manualRemoteId = null;
    this.manualActive = false;
    model.onAiChosen = () => this.sendPayload({ type: "ai-writing", from: this.model.matchId });
    model.onRoundStart = () => this.sendPayload({ type: "round-start", from: this.model.matchId });
  }
  reset(keepScore = false) {
    this.closeChannel();
    this.model.reset(keepScore);
    if (this.model.side === "human" || this.model.side === "guess" || this.model.side === "provide") this.connectChannel();
  }
  closeChannel() {
    clearInterval(this.announceTimer);
    this.announceTimer = null;
    if (this.channel && this.model.peerId) this.channel.postMessage({ type: "bye", from: this.model.matchId, to: this.model.peerId });
    this.channel?.close();
    this.channel = null;
    this.closeManualPeer(true);
  }
  closeManualPeer(sendBye = false) {
    if (sendBye && this.manualChannel?.readyState === "open" && this.manualRemoteId) this.manualChannel.send({ type: "bye", from: this.model.matchId, to: this.manualRemoteId });
    this.manualChannel?.close();
    this.manualPeer?.close();
    this.manualChannel = null;
    this.manualPeer = null;
     this.manualRemoteId = null;
     this.manualActive = false;
   }
   connectChannel() {
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(CHANNEL_NAME);
     this.channel.onmessage = (event) => {
       if (this.manualActive) return;
       this.model.receive(event.data);
      if (event.data?.type === "hello" && event.data.from !== this.model.matchId) this.channel.postMessage({ type: "hello-ack", from: this.model.matchId, to: event.data.from, mode: this.model.side });
      if (this.model.peerId) this.announceTimer && clearInterval(this.announceTimer);
    };
    const announce = () => {
      if (this.model.peerId) { clearInterval(this.announceTimer); this.announceTimer = null; return; }
      this.channel?.postMessage({ type: "hello", from: this.model.matchId, mode: this.model.side });
    };
    announce();
    this.announceTimer = setInterval(announce, 1000);
  }
   sendPayload(payload) {
     if (this.manualActive) {
       if (this.manualChannel?.readyState === "open") this.manualChannel.send(payload);
       return;
     }
     this.channel?.postMessage(payload);
   }
  bindManualChannel(channel, remoteId = this.manualRemoteId) {
    this.manualChannel = channel;
     channel.onopen = () => {
       this.model.addMessage("System", "Manual connection opened.");
       this.connectManualPeer(this.manualRemoteId || remoteId);
     };
     channel.onmessage = (event) => this.model.receive(event.data);
     channel.onclose = () => {
       const currentRemoteId = this.manualRemoteId || remoteId;
       this.model.addMessage("System", "Manual connection closed.");
       if (this.model.peerId === currentRemoteId) this.model.receive({ type: "bye", from: currentRemoteId });
     };
  }
  connectManualPeer(remoteId) {
    if (!remoteId) return;
    this.manualRemoteId = remoteId;
    this.model.peerId = remoteId;
    this.model.matchmaking = 0;
    if (this.model.side === "human") this.model.addMessage("System", "Another player connected. You can chat now.");
    else if (this.model.side === "guess") { this.model.phase = "guess-peer"; this.model.addMessage("System", "A provider connected. A new round is ready."); }
    else if (this.model.side === "provide") { this.model.phase = "provide-waiting"; this.model.addMessage("System", "A Guess player connected. Send a message when prompted."); }
  }
  canUseManualConnection() { return ["human", "guess", "provide"].includes(this.model.side); }
  async createManualInvite() {
    if (!this.canUseManualConnection()) throw new Error("Choose Human, Guess, or Provide before creating an invite.");
    if (typeof RTCPeerConnection === "undefined") throw new Error("This browser does not support WebRTC.");
     this.closeChannel();
     this.closeManualPeer();
     this.manualActive = true;
     this.manualPeer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
     this.bindManualChannel(this.manualPeer.createDataChannel("cocktail-imitation"));
    const offer = await this.manualPeer.createOffer();
    await this.manualPeer.setLocalDescription(offer);
    await waitForIceGathering(this.manualPeer);
    return encodeSignal({ type: "offer", from: this.model.matchId, mode: this.model.side, description: descriptionJson(this.manualPeer.localDescription) });
  }
  async acceptManualInvite(text) {
    if (!this.canUseManualConnection()) throw new Error("Choose Human, Guess, or Provide before joining an invite.");
    if (typeof RTCPeerConnection === "undefined") throw new Error("This browser does not support WebRTC.");
    const signal = decodeSignal(text);
    if (signal.type !== "offer" || signal.mode !== this.model.side) throw new Error("That invite is not for this Imitation mode.");
    this.closeChannel();
    this.closeManualPeer();
     this.manualRemoteId = signal.from;
     this.manualPeer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
     this.manualPeer.ondatachannel = (event) => this.bindManualChannel(event.channel, signal.from);
    await this.manualPeer.setRemoteDescription(signal.description);
    const answer = await this.manualPeer.createAnswer();
    await this.manualPeer.setLocalDescription(answer);
    await waitForIceGathering(this.manualPeer);
    return encodeSignal({ type: "answer", from: this.model.matchId, mode: this.model.side, description: descriptionJson(this.manualPeer.localDescription) });
  }
  async acceptManualAnswer(text) {
    if (!this.manualPeer) throw new Error("Create an invite before accepting an answer.");
    const signal = decodeSignal(text);
    if (signal.type !== "answer" || signal.mode !== this.model.side) throw new Error("That answer is not for this Imitation mode.");
    this.manualRemoteId = signal.from;
    await this.manualPeer.setRemoteDescription(signal.description);
    return true;
  }
  sendMessage(text) {
    const clean = this.model.sendMessage(text);
    if (clean && this.model.side === "human") this.sendPayload({ type: "chat", from: this.model.matchId, text: clean });
    if (clean && this.model.side === "guess" && this.model.peerId) this.sendPayload({ type: "guess-prompt", from: this.model.matchId, text: clean });
    if (clean && this.model.side === "provide") {
      if (this.model.aiLocked) this.model.addMessage("System", "AI is writing this round, not you. Wait for the next round.");
      else if (this.model.peerId && this.model.phase === "provide-ready") this.sendPayload({ type: "guess-response", from: this.model.matchId, text: clean });
      else if (this.model.peerId) this.model.addMessage("System", "Wait for a prompt before writing a response.");
      else this.model.addMessage("System", "No Guess player is connected. Create or join an invite first.");
    }
  }
  update(dt) { this.model.update(dt); }
}

function descriptionJson(description) { return { type: description.type, sdp: description.sdp }; }
function encodeSignal(value) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))); }
function decodeSignal(value) { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.trim()), (character) => character.charCodeAt(0)))); }
async function waitForIceGathering(peer) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 10000);
    const finish = () => { if (peer.iceGatheringState !== "complete") return; clearTimeout(timeout); peer.removeEventListener("icegatheringstatechange", finish); resolve(); };
    peer.addEventListener("icegatheringstatechange", finish);
    finish();
  });
}
