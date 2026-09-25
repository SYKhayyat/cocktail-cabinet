const WEBGPU_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const WASM_MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";
const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm";

export function localModelSupport() {
  if (typeof window === "undefined") return { ok: false, device: "none", reason: "Local AI requires a browser." };
  if (navigator.gpu) return { ok: true, device: "webgpu", reason: "" };
  return { ok: true, device: "wasm", reason: "" };
}

let enginePromise = null;

export function loadLocalModel(onProgress) {
  if (!enginePromise) {
    enginePromise = (async () => {
      const support = localModelSupport();
      if (!support.ok) throw new Error(support.reason);
      if (support.device === "webgpu") {
        try {
          const adapter = await withTimeout(navigator.gpu.requestAdapter(), 4000, "WebGPU adapter unavailable");
          if (!adapter) return loadWasmModel(onProgress);
          const webllm = await import(WEBLLM_URL);
          const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
          const engine = await withTimeout(webllm.CreateWebWorkerMLCEngine(worker, WEBGPU_MODEL_ID, { initProgressCallback: (report) => onProgress?.({ ...report, device: "webgpu" }) }), 90000, "WebGPU model initialization timed out");
          let fallbackPromise;
          return { device: "webgpu", chat: async (request) => {
            try {
              return await engine.chat.completions.create(request);
            } catch {
              fallbackPromise ||= loadWasmModel(onProgress);
              return (await fallbackPromise).chat(request);
            }
          } };
        } catch {
          onProgress?.({ device: "wasm", progress: 0, text: "Switching to the lightweight local model…" });
        }
      }
      return loadWasmModel(onProgress);
    })().catch((error) => {
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
      if (message.type === "error" && !ready) {
        reject(new Error(message.error || "The local AI model failed to load."));
        worker.terminate();
        return;
      }
      if (message.type === "ready") {
        ready = true;
        resolve({ device: "wasm", chat: request });
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
      if (!ready) reject(new Error(event.message || "The local AI worker failed."));
    };
    worker.postMessage({ type: "load", modelId: WASM_MODEL_ID, device: "wasm" });
  });
}

function withTimeout(promise, milliseconds, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds))]);
}
