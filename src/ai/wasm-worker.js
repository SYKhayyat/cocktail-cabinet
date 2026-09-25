import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm";

env.allowLocalModels = false;
env.useBrowserCache = true;

let generator = null;

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      generator = await pipeline("text-generation", message.modelId, {
        device: "wasm",
        dtype: "q4",
        progress_callback: (report) => self.postMessage({ type: "progress", ...report }),
      });
      self.postMessage({ type: "ready", device: "wasm" });
      return;
    }
    if (message.type === "generate") {
      const output = await generator(message.messages, {
        max_new_tokens: message.max_tokens || 32,
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
