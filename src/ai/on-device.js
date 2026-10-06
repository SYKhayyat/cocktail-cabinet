import { abortable, abortError } from "./cancellation.js";
import { BROWSER_MODELS } from "./runtime-config.js";

const WEBGPU_MODEL_ID = BROWSER_MODELS.webgpu.id;
const WASM_MODEL_ID = BROWSER_MODELS.wasm.id;
const OLLAMA_MODEL = "llama3.2:1b";
const CHROME_MODEL_ID = "chrome-built-in";
const OLLAMA_BASE_URLS = ["http://127.0.0.1:11435", "http://localhost:11435", "http://127.0.0.1:11434", "http://localhost:11434"];
// Bumped to v6: the v5 key stored either a bare "ready" string or a record
// with no version field, neither of which can be checked against a model
// that could actually be loaded today.
const MODEL_CACHE_KEY = "cocktail-cabinet-local-ai-ready-v6";
const MODEL_CACHE_VERSION = 6;
const LEGACY_MODEL_CACHE_KEYS = ["cocktail-cabinet-local-ai-ready-v5"];
const SUPPORTED_DEVICES = ["chrome", "ollama", "webgpu", "wasm"];

export function localModelSupport() {
  if (typeof window === "undefined") return { ok: false, device: "none", reason: "Local AI requires a browser." };
  if (navigator.gpu) return { ok: true, device: "webgpu", reason: "" };
  return { ok: true, device: "wasm", reason: "" };
}

let engineLoad = null;
let engineValue = null;
const progressSubscribers = new Set();

function emitProgress(report) {
  for (const subscriber of progressSubscribers) {
    try { subscriber(report); } catch (error) { console.error("[local-ai] progress subscriber failed:", error); }
  }
}

function readCacheRecord() {
  let raw = null;
  try { raw = localStorage.getItem(MODEL_CACHE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    return record && typeof record === "object" ? record : null;
  } catch { return null; }
}

export function hasCachedModel() {
  const record = readCacheRecord();
  if (!record) return false;
  if (record.version !== MODEL_CACHE_VERSION) return false;
  const modelForDevice = { chrome: CHROME_MODEL_ID, ollama: OLLAMA_MODEL, webgpu: WEBGPU_MODEL_ID, wasm: WASM_MODEL_ID };
  if (!SUPPORTED_DEVICES.includes(record.device) || record.modelId !== modelForDevice[record.device]) return false;
  if (BROWSER_MODELS[record.device] && record.revision !== BROWSER_MODELS[record.device].revision) return false;
  return Number.isFinite(record.at) && record.at > 0;
}

export function cachedModelRecord() {
  return hasCachedModel() ? readCacheRecord() : null;
}

export async function requestPersistentStorage() {
  try { await navigator.storage?.persist?.(); } catch { }
}

function markModelReady(modelId, device) {
  try {
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({ version: MODEL_CACHE_VERSION, modelId, device, revision: BROWSER_MODELS[device]?.revision, at: Date.now() }));
    for (const key of LEGACY_MODEL_CACHE_KEYS) localStorage.removeItem(key);
  } catch { }
}

async function fetchJson(url, options = {}, milliseconds = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  const signal = options.signal;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Local runtime returned HTTP ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function loadChromeModel(signal) {
  const api = globalThis.LanguageModel;
  if (!api?.availability || !api.create) throw new Error("Chrome built-in AI is unavailable.");
  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };
  const availability = await abortable(api.availability(options), signal);
  if (availability === "unavailable") throw new Error("Chrome built-in AI is unavailable on this device.");
  emitProgress({ device: "chrome", progress: 0, text: availability === "available" ? "Connected to Chrome built-in AI." : "Downloading Chrome built-in AI…" });
  const session = await abortable(api.create({
    ...options,
    signal,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => { if (!signal?.aborted) emitProgress({ device: "chrome", progress: event.loaded, text: "Downloading Chrome built-in AI…" }); });
    },
  }).then((session) => {
    if (signal?.aborted) { session.destroy?.(); throw abortError(); }
    return session;
  }), signal);
  markModelReady(CHROME_MODEL_ID, "chrome");
  return {
    device: "chrome",
    chat: async ({ messages, format, signal }) => {
      if (signal?.aborted) throw abortError();
      const response = await abortable(session.prompt(messages, { ...(format ? { responseConstraint: format } : {}), signal }), signal);
      return { choices: [{ message: { content: response } }] };
    },
  };
}

async function loadOllamaModel(signal) {
  const failures = [];
  for (const baseUrl of OLLAMA_BASE_URLS) {
    try {
      const tags = await fetchJson(`${baseUrl}/api/tags`, { signal });
      const installed = (tags.models || []).some((entry) => entry.name === OLLAMA_MODEL || entry.name === `${OLLAMA_MODEL}:latest`);
      if (!installed) continue;
      emitProgress({ device: "ollama", progress: 1, text: "Connected to Ollama." });
      markModelReady(OLLAMA_MODEL, "ollama");
      return {
        device: "ollama",
        chat: async ({ messages, temperature, max_tokens, format, tools, signal }) => {
          const data = await fetchJson(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false, format, tools, options: { temperature, num_predict: max_tokens } }),
            signal,
          }, 120000);
          return { choices: [{ message: { content: data.message?.content || "" } }] };
        },
      };
    } catch (error) {
      if (signal?.aborted) throw abortError();
      failures.push(`${baseUrl}: ${error.message}`);
    }
  }
  throw new Error(`Ollama unavailable (${failures.join("; ")})`);
}

// Concurrent consumers share the model load but own their subscriptions and
// cancellation. Abort the expensive load only after the last consumer leaves.
export function loadLocalModel(onProgress, { signal } = {}) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (onProgress) progressSubscribers.add(onProgress);
  const unsubscribe = () => { progressSubscribers.delete(onProgress); };

  if (engineValue?.cancelled) {
    engineValue = null;
  }
  if (engineValue) {
    if (onProgress) queueMicrotask(() => { if (!signal?.aborted) onProgress({ device: engineValue.device, progress: 1, text: "The local AI model is ready." }); });
    return abortable(Promise.resolve(engineValue), signal).finally(unsubscribe);
  }
  if (!engineLoad || engineLoad.controller.signal.aborted) {
    const load = { controller: new AbortController(), consumers: new Set() };
    engineLoad = load;
    const loadSignal = load.controller.signal;
    void requestPersistentStorage();
    load.promise = (async () => {
      try {
        return await loadChromeModel(loadSignal);
      } catch (error) { if (loadSignal.aborted) throw error; }
      let ollamaError = null;
      try {
        return await loadOllamaModel(loadSignal);
      } catch (error) {
        if (loadSignal.aborted) throw error;
        ollamaError = error;
        emitProgress({ device: "browser", progress: 0, text: "Ollama is unavailable; using the browser model…" });
      }
      try {
        const support = localModelSupport();
        if (!support.ok) throw new Error(support.reason);
        if (support.device === "webgpu") {
          try {
            const adapter = await abortable(navigator.gpu.requestAdapter(), loadSignal);
            if (adapter) return await loadModelWorker("webgpu", loadSignal);
          } catch (error) { if (loadSignal.aborted) throw error; }
          emitProgress({ device: "wasm", progress: 0, text: "WebGPU is unavailable; using the local fallback…" });
        }
        return await loadModelWorker("wasm", loadSignal);
      } catch (error) {
        if (loadSignal.aborted) throw error;
        if (ollamaError) throw new Error(`Ollama unavailable: ${ollamaError.message}; browser fallback failed: ${error.message}`);
        throw error;
      }
    })().then((engine) => {
      if (loadSignal.aborted) { engine.cancel?.(); throw abortError(); }
      engineValue = engine;
      emitProgress({ device: engine.device, progress: 1, text: "The local AI model is ready." });
      return engine;
    }).catch((error) => {
      if (!loadSignal.aborted) emitProgress({ device: "none", progress: 0, text: error.message, failed: true });
      throw error;
    }).finally(() => { if (engineLoad === load) engineLoad = null; });
  }
  const load = engineLoad;
  const consumer = {};
  load.consumers.add(consumer);
  return abortable(load.promise, signal).finally(() => {
    unsubscribe();
    load.consumers.delete(consumer);
    if (!load.consumers.size && engineLoad === load) load.controller.abort();
  });
}

function loadModelWorker(device, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === "undefined") return Promise.reject(new Error("AI workers are unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const queue = [];
    let worker = null;
    let active = null;
    let workerReady = false;
    let resolved = false;
    let sequence = 0;
    const settle = (entry, error, reply) => {
      entry.signal?.removeEventListener("abort", entry.abort);
      if (error) entry.reject(error);
      else entry.resolve(reply);
    };
    const retireWorker = () => {
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      }
      worker = null;
      workerReady = false;
    };
    const cancel = (error = abortError()) => {
      if (!(error instanceof Error)) error = abortError();
      if (engine.cancelled) return;
      engine.cancelled = true;
      retireWorker();
      signal?.removeEventListener("abort", cancel);
      if (active) settle(active, error);
      active = null;
      for (const entry of queue.splice(0)) settle(entry, error);
      if (!resolved) reject(error);
    };
    const pump = () => {
      if (engine.cancelled || active || !queue.length) return;
      if (!worker) { startWorker(); return; }
      if (!workerReady) return;
      active = queue.shift();
      try { worker.postMessage({ ...active.payload, type: "generate", id: active.id }); } catch (error) {
        const entry = active;
        active = null;
        settle(entry, error);
        pump();
      }
    };
    const engine = { device, cancelled: false, cancel, chat: ({ signal: requestSignal, ...payload }) => {
      if (requestSignal?.aborted) return Promise.reject(abortError());
      if (engine.cancelled) return Promise.reject(new Error("The local AI worker is unavailable."));
      return new Promise((requestResolve, requestReject) => {
        const entry = { id: ++sequence, payload, signal: requestSignal, resolve: requestResolve, reject: requestReject };
        entry.abort = () => {
          const wasActive = active === entry;
          if (wasActive) {
            active = null;
            // Only this request has been sent to the pinned runtime. Stopping
            // its worker really stops compute; queued consumers survive and
            // resume on a fresh worker using the same integrity-locked loader.
            retireWorker();
          } else {
            const index = queue.indexOf(entry);
            if (index === -1) return;
            queue.splice(index, 1);
          }
          settle(entry, abortError());
          if (!queue.length && !active && !workerReady) cancel();
          else pump();
        };
        queue.push(entry);
        requestSignal?.addEventListener("abort", entry.abort, { once: true });
        pump();
      });
    } };
    const startWorker = () => {
      let current;
      try { current = new Worker(new URL("./wasm-worker.js", import.meta.url), { type: "module" }); } catch (error) { cancel(error); return; }
      worker = current;
      current.onmessage = (event) => {
        if (engine.cancelled || worker !== current) return;
        const message = event.data;
        if (message.type === "progress") emitProgress({ ...message, device });
        if (message.type === "error") { cancel(new Error(message.error || "The local AI model failed.")); return; }
        if (message.type === "ready") {
          workerReady = true;
          signal?.removeEventListener("abort", cancel);
          markModelReady(message.device === "webgpu" ? WEBGPU_MODEL_ID : WASM_MODEL_ID, device);
          resolved = true;
          resolve(engine);
          pump();
        }
        if (message.type === "response" && active?.id === message.id) {
          const entry = active;
          active = null;
          settle(entry, message.error ? new Error(message.error) : null, { choices: [{ message: { content: message.text } }] });
          pump();
        }
      };
      current.onerror = (event) => {
        if (worker === current) cancel(new Error(event.message || "The local AI worker failed."));
      };
      try { current.postMessage({ type: "load", modelId: device === "webgpu" ? WEBGPU_MODEL_ID : WASM_MODEL_ID, device }); } catch (error) { cancel(error); }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    startWorker();
  });
}
