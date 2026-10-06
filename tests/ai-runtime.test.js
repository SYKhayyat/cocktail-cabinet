import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBytes, verifyRuntime } from "../scripts/vendor-ai-runtime.mjs";
import { BROWSER_MODELS, WASM_URL, WASM_SHA256, configureRuntime, verifiedWasm } from "../src/ai/runtime-config.js";
import ortFactory from "../vendor/ai/ort-wasm-simd-threaded.jsep.mjs";

test("every vendored executable matches its reviewed SHA-256 release manifest", async () => {
  assert.equal(await verifyRuntime(), 22451778);
  const manifest = JSON.parse(await readFile(new URL("../vendor/ai/manifest.json", import.meta.url)));
  assert.equal(manifest.files.find(file => file.path.endsWith(".wasm")).sha256, WASM_SHA256);
  for (const file of manifest.files) assert.throws(() => verifyBytes(file, Buffer.from("tampered")), /integrity mismatch/);
});

test("verification refuses additional unreviewed executable assets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cocktail-ai-integrity-"));
  try {
    await writeFile(join(dir, "extra.js"), "export default 1;");
    await assert.rejects(verifyRuntime(pathToFileURL(`${dir}/`)), /Unreviewed executable/);
  } finally { await rm(dir, { recursive: true }); }
});

test("the actual browser runtime bundle executes with no external module imports", () => {
  const output = execFileSync(process.execPath, ["--experimental-vm-modules", new URL("./fixtures/ai-runtime-probe.mjs", import.meta.url).pathname], { encoding: "utf8" });
  assert.match(output, /executes without external module dependencies/);
});

test("vendored WASM verifies, instantiates and executes real ONNX runtime initialization", async () => {
  const wasm = await readFile(WASM_URL);
  const verified = await verifiedWasm(async url => {
    assert.equal(url.href, WASM_URL.href);
    return new Response(wasm);
  });
  const runtime = await ortFactory({ wasmBinary: verified, numThreads: 1 });
  assert.equal(runtime._OrtInit(1, 2), 0);
  assert.equal(typeof runtime._OrtCreateSession, "function");
  assert.ok(runtime.HEAPU8.length >= 16 * 1024 * 1024);
});

test("runtime integrity failures fail closed before compiling downloaded bytes", async () => {
  await assert.rejects(verifiedWasm(async () => new Response("not the runtime")), /integrity check failed/);
  await assert.rejects(verifiedWasm(async () => new Response("missing", { status: 404 })), /HTTP 404/);
});

test("worker configuration overrides executable CDN defaults and pins both model revisions", () => {
  const env = { backends: { onnx: { wasm: { wasmPaths: "https://cdn.example/", proxy: true, numThreads: 8 } } } };
  configureRuntime(env);
  assert.equal(new URL(env.backends.onnx.wasm.wasmPaths).pathname.endsWith("/vendor/ai/"), true);
  assert.equal(env.backends.onnx.wasm.proxy, false);
  assert.equal(env.backends.onnx.wasm.numThreads, 1);
  for (const model of Object.values(BROWSER_MODELS)) assert.match(model.revision, /^[a-f0-9]{40}$/);
  assert.equal(BROWSER_MODELS.webgpu.dtype, "q4f16");
  assert.equal(BROWSER_MODELS.wasm.dtype, "q4");
});

test("app AI modules import only local executable code and retain the cancellation boundary", async () => {
  for (const name of ["on-device.js", "wasm-worker.js", "runtime-config.js", "cancellation.js"]) {
    const source = await readFile(new URL(`../src/ai/${name}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)\s*["']([^"']+)["']/g)) assert.match(match[1], /^\.{1,2}\//);
  }
  const worker = await readFile(new URL("../src/ai/wasm-worker.js", import.meta.url), "utf8");
  assert.match(worker, /revision: model\.revision/);
  assert.match(worker, /await verifiedWasm\(\)/);
  const owner = await readFile(new URL("../src/ai/on-device.js", import.meta.url), "utf8");
  assert.match(owner, /worker\.terminate\(\)/);
});
