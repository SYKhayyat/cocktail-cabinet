import { env, pipeline, Tensor } from "../../vendor/ai/transformers-3.0.2.min.js";
import ortFactory from "../../vendor/ai/ort-wasm-simd-threaded.jsep.mjs";
import { configureRuntime, verifiedWasm } from "../../src/ai/runtime-config.js";
configureRuntime(env);
const binary = await verifiedWasm();
const runtime = await ortFactory({ wasmBinary: binary, numThreads: 1 });
self.postMessage({ version: env.version, pipeline: typeof pipeline, tensor: Array.from(new Tensor("float32", new Float32Array([2, 4]), [2]).data), initialized: runtime._OrtInit(1, 2), threads: env.backends.onnx.wasm.numThreads });
