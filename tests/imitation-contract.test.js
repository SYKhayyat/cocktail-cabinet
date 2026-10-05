import test from "node:test";
import assert from "node:assert/strict";
import { ImitationModel, IMITATION_MODES, PEER_LIVENESS_TIMEOUT } from "../src/games/imitation/model.js";
import { ImitationController } from "../src/games/imitation/controller.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

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
