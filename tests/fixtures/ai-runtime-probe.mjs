// Execute the actual browser bundle (not a mock) in a browser-like realm with
// no Node process or module loader. Any external import fails the link step.
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule } from "node:vm";
import assert from "node:assert/strict";
const url = new URL("../../vendor/ai/transformers-3.0.2.min.js", import.meta.url);
const realm = createContext({ console, URL, TextEncoder, TextDecoder, Uint8Array, Float32Array, WebAssembly, setTimeout, clearTimeout, self: { constructor: { name: "DedicatedWorkerGlobalScope" } } });
const module = new SourceTextModule(await readFile(url, "utf8"), { context: realm, initializeImportMeta: meta => { meta.url = url.href; } });
await module.link(specifier => { throw new Error(`Unexpected executable import: ${specifier}`); });
await module.evaluate();
assert.equal(module.namespace.env.version, "3.0.2");
assert.equal(typeof module.namespace.pipeline, "function");
assert.equal(typeof module.namespace.env.backends.onnx.wasm, "object");
const tensor = new module.namespace.Tensor("float32", new Float32Array([2, 4, 6]), [3]);
assert.deepEqual(Array.from(tensor.data), [2, 4, 6]);
console.log("Browser runtime bundle executes without external module dependencies.");
