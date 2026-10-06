// These commits are immutable model-data revisions, not executable CDN code.
export const BROWSER_MODELS = Object.freeze({
  webgpu: Object.freeze({ id: "onnx-community/Llama-3.2-1B-Instruct-q4f16", revision: "056c2877d2a38b1bbe39f10f145ad8cde5f1e24b", dtype: "q4f16" }),
  wasm: Object.freeze({ id: "onnx-community/Llama-3.2-1B-Instruct-ONNX", revision: "14007543b6dc92de88daf96a9aa85d2f95ace6ef", dtype: "q4" }),
});

export const WASM_SHA256 = "0f6fe5c40378504d1a25a77f766133464bb15705af23e01c994f185719fb080e";
export const WASM_URL = new URL("../../vendor/ai/ort-wasm-simd-threaded.jsep.wasm", import.meta.url);

export async function verifiedWasm(fetcher = fetch) {
  const response = await fetcher(WASM_URL);
  if (!response.ok) throw new Error(`Local AI runtime returned HTTP ${response.status}.`);
  const bytes = await response.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hex !== WASM_SHA256) throw new Error("Local AI runtime integrity check failed. Reload after the deployment is repaired.");
  return new Uint8Array(bytes);
}

export function configureRuntime(env) {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  // Never fall back to the upstream executable CDN, even on a cache miss.
  env.backends.onnx.wasm.wasmPaths = new URL("../../vendor/ai/", import.meta.url).href;
  env.backends.onnx.wasm.proxy = false;
  // One app-owned worker avoids blob/pthread workers and COOP/COEP requirements.
  env.backends.onnx.wasm.numThreads = 1;
}
