import { env, pipeline } from "../../vendor/ai/transformers-3.0.2.min.js";
import { BROWSER_MODELS, configureRuntime, verifiedWasm } from "./runtime-config.js";

configureRuntime(env);

let generator = null;

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      const model = BROWSER_MODELS[message.device];
      if (!model || message.modelId !== model.id) throw new Error("Unsupported local AI model.");
      env.backends.onnx.wasm.wasmBinary = await verifiedWasm();
      generator = await pipeline("text-generation", model.id, {
        device: message.device,
        revision: model.revision,
        dtype: model.dtype,
        progress_callback: (report) => self.postMessage({ type: "progress", ...report }),
      });
      self.postMessage({ type: "ready", device: message.device });
      return;
    }
    if (message.type === "generate") {
      const output = await generator(message.messages, {
        max_new_tokens: message.max_tokens || 96,
        do_sample: true,
        temperature: message.temperature || 0.7,
        top_p: 0.9,
        return_full_text: false,
      });
      const text = Array.isArray(output?.[0]?.generated_text) ? output[0].generated_text.at(-1)?.content : output?.[0]?.generated_text;
      const cleanText = String(text || "").replace(/^\s*(?:assistant|ai)\s*:\s*/i, "").trim();
      self.postMessage({ type: "response", id: message.id, text: cleanText });
    }
  } catch (error) {
    if (message.type === "load") self.postMessage({ type: "error", error: error.message || "The local AI model failed to load." });
    else self.postMessage({ type: "response", id: message.id, error: error.message || "The local AI request failed." });
  }
};
