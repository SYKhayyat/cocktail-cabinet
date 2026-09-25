const WASM_MODEL_ID = "HuggingFaceTB/SmolLM2-360M-Instruct";
const MODEL_CACHE_KEY = "cocktail-cabinet-local-ai-ready-v3";

export function localModelSupport() {
  if (typeof window === "undefined") return { ok: false, device: "none", reason: "Local AI requires a browser." };
  return { ok: true, device: "wasm", reason: "" };
}

let enginePromise = null;

export function hasCachedModel() {
  try { return localStorage.getItem(MODEL_CACHE_KEY) === "ready"; } catch { return false; }
}

export async function requestPersistentStorage() {
  try { await navigator.storage?.persist?.(); } catch { }
}

function markModelReady() {
  try { localStorage.setItem(MODEL_CACHE_KEY, "ready"); } catch { }
}

export function loadLocalModel(onProgress) {
  if (!enginePromise) {
    void requestPersistentStorage();
    enginePromise = loadWasmModel(onProgress).catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

function loadWasmModel(onProgress) {
  if (typeof Worker === "undefined") return Promise.reject(new Error("WebAssembly workers are unavailable in this browser."));
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
      if (message.type === "progress") onProgress?.({ ...message, device: "wasm" });
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
        markModelReady();
        resolve({ device: "wasm", chat: (requestPayload) => request({ ...requestPayload, type: "generate" }) });
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
    worker.postMessage({ type: "load", modelId: WASM_MODEL_ID, device: "wasm" });
  });
}
