const WEBGPU_MODEL_ID = "onnx-community/Llama-3.2-1B-Instruct-q4f16";
const WASM_MODEL_ID = "onnx-community/Llama-3.2-1B-Instruct-ONNX";
const OLLAMA_MODEL = "llama3.2:1b";
const OLLAMA_BASE_URLS = ["http://127.0.0.1:11435", "http://localhost:11435", "http://127.0.0.1:11434", "http://localhost:11434"];
const MODEL_CACHE_KEY = "cocktail-cabinet-local-ai-ready-v5";

export function localModelSupport() {
  if (typeof window === "undefined") return { ok: false, device: "none", reason: "Local AI requires a browser." };
  if (navigator.gpu) return { ok: true, device: "webgpu", reason: "" };
  return { ok: true, device: "wasm", reason: "" };
}

let enginePromise = null;

export function hasCachedModel() {
  try {
    const value = localStorage.getItem(MODEL_CACHE_KEY);
    if (value === "ready") return true;
    const record = JSON.parse(value || "null");
    return record?.modelId === WEBGPU_MODEL_ID || record?.modelId === WASM_MODEL_ID;
  } catch { return false; }
}

export async function requestPersistentStorage() {
  try { await navigator.storage?.persist?.(); } catch { }
}

function markModelReady(modelId, device) {
  try { localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({ modelId, device, at: Date.now() })); } catch { }
}

async function fetchJson(url, options = {}, milliseconds = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Local runtime returned HTTP ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadChromeModel(onProgress) {
  const api = globalThis.LanguageModel;
  if (!api?.availability || !api.create) throw new Error("Chrome built-in AI is unavailable.");
  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };
  const availability = await api.availability(options);
  if (availability === "unavailable") throw new Error("Chrome built-in AI is unavailable on this device.");
  onProgress?.({ device: "chrome", progress: 0, text: availability === "available" ? "Connected to Chrome built-in AI." : "Downloading Chrome built-in AI…" });
  const session = await api.create({
    ...options,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => onProgress?.({ device: "chrome", progress: event.loaded, text: "Downloading Chrome built-in AI…" }));
    },
  });
  return {
    device: "chrome",
    chat: async ({ messages, format }) => {
      const response = await session.prompt(messages, format ? { responseConstraint: format } : undefined);
      return { choices: [{ message: { content: response } }] };
    },
  };
}

async function loadOllamaModel(onProgress) {
  const failures = [];
  for (const baseUrl of OLLAMA_BASE_URLS) {
    try {
      const tags = await fetchJson(`${baseUrl}/api/tags`);
      const installed = (tags.models || []).some((entry) => entry.name === OLLAMA_MODEL || entry.name === `${OLLAMA_MODEL}:latest`);
      if (!installed) continue;
      onProgress?.({ device: "ollama", progress: 1, text: "Connected to Ollama." });
      return {
        device: "ollama",
    chat: async ({ messages, temperature, max_tokens, format, tools }) => {
      const data = await fetchJson(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false, format, tools, options: { temperature, num_predict: max_tokens } }),
      }, 120000);
          return { choices: [{ message: { content: data.message?.content || "" } }] };
        },
      };
    } catch (error) {
      failures.push(`${baseUrl}: ${error.message}`);
    }
  }
  throw new Error(`Ollama unavailable (${failures.join("; ")})`);
}

export function loadLocalModel(onProgress) {
  if (!enginePromise) {
    void requestPersistentStorage();
    enginePromise = (async () => {
      try {
        return await loadChromeModel(onProgress);
      } catch { }
      let ollamaError = null;
      try {
        return await loadOllamaModel(onProgress);
      } catch (error) {
        ollamaError = error;
        onProgress?.({ device: "browser", progress: 0, text: "Ollama is unavailable; using the browser model…" });
      }
      try {
        const support = localModelSupport();
        if (!support.ok) throw new Error(support.reason);
        if (support.device === "webgpu") {
          try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) return await loadModelWorker("webgpu", onProgress);
          } catch { }
          onProgress?.({ device: "wasm", progress: 0, text: "WebGPU is unavailable; using the local fallback…" });
        }
        return await loadModelWorker("wasm", onProgress);
      } catch (error) {
        if (ollamaError) throw new Error(`Ollama unavailable: ${ollamaError.message}; browser fallback failed: ${error.message}`);
        throw error;
      }
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

function loadModelWorker(device, onProgress) {
  if (typeof Worker === "undefined") return Promise.reject(new Error("AI workers are unavailable in this browser."));
  const worker = new Worker(new URL("./wasm-worker.js", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const pending = new Map();
    let ready = false;
    let sequence = 0;
    const request = (payload) => new Promise((requestResolve, requestReject) => {
      const id = ++sequence;
      pending.set(id, { resolve: requestResolve, reject: requestReject });
      worker.postMessage({ ...payload, id });
    });
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === "progress") onProgress?.({ ...message, device });
      if (message.type === "error") {
        const error = new Error(message.error || "The local AI model failed.");
        for (const entry of pending.values()) entry.reject(error);
        pending.clear();
        if (!ready) reject(error);
        worker.terminate();
        return;
      }
      if (message.type === "ready") {
        ready = true;
         markModelReady(message.device === "webgpu" ? WEBGPU_MODEL_ID : WASM_MODEL_ID, device);
        resolve({ device, chat: (requestPayload) => request({ ...requestPayload, type: "generate" }) });
      }
      if (message.type === "response") {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        if (message.error) entry.reject(new Error(message.error));
        else entry.resolve({ choices: [{ message: { content: message.text } }] });
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "The local AI worker failed.");
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
      if (!ready) reject(error);
    };
    worker.postMessage({ type: "load", modelId: device === "webgpu" ? WEBGPU_MODEL_ID : WASM_MODEL_ID, device });
  });
}
