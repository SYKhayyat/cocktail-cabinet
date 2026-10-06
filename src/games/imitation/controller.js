import { expectedPeerMode } from "./model.js";

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
    this.announceTimer = null;
    this.heartbeatTimer = null;
    this.active = false;
    this.pageHidden = false;
    this.lifecycleAttached = false;
    this.handlePageHide = () => {
      if (!this.active) return;
      this.pageHidden = true;
      this.model.invalidatePendingRequests();
      this.closeChannel();
      this.model.dropPeer();
    };
    this.handlePageShow = () => {
      if (!this.active || !this.pageHidden) return;
      this.pageHidden = false;
      if (this.canUseManualConnection()) this.connectChannel();
    };
    this.bindModelCallbacks();
  }
  bindModelCallbacks() {
    const model = this.model;
    model.onAiChosen = () => { if (model.peerId) this.sendPayload({ type: "ai-writing", from: model.matchId, to: model.peerId }); };
    model.onRoundStart = () => { if (model.peerId) this.sendPayload({ type: "round-start", from: model.matchId, to: model.peerId }); };
    model.onPeerChange = () => this.syncPresence();
  }
  attachLifecycle() {
    if (this.lifecycleAttached) return;
    globalThis.addEventListener?.("pagehide", this.handlePageHide);
    globalThis.addEventListener?.("pageshow", this.handlePageShow);
    this.lifecycleAttached = true;
  }
  controlHint() {
    return [
      { keys: ["Enter"], label: "send a message" },
      { keys: ["Click"], label: "choose a guess" }
    ];
  }
  reset(keepScore = false) {
    this.closeChannel();
    this.model.reset(keepScore);
    this.active = true;
    this.pageHidden = false;
    this.bindModelCallbacks();
    this.attachLifecycle();
    if (["human", "guess", "provide"].includes(this.model.side)) this.connectChannel();
  }
  destroy() {
    this.active = false;
    this.closeChannel();
    globalThis.removeEventListener?.("pagehide", this.handlePageHide);
    globalThis.removeEventListener?.("pageshow", this.handlePageShow);
    this.lifecycleAttached = false;
    this.model.destroy();
  }
  sendBye() {
    if (this.channel && this.model.peerId) {
      this.channel.postMessage({ type: "bye", from: this.model.matchId, to: this.model.peerId });
    }
    // BroadcastChannel is the normal same-browser path. DataChannel's close
    // event covers the manual path; sending here is best effort because a
    // document may be in the middle of being torn down.
    if (this.manualChannel?.readyState === "open" && this.manualRemoteId) {
      try { this.manualChannel.send(JSON.stringify({ type: "bye", from: this.model.matchId, to: this.manualRemoteId })); } catch { }
    }
  }
  closeChannel() {
    clearInterval(this.announceTimer);
    clearInterval(this.heartbeatTimer);
    this.announceTimer = null;
    this.heartbeatTimer = null;
    this.sendBye();
    this.model.peerLivenessEnabled = false;
    if (this.channel) this.channel.onmessage = null;
    this.channel?.close();
    this.channel = null;
    this.closeManualPeer();
  }
  closeManualPeer(sendBye = false) {
    if (sendBye && this.manualChannel?.readyState === "open" && this.manualRemoteId) {
      try { this.manualChannel.send(JSON.stringify({ type: "bye", from: this.model.matchId, to: this.manualRemoteId })); } catch { }
    }
    // Closing a retired transport must not deliver callbacks into a restored
    // or reset round that reuses this controller and the same matchId.
    if (this.manualChannel) {
      this.manualChannel.onopen = null;
      this.manualChannel.onmessage = null;
      this.manualChannel.onclose = null;
      this.manualChannel.onerror = null;
    }
    if (this.manualPeer) this.manualPeer.ondatachannel = null;
    this.manualChannel?.close();
    this.manualPeer?.close();
    this.manualChannel = null;
    this.manualPeer = null;
    this.manualRemoteId = null;
    this.manualActive = false;
  }
  connectChannel() {
    if (!this.active || this.pageHidden || this.channel || typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.model.peerLivenessEnabled = true;
    this.channel.onmessage = (event) => {
      if (!this.active || this.pageHidden || this.manualActive) return;
      this.model.receive(event.data);
      // Only acknowledge a hello we actually accepted. Otherwise a third tab
      // would believe it paired with a player whose slot is already occupied.
      if (event.data?.type === "hello" && this.model.peerId === event.data.from) {
        this.channel.postMessage({ type: "hello-ack", from: this.model.matchId, to: event.data.from, mode: this.model.side });
      }
    };
    this.syncPresence();
  }
  announce() {
    if (this.model.peerId || !this.channel || this.manualActive) return;
    this.channel.postMessage({ type: "hello", from: this.model.matchId, mode: this.model.side });
  }
  heartbeat() {
    if (!this.model.peerId || !this.channel || this.manualActive) return;
    this.channel.postMessage({ type: "heartbeat", from: this.model.matchId, to: this.model.peerId, mode: this.model.side });
  }
  syncPresence() {
    clearInterval(this.announceTimer);
    clearInterval(this.heartbeatTimer);
    this.announceTimer = null;
    this.heartbeatTimer = null;
    if (!this.active || this.pageHidden || !this.channel || this.manualActive) return;
    if (this.model.peerId) {
      this.heartbeat();
      this.heartbeatTimer = setInterval(() => this.heartbeat(), 1000);
    } else {
      this.announce();
      this.announceTimer = setInterval(() => this.announce(), 1000);
    }
  }
  sendPayload(payload) {
    try {
      if (this.manualActive) {
        if (this.manualChannel?.readyState !== "open") throw new Error("The manual connection is not open.");
        this.manualChannel.send(JSON.stringify(payload));
      } else {
        if (!this.channel) throw new Error("No player connection is available.");
        this.channel.postMessage(payload);
      }
      return true;
    } catch {
      this.model.dropPeer();
      this.model.addMessage("System", "The player connection failed. Your message was not sent; reconnect and try again.");
      return false;
    }
  }
  bindManualChannel(channel, remoteId = this.manualRemoteId) {
    this.manualChannel = channel;
    channel.onopen = () => {
      this.model.addMessage("System", "Manual connection opened.");
      this.connectManualPeer(this.manualRemoteId || remoteId);
    };
    channel.onmessage = (event) => {
      if (!this.active || this.pageHidden || this.manualChannel !== channel) return;
      try { this.model.receive(JSON.parse(event.data)); } catch { /* Ignore malformed wire data. */ }
    };
    channel.onclose = channel.onerror = () => {
      const currentRemoteId = this.manualRemoteId || remoteId;
      this.model.addMessage("System", "Manual connection closed.");
      if (this.model.peerId === currentRemoteId) this.model.receive({ type: "bye", from: currentRemoteId });
    };
    if (channel.readyState === "open") channel.onopen();
  }
  connectManualPeer(remoteId) {
    if (!remoteId) return;
    this.manualRemoteId = remoteId;
    this.model.peerId = remoteId;
    this.model.peerLivenessEnabled = false;
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
    this.model.dropPeer();
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
    if (signal.type !== "offer" || signal.mode !== expectedPeerMode(this.model.side) || signal.from === this.model.matchId) throw new Error("That invite is not for this Imitation mode.");
    this.closeChannel();
    this.model.dropPeer();
    this.closeManualPeer();
    this.manualActive = true;
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
    if (signal.type !== "answer" || signal.mode !== expectedPeerMode(this.model.side) || signal.from === this.model.matchId) throw new Error("That answer is not for this Imitation mode.");
    this.manualRemoteId = signal.from;
    await this.manualPeer.setRemoteDescription(signal.description);
    return true;
  }
  sendMessage(text) {
    const candidate = text.trim().slice(0, 2000);
    if (this.model.disposed || !candidate || this.model.phase === "result") return null;
    if (this.model.side === "human") {
      if (!this.model.peerId) { this.model.addMessage("System", "No player is connected. Your message was not sent."); return null; }
      if (!this.sendPayload({ type: "chat", from: this.model.matchId, to: this.model.peerId, text: candidate })) return null;
    }
    if (this.model.side === "provide") {
      if (!this.model.peerId || this.model.aiLocked || this.model.phase !== "provide-ready") {
        this.model.addMessage("System", !this.model.peerId ? "No Guess player is connected. Create or join an invite first." : this.model.aiLocked ? "AI is writing this round, not you. Wait for the next round." : "Wait for a prompt before writing a response.");
        return null;
      }
      if (!this.sendPayload({ type: "guess-response", from: this.model.matchId, to: this.model.peerId, text: candidate })) return null;
    }
    const peerBeforeSend = this.model.peerId;
    const clean = this.model.sendMessage(text);
    if (clean && this.model.side === "guess" && peerBeforeSend && (!this.model.peerId || !this.sendPayload({ type: "guess-prompt", from: this.model.matchId, to: this.model.peerId, text: clean }))) {
      const rejectedEntry = this.model.chatLog.findLast((entry) => entry.sender === "You" && entry.text === clean);
      this.model.chatLog = this.model.chatLog.filter((entry) => entry !== rejectedEntry);
      this.model.chatRevision += 1;
      this.model.notifyState();
      return null;
    }
    return clean;
  }
  update(dt) { this.model.update(dt); }
}

function descriptionJson(description) { return { type: description.type, sdp: description.sdp }; }
function encodeSignal(value) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))); }
function decodeSignal(value) {
  let signal;
  try { signal = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.trim()), (character) => character.charCodeAt(0)))); } catch { throw new Error("That connection code is invalid."); }
  if (!signal || typeof signal.from !== "string" || !signal.from || typeof signal.mode !== "string" || !["offer", "answer"].includes(signal.type) || signal.description?.type !== signal.type || typeof signal.description.sdp !== "string") throw new Error("That connection code is invalid.");
  return signal;
}
async function waitForIceGathering(peer) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 10000);
    const finish = () => { if (peer.iceGatheringState !== "complete") return; clearTimeout(timeout); peer.removeEventListener("icegatheringstatechange", finish); resolve(); };
    peer.addEventListener("icegatheringstatechange", finish);
    finish();
  });
}
