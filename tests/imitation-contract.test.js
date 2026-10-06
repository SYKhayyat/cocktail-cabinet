import test from "node:test";
import assert from "node:assert/strict";
import { ImitationModel, IMITATION_MODES, PEER_LIVENESS_TIMEOUT } from "../src/games/imitation/model.js";
import { ImitationController } from "../src/games/imitation/controller.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function manualFixture(t) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "RTCPeerConnection");
  globalThis.RTCPeerConnection = class {
    constructor() { this.iceGatheringState = "complete"; }
    createDataChannel() { return { readyState: "connecting", close() {} }; }
    async createOffer() { return { type: "offer", sdp: "test offer" }; }
    async createAnswer() { return { type: "answer", sdp: "test answer" }; }
    async setLocalDescription(value) { this.localDescription = value; }
    async setRemoteDescription(value) { this.remoteDescription = value; }
    close() {}
  };
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "RTCPeerConnection", descriptor); else delete globalThis.RTCPeerConnection; });
  return transportFixture(t);
}

function linkManualChannels(left, right) {
  const channels = [left, right].map(() => ({
    readyState: "open", sent: [],
    send(data) {
      assert.equal(typeof data, "string", "RTCDataChannel requires a string, not an object");
      this.sent.push(data);
      const remote = channels.find((candidate) => candidate !== this);
      queueMicrotask(() => remote.onmessage?.({ data }));
    },
    close() { this.readyState = "closed"; }
  }));
  for (const [index, controller] of [left, right].entries()) {
    controller.closeChannel();
    controller.model.dropPeer();
    controller.manualActive = true;
    controller.manualRemoteId = [right, left][index].model.matchId;
    controller.bindManualChannel(channels[index]);
  }
  return channels;
}

test("manual string-only channels carry chat, Unicode and departure", async (t) => {
  const fixture = transportFixture(t);
  const left = fixture.create("human");
  const right = fixture.create("human");
  const [channel] = linkManualChannels(left, right);
  left.sendMessage("Hello 👋 שלום");
  await flush();
  assert.equal(right.model.chatLog.at(-1).text, "Hello 👋 שלום");
  assert.equal(right.model.score, 5);
  left.handlePageHide();
  await flush();
  assert.equal(JSON.parse(channel.sent.at(-1)).type, "bye");
  assert.equal(right.model.peerId, null);
});

for (const inviter of ["guess", "provide"]) test(`manual ${inviter} channel carries prompt, response and round controls`, async (t) => {
  const fixture = transportFixture(t);
  const left = fixture.create(inviter);
  const right = fixture.create(inviter === "guess" ? "provide" : "guess");
  linkManualChannels(left, right);
  const guess = inviter === "guess" ? left : right;
  const provide = inviter === "provide" ? left : right;
  guess.sendMessage("A question?");
  await flush();
  assert.equal(provide.model.prompt, "A question?");
  provide.sendMessage("A human response.");
  await flush();
  assert.equal(guess.model.mystery.text, "A human response.");
  guess.model.startNextRound();
  await flush();
  assert.equal(provide.model.phase, "provide-waiting");
  guess.model.onAiChosen();
  await flush();
  assert.equal(provide.model.aiLocked, true);
});

test("manual wire messages ignore malformed JSON, envelopes and non-peer senders", (t) => {
  const fixture = transportFixture(t);
  const left = fixture.create("human");
  const right = fixture.create("human");
  const [channel] = linkManualChannels(left, right);
  const revision = left.model.chatRevision;
  for (const data of ["[object Object]", "null", "{}", "[]", JSON.stringify({ type: "chat", from: right.model.matchId }), JSON.stringify({ type: "chat", from: "intruder", text: "bad" })]) channel.onmessage({ data });
  assert.equal(left.model.chatRevision, revision);
});

test("a failed manual delivery drops the usable connection and reports failure", (t) => {
  const fixture = transportFixture(t);
  const left = fixture.create("human");
  const right = fixture.create("human");
  const [channel] = linkManualChannels(left, right);
  channel.send = () => { throw new Error("RTC send failure"); };
  assert.equal(left.sendPayload({ type: "chat", from: left.model.matchId, text: "retry" }), false);
  assert.equal(left.model.peerId, null);
  assert.match(left.model.publicState().status, /join/);
  assert.match(left.model.chatLog.at(-1).text, /not sent/);
});

test("Provide refuses unavailable, waiting and AI-locked text without appending it", () => {
  const model = new ImitationModel();
  model.setSide("provide");
  model.reset();
  assert.equal(model.sendMessage("offline"), null);
  assert.equal(model.chatLog.some(({ text }) => text === "offline"), false);
  model.peerId = "guess";
  assert.equal(model.sendMessage("early"), null);
  assert.equal(model.chatLog.some(({ text }) => text === "early"), false);
  model.phase = "provide-ready";
  model.aiLocked = true;
  assert.equal(model.sendMessage("locked"), null);
  assert.equal(model.chatLog.some(({ text }) => text === "locked"), false);
  model.aiLocked = false;
  assert.equal(model.sendMessage("one response"), "one response");
  assert.equal(model.sendMessage("duplicate response"), null);
  model.destroy();
});

test("starting a manual invite releases the old BroadcastChannel pairing before opening", async (t) => {
  const fixture = manualFixture(t);
  const inviter = fixture.create("human");
  const peer = fixture.create("human");
  await flush();
  assert.equal(inviter.model.peerId, peer.model.matchId);
  await inviter.createManualInvite();
  await flush();
  assert.equal(inviter.model.peerId, null);
  assert.equal(peer.model.peerId, null);
  assert.equal(inviter.sendMessage("not connected yet"), null);
  assert.equal(inviter.model.chatLog.some(({ sender }) => sender === "You"), false);
});

test("controller rejects and preserves Provide submissions and prevents duplicate replies", async (t) => {
  const fixture = transportFixture(t);
  const provide = fixture.create("provide");
  assert.equal(provide.sendMessage("offline input"), null);
  const guess = fixture.create("guess");
  await flush();
  assert.equal(provide.sendMessage("early input"), null);
  guess.sendMessage("Question");
  await flush();
  provide.model.aiLocked = true;
  assert.equal(provide.sendMessage("locked input"), null);
  provide.model.aiLocked = false;
  assert.equal(provide.sendMessage("accepted input"), "accepted input");
  assert.equal(provide.sendMessage("duplicate input"), null);
  await flush();
  assert.equal(guess.model.mystery.text, "accepted input");
  assert.deepEqual(provide.model.chatLog.filter(({ sender }) => sender === "You").map(({ text }) => text), ["accepted input"]);
});

test("failed manual submissions return null and do not appear as sent", (t) => {
  const fixture = transportFixture(t);
  const provide = fixture.create("provide");
  const guess = fixture.create("guess");
  const [channel] = linkManualChannels(provide, guess);
  provide.model.phase = "provide-ready";
  channel.send = () => { throw new Error("send failed"); };
  assert.equal(provide.sendMessage("keep this input"), null);
  assert.equal(provide.model.chatLog.some(({ sender }) => sender === "You"), false);
});

test("a failed Guess round-start preserves the prompt and only removes the rejected transcript entry", async (t) => {
  const fixture = transportFixture(t);
  const guess = fixture.create("guess");
  const provide = fixture.create("provide");
  const [channel] = linkManualChannels(guess, provide);
  guess.sendMessage("same prompt");
  await flush();
  channel.send = () => { throw new Error("send failed"); };
  assert.equal(guess.sendMessage("same prompt"), null);
  assert.equal(guess.model.chatLog.filter(({ sender, text }) => sender === "You" && text === "same prompt").length, 1, "earlier identical prompts remain in the transcript");
});

test("Guess human-provider status remains playable without, during loading, or after a failed AI load", () => {
  const model = new ImitationModel();
  model.setSide("guess");
  model.reset();
  assert.match(model.chatLog.at(-1).text, /human provider.*AI fallback/);
  model.receive({ type: "hello", from: "provider", mode: "provide" });
  for (const loading of [false, true]) {
    model.modelLoading = loading;
    model.modelError = "AI unavailable";
    assert.match(model.publicState().status, /Human provider connected/);
    assert.doesNotMatch(model.publicState().status, /Download.*play/);
  }
  model.modelLoading = false;
  model.receive({ type: "bye", from: "provider" });
  assert.match(model.publicState().status, /AI fallback unavailable/);
  model.destroy();
});

for (const [inviterMode, joiningMode] of [["human", "human"], ["guess", "provide"], ["provide", "guess"]]) {
  test(`manual ${inviterMode} invite accepts a complementary ${joiningMode} answer`, async (t) => {
    const fixture = manualFixture(t);
    const inviter = fixture.create(inviterMode);
    const joining = fixture.create(joiningMode);
    const invite = await inviter.createManualInvite();
    const answer = await joining.acceptManualInvite(invite);
    assert.equal(await inviter.acceptManualAnswer(answer), true);
    assert.equal(inviter.manualRemoteId, joining.model.matchId);
    assert.equal(joining.manualRemoteId, inviter.model.matchId);
  });
}

test("manual invites and answers reject same-mode Guess/Provide, AI, missing modes and self-pairing", async (t) => {
  const fixture = manualFixture(t);
  const guess = fixture.create("guess");
  const provide = fixture.create("provide");
  const invite = await guess.createManualInvite();
  const original = JSON.parse(atob(invite));
  for (const mode of ["guess", "human", "ai", undefined]) {
    const code = btoa(JSON.stringify({ ...original, mode }));
    await assert.rejects(guess.acceptManualInvite(code));
    if (mode !== "guess") await assert.rejects(provide.acceptManualInvite(code));
  }
  await assert.rejects(guess.acceptManualInvite(invite));
  const answer = await provide.acceptManualInvite(invite);
  const answerSignal = JSON.parse(atob(answer));
  for (const mode of ["guess", "human", "ai", undefined]) await assert.rejects(guess.acceptManualAnswer(btoa(JSON.stringify({ ...answerSignal, mode }))));
  await assert.rejects(guess.acceptManualAnswer("not a code"));
});

test("broadcast handshake requires a complementary explicit mode and rejects AI-only pairing", () => {
  for (const side of ["human", "guess", "provide", "ai", "write"]) {
    const model = new ImitationModel();
    model.setSide(side);
    model.reset();
    model.receive({ type: "hello", from: "missing-mode" });
    assert.equal(model.peerId, null);
    if (["ai", "write"].includes(side)) {
      model.receive({ type: "hello", from: "human", mode: "human" });
      assert.equal(model.peerId, null);
    }
    model.destroy();
  }
});

// No real channel, network, or wall-clock sleeps. Each test owns its channels,
// lifecycle event source, and controllers, including every presence interval.
function transportFixture(t) {
  const originals = new Map(["BroadcastChannel", "addEventListener", "removeEventListener"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = new EventTarget();
  const channels = new Set();
  const controllers = [];
  class Channel {
    constructor(name) { this.name = name; this.closed = false; this.sent = []; channels.add(this); }
    postMessage(data) {
      assert.equal(this.closed, false, "a closed transport cannot send");
      this.sent.push(data);
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name) queueMicrotask(() => {
          if (!channel.closed) channel.onmessage?.({ data });
        });
      }
    }
    close() { this.closed = true; channels.delete(this); }
  }
  globalThis.BroadcastChannel = Channel;
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
  t.after(() => {
    controllers.forEach((controller) => controller.destroy());
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    events,
    create(side) {
      const controller = new ImitationController(new ImitationModel());
      controllers.push(controller);
      controller.model.setSide(side);
      controller.reset();
      return controller;
    },
    kill(controller) {
      // An unclean disappearance delivers no bye and runs no model cleanup.
      controller.channel.close();
      clearInterval(controller.heartbeatTimer);
      controller.heartbeatTimer = null;
      controller.channel = null;
    }
  };
}

test("Imitation public state keeps the stable mode when its display label is renamed", (t) => {
  const descriptor = IMITATION_MODES.find(({ value }) => value === "guess");
  const originalLabel = descriptor.label;
  t.after(() => { descriptor.label = originalLabel; });
  descriptor.label = "Who wrote this?";
  const model = new ImitationModel();
  model.setSide("guess");
  model.reset();
  const observedPhases = [];
  model.setStateListener(() => observedPhases.push(model.publicState().phase));
  const state = model.publicState();
  assert.equal(state.side, "Who wrote this?");
  assert.equal(state.mode, "guess");
  model.sendMessage("A question");
  model.receive({ type: "hello", from: "provider", mode: "provide" });
  model.receive({ type: "guess-response", from: "provider", text: "A human reply" });
  assert.equal(model.publicState().phase, "guess");
  assert.equal(observedPhases.at(-1), "guess", "notifications expose the final phase without waiting for a frame");
  assert.equal(model.chooseGuess("human"), true);
  assert.equal(observedPhases.at(-1), "result");
  model.destroy();
});

test("Imitation public state exports explicit provider flags, not display-label inference", () => {
  const model = new ImitationModel();
  model.reset();
  assert.equal(model.publicState().aiReady, false);
  assert.equal(model.publicState().modelLoading, false);
  assert.equal(typeof model.publicState().modelCached, "boolean");
  model.aiReady = true;
  model.modelLoading = true;
  model.modelCached = true;
  model.lastModelStatus = "Loading fixture";
  const state = model.publicState();
  assert.equal(state.aiReady, true);
  assert.equal(state.modelLoading, true);
  assert.equal(state.modelCached, true);
  assert.equal(state.modelStatus, "Loading fixture");
  model.destroy();
});

for (const side of ["provide", "guess"]) {
  for (const departure of ["bye", "timeout"]) {
    test(`Imitation ${side} releases and re-pairs after peer ${departure}`, async (t) => {
      const fixture = transportFixture(t);
      const otherSide = side === "provide" ? "guess" : "provide";
      const survivor = fixture.create(side);
      const leaving = fixture.create(otherSide);
      await flush();
      assert.equal(survivor.model.peerId, leaving.model.matchId);
      assert.equal(leaving.model.peerId, survivor.model.matchId);
      const guessing = side === "guess" ? survivor : leaving;
      const providing = side === "provide" ? survivor : leaving;
      guessing.sendMessage("The old prompt");
      await flush();
      providing.model.aiLocked = true;
      survivor.model.mystery = { source: "human", text: "The old mystery" };
      if (departure === "bye") leaving.handlePageHide();
      else {
        fixture.kill(leaving);
        survivor.update(PEER_LIVENESS_TIMEOUT + 0.1);
      }
      await flush();
      assert.equal(survivor.model.peerId, null);
      assert.equal(survivor.model.phase, `${side}-waiting`);
      assert.equal(survivor.model.prompt, null);
      assert.equal(survivor.model.mystery, null);
      assert.equal(survivor.model.aiLocked, false);
      assert.equal(survivor.heartbeatTimer, null);
      assert.ok(survivor.announceTimer, "discovery restarts on departure");
      if (side === "provide") assert.equal(survivor.model.publicState().status, "Waiting for a Guess player");

      const replacement = fixture.create(otherSide);
      await flush();
      assert.equal(survivor.model.peerId, replacement.model.matchId);
      assert.equal(replacement.model.peerId, survivor.model.matchId);
      const newGuess = side === "guess" ? survivor : replacement;
      const newProvide = side === "provide" ? survivor : replacement;
      newGuess.sendMessage("A replacement prompt");
      await flush();
      assert.equal(newProvide.model.prompt, "A replacement prompt");
      newProvide.sendMessage("The replacement reply");
      await flush();
      assert.equal(newGuess.model.mystery.text, "The replacement reply");
      assert.equal(newGuess.model.phase, "guess");
    });
  }
}

test("Imitation rejects an active third tab on both sides, including its hello acknowledgement", async (t) => {
  const fixture = transportFixture(t);
  const provide = fixture.create("provide");
  const guess = fixture.create("guess");
  await flush();
  const thirdGuess = fixture.create("guess");
  const thirdProvide = fixture.create("provide");
  await flush();
  assert.equal(provide.model.peerId, guess.model.matchId);
  assert.equal(guess.model.peerId, provide.model.matchId);
  // The third tabs can pair with one another, never with an occupied slot.
  assert.equal(thirdGuess.model.peerId, thirdProvide.model.matchId);
  assert.equal(thirdProvide.model.peerId, thirdGuess.model.matchId);
  assert.equal(provide.channel.sent.some((message) => message.type === "hello-ack" && message.to === thirdGuess.model.matchId), false);
  assert.equal(guess.channel.sent.some((message) => message.type === "hello-ack" && message.to === thirdProvide.model.matchId), false);
  guess.sendMessage("Still the real peer");
  await flush();
  assert.equal(provide.model.prompt, "Still the real peer");
});

test("Imitation heartbeats refresh both peers but an unrelated heartbeat cannot extend liveness", async (t) => {
  const fixture = transportFixture(t);
  const provide = fixture.create("provide");
  const guess = fixture.create("guess");
  await flush();
  for (let round = 0; round < 3; round += 1) {
    provide.update(PEER_LIVENESS_TIMEOUT - 0.1);
    guess.update(PEER_LIVENESS_TIMEOUT - 0.1);
    provide.heartbeat();
    guess.heartbeat();
    await flush();
    assert.equal(provide.model.peerAge, 0);
    assert.equal(guess.model.peerAge, 0);
  }
  for (const controller of [provide, guess]) {
    controller.update(PEER_LIVENESS_TIMEOUT - 0.1);
    controller.model.receive({ type: "heartbeat", from: "intruder" });
    assert.ok(controller.model.peerAge > 0, "only the negotiated peer refreshes the deadline");
  }
  assert.equal(provide.model.peerId, guess.model.matchId);
  assert.equal(guess.model.peerId, provide.model.matchId);
});

test("Imitation pagehide stops presence and pageshow restores a reused active controller exactly once", (t) => {
  const { create, events } = transportFixture(t);
  const controller = create("provide");
  controller.model.receive({ type: "hello", from: "guess-peer", mode: "guess" });
  const oldChannel = controller.channel;
  const score = controller.model.score = 17;
  events.dispatchEvent(new Event("pagehide"));
  assert.ok(oldChannel.sent.some(({ type, to }) => type === "bye" && to === "guess-peer"));
  assert.equal(oldChannel.closed, true);
  assert.equal(controller.channel, null);
  assert.equal(controller.announceTimer, null);
  assert.equal(controller.heartbeatTimer, null);
  assert.equal(controller.model.peerId, null);
  events.dispatchEvent(new Event("pageshow"));
  const restored = controller.channel;
  assert.ok(restored && restored !== oldChannel);
  assert.ok(controller.announceTimer);
  assert.equal(controller.model.score, score, "BFCache restoration preserves session state");
  events.dispatchEvent(new Event("pageshow"));
  assert.equal(controller.channel, restored, "duplicate pageshow does not create another transport");
  controller.destroy();
  events.dispatchEvent(new Event("pageshow"));
  assert.equal(controller.channel, null, "a game switched away from must not reopen on pageshow");

  // The cabinet caches and reuses the same facade/controller, so reset must
  // reinstall lifecycle listeners and callbacks that model.destroy cleared.
  controller.model.setSide("guess");
  controller.reset();
  const reused = controller.channel;
  controller.model.receive({ type: "hello", from: "provide-peer", mode: "provide" });
  controller.model.onAiChosen();
  controller.model.onRoundStart();
  assert.ok(reused.sent.some(({ type }) => type === "ai-writing"));
  assert.ok(reused.sent.some(({ type }) => type === "round-start"));
  events.dispatchEvent(new Event("pagehide"));
  assert.equal(reused.closed, true, "reset reattaches pagehide cleanup after destroy");
  assert.equal(controller.channel, null);
});

test("Imitation pageshow never starts a transport for AI-only modes", (t) => {
  const { create, events } = transportFixture(t);
  const controller = create("write");
  events.dispatchEvent(new Event("pagehide"));
  events.dispatchEvent(new Event("pageshow"));
  assert.equal(controller.channel, null);
  assert.equal(controller.announceTimer, null);
});
