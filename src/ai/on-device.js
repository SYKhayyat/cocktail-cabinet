const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm";

export function localModelSupport() {
  if (typeof navigator !== "undefined" && navigator.gpu) return { ok: true, reason: "" };
  return { ok: false, reason: "WebGPU is unavailable; using the offline companion instead." };
}

let enginePromise = null;

export function loadLocalModel(onProgress) {
  const support = localModelSupport();
  if (!support.ok) return Promise.reject(new Error(support.reason));
  if (!enginePromise) {
    enginePromise = (async () => {
      const webllm = await import(WEBLLM_URL);
      const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      return webllm.CreateWebWorkerMLCEngine(worker, MODEL_ID, {
        initProgressCallback: (report) => onProgress?.(report),
      });
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}
