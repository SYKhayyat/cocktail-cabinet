import test from "node:test";
import assert from "node:assert/strict";
import { ImitationModel } from "../src/games/imitation/model.js";
import { ImitationController } from "../src/games/imitation/controller.js";
import { abortable, waitFor } from "../src/ai/cancellation.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
function globals(t) {
  const keys = ["window", "localStorage", "LanguageModel", "fetch", "Worker"];
  const saved = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  globalThis.window = {};
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  t.after(() => { for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
}
let moduleSequence = 0;
const freshProvider = () => import(`../src/ai/on-device.js?cancellation-test=${++moduleSequence}`);

test("abortable requests and artificial human delays settle immediately on cancellation", async () => {
  const controller = new AbortController();
  const request = abortable(new Promise(() => {}), controller.signal);
  const delay = waitFor(120000, controller.signal);
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  await assert.rejects(delay, { name: "AbortError" });
});

test("a shared model download aborts only when its last consumer leaves", async t => {
  globals(t);
  let loadSignal;
  let finish;
  globalThis.LanguageModel = {
    availability: async () => "downloadable",
    create: ({ signal }) => { loadSignal = signal; return new Promise(resolve => { finish = resolve; }); }
  };
  const { loadLocalModel } = await freshProvider();
  const first = new AbortController();
  const second = new AbortController();
  const firstProgress = [];
  const a = loadLocalModel(report => firstProgress.push(report), { signal: first.signal });
  const b = loadLocalModel(null, { signal: second.signal });
  await flush();
  first.abort();
  await assert.rejects(a, { name: "AbortError" });
  assert.equal(loadSignal.aborted, false, "the other consumer still needs the download");
  const reports = firstProgress.length;
  second.abort();
  await assert.rejects(b, { name: "AbortError" });
  await flush();
  assert.equal(loadSignal.aborted, true, "no consumer remains to own expensive work");
  let destroyed = false;
  finish({ destroy() { destroyed = true; } });
  await flush();
  assert.equal(destroyed, true, "a late-created session is disposed, not leaked");
  assert.equal(firstProgress.length, reports);
});

test("Chrome generation receives a per-request signal without retiring the shared model", async t => {
  globals(t);
  let promptSignal;
  globalThis.LanguageModel = {
    availability: async () => "available",
    create: async () => ({ prompt: (_, { signal }) => { promptSignal = signal; return new Promise(() => {}); } })
  };
  const { loadLocalModel } = await freshProvider();
  const engine = await loadLocalModel();
  const controller = new AbortController();
  const response = engine.chat({ messages: [], signal: controller.signal });
  controller.abort();
  await assert.rejects(response, { name: "AbortError" });
  assert.equal(promptSignal.aborted, true);
  assert.equal(await loadLocalModel(), engine);
});

test("Ollama generation forwards cancellation to fetch and does not probe alternate runtimes", async t => {
  globals(t);
  delete globalThis.LanguageModel;
  let fetchSignal;
  let calls = 0;
  globalThis.fetch = async (url, { signal }) => {
    calls += 1;
    if (url.endsWith("/api/tags")) return { ok: true, json: async () => ({ models: [{ name: "llama3.2:1b" }] }) };
    fetchSignal = signal;
    return abortable(new Promise(() => {}), signal);
  };
  const { loadLocalModel } = await freshProvider();
  const engine = await loadLocalModel();
  const controller = new AbortController();
  const response = engine.chat({ messages: [], signal: controller.signal });
  controller.abort();
  await assert.rejects(response, { name: "AbortError" });
  assert.equal(fetchSignal.aborted, true);
  assert.equal(calls, 2);
});

test("aborting Ollama discovery cancels its fetch rather than continuing fallback", async t => {
  globals(t);
  delete globalThis.LanguageModel;
  let fetchSignal;
  let calls = 0;
  globalThis.fetch = async (_, { signal }) => {
    calls += 1;
    fetchSignal = signal;
    return abortable(new Promise(() => {}), signal);
  };
  const { loadLocalModel } = await freshProvider();
  const controller = new AbortController();
  const result = loadLocalModel(null, { signal: controller.signal });
  await flush();
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  await flush();
  assert.equal(fetchSignal.aborted, true);
  assert.equal(calls, 1);
});

function workerFixture(t, ready = true) {
  globals(t);
  delete globalThis.LanguageModel;
  globalThis.fetch = async () => { throw new Error("No Ollama in fixture"); };
  const workers = [];
  globalThis.Worker = class {
    constructor() { workers.push(this); this.terminated = false; this.sent = []; }
    postMessage(message) {
      assert.equal(message.signal, undefined, "AbortSignals must not be structured-cloned into workers");
      this.sent.push(message);
      if (message.type === "load" && ready) queueMicrotask(() => this.onmessage({ data: { type: "ready", device: "wasm" } }));
    }
    terminate() { this.terminated = true; }
  };
  return workers;
}

test("worker generation cancellation terminates compute and the next request reloads", async t => {
  const workers = workerFixture(t);
  const { loadLocalModel } = await freshProvider();
  const engine = await loadLocalModel();
  const controller = new AbortController();
  const result = engine.chat({ messages: [], signal: controller.signal });
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(workers[0].terminated, true);
  assert.equal(engine.cancelled, true);
  assert.notEqual(await loadLocalModel(), engine);
  assert.equal(workers.length, 2);
});

test("cancellation during worker download terminates the loading worker", async t => {
  const workers = workerFixture(t, false);
  const { loadLocalModel } = await freshProvider();
  const controller = new AbortController();
  const result = loadLocalModel(null, { signal: controller.signal });
  await flush();
  assert.equal(workers.length, 1);
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  await flush();
  assert.equal(workers[0].terminated, true);
});

test("completed worker requests release cancellation listeners and worker errors invalidate the cache", async t => {
  const workers = workerFixture(t);
  const { loadLocalModel } = await freshProvider();
  const engine = await loadLocalModel();
  const controller = new AbortController();
  const result = engine.chat({ messages: [], signal: controller.signal });
  const message = workers[0].sent.at(-1);
  workers[0].onmessage({ data: { type: "response", id: message.id, text: "completed" } });
  assert.equal((await result).choices[0].message.content, "completed");
  controller.abort();
  assert.equal(workers[0].terminated, false, "a finished request cannot cancel a later use of the shared engine");
  workers[0].onerror({ message: "Worker crashed" });
  assert.equal(engine.cancelled, true);
  assert.notEqual(await loadLocalModel(), engine);
});

test("destroyed Imitation download cannot mutate model status or append a late readiness message", async t => {
  globals(t);
  let loadSignal;
  let finish;
  globalThis.LanguageModel = {
    availability: async () => "downloadable",
    create: ({ signal }) => { loadSignal = signal; return new Promise(resolve => { finish = resolve; }); }
  };
  const model = new ImitationModel();
  model.reset();
  const download = model.downloadModel();
  await flush();
  model.destroy();
  const snapshot = JSON.stringify(model.publicState());
  await download;
  await flush();
  assert.equal(loadSignal.aborted, true);
  finish({ destroy() {} });
  await flush();
  assert.equal(JSON.stringify(model.publicState()), snapshot);
});

test("destroy, reset, mode switch, round replacement and peer departure cancel AI without late mutation", async t => {
  globals(t);
  const requests = [];
  globalThis.LanguageModel = {
    availability: async () => "available",
    create: async () => ({ prompt: (_, { signal }) => new Promise(resolve => requests.push({ signal, resolve })) })
  };
  for (const [mode, invalidation] of [
    ["ai", model => model.destroy()],
    ["ai", model => model.reset()],
    ["write", model => model.setSide("human")],
    ["guess", model => model.startNextRound()],
    ["guess", model => model.sendMessage("Replacement prompt")],
    ["guess", model => model.dropPeer()],
    ["ai", model => {
      const controller = new ImitationController(model);
      controller.active = true;
      controller.handlePageHide();
    }]
  ]) {
    const model = new ImitationModel();
    model.setSide(mode);
    model.reset();
    model.aiReady = true;
    model.peerId = "provider";
    model.prompt = "Question";
    const response = mode === "guess" ? model.generateAiResponse() : mode === "write" ? model.classifyText("Sample") : model.askAi("Hello");
    await flush();
    const request = requests.at(-1);
    assert.ok(request);
    invalidation(model);
    const snapshot = JSON.stringify(model.publicState());
    const log = JSON.stringify(model.chatLog);
    assert.equal(request.signal.aborted, true);
    await response;
    request.resolve("A reply from the retired request");
    await flush();
    assert.equal(JSON.stringify(model.publicState()), snapshot);
    assert.equal(JSON.stringify(model.chatLog), log);
    model.destroy();
  }
});

test("disposed Imitation AI entry points cannot start work or change state", async t => {
  globals(t);
  globalThis.LanguageModel = { availability() { assert.fail("disposed models must not probe providers"); } };
  const model = new ImitationModel();
  model.setSide("guess");
  model.reset();
  model.aiReady = true;
  model.prompt = "Retired prompt";
  model.destroy();
  const snapshot = JSON.stringify(model.publicState());
  await Promise.all([model.prepareProvider(), model.downloadModel(), model.requestAi("text"), model.askAi("text"), model.classifyText("text"), model.generateAiResponse()]);
  model.startNextRound();
  model.restartGuess();
  assert.equal(JSON.stringify(model.publicState()), snapshot);
  assert.equal(model.activeAiRequests.size, 0);
});
