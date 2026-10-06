// Real Chromium + same-origin CSP executable-boundary check. No model download
// or generated reply is faked; large-model inference is a separate manual gate.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";

const cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9321";
const root = resolve(new URL("../", import.meta.url).pathname);
let delayed = false;
let downloadStarted = false;
let downloadClosed = false;
const server = createServer(async (req, res) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'");
  if (req.url === "/") { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><title>AI runtime boundary test</title>"); return; }
  if (delayed && req.url.endsWith(".wasm")) {
    downloadStarted = true;
    res.on("close", () => { downloadClosed = true; });
    return;
  }
  const path = resolve(root, `.${new URL(req.url, "http://localhost").pathname}`);
  if (!path.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm" })[extname(path)] || "application/octet-stream");
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.sequence = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    });
  }
  command(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
}

let browser, page, contextId;
try {
  const version = await (await fetch(`${cdpUrl}/json/version`)).json();
  assert.ok(!version["User-Agent"]?.includes("Electron"), "Use an isolated test Chromium, never OmniRush's desktop CDP port.");
  browser = new Cdp(version.webSocketDebuggerUrl); await browser.open();
  ({ browserContextId: contextId } = await browser.command("Target.createBrowserContext"));
  const { targetId } = await browser.command("Target.createTarget", { url: origin, browserContextId: contextId });
  let target;
  for (let n = 0; n < 50 && !target; n++) {
    target = (await (await fetch(`${cdpUrl}/json/list`)).json()).find(target => target.id === targetId);
    if (!target) await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(target, "new isolated browser target becomes discoverable");
  page = new Cdp(target.webSocketDebuggerUrl); await page.open();
  await page.command("Page.enable"); await page.command("Page.navigate", { url: origin });
  await page.evaluate("new Promise(resolve => document.readyState === 'complete' ? resolve() : addEventListener('load', resolve, {once:true}))");
  const probe = await page.evaluate(`new Promise((resolve,reject) => { const worker = new Worker('/tests/fixtures/ai-browser-worker.js',{type:'module'}); worker.onmessage = e => { worker.terminate(); resolve(e.data); }; worker.onerror = e => reject(new Error(e.message)); })`);
  assert.deepEqual(probe, { version: "3.0.2", pipeline: "function", tensor: [2, 4], initialized: 0, threads: 1 });
  const rejected = await page.evaluate(`new Promise((resolve,reject) => { const worker = new Worker('/src/ai/wasm-worker.js',{type:'module'}); worker.onmessage = e => { worker.terminate(); resolve(e.data); }; worker.onerror = e => reject(new Error(e.message)); worker.postMessage({type:'load',device:'wasm',modelId:'not-reviewed'}); })`);
  assert.deepEqual(rejected, { type: "error", error: "Unsupported local AI model." });
  delayed = true;
  await page.evaluate(`window.messages = []; window.loadingWorker = new Worker('/src/ai/wasm-worker.js',{type:'module'}); loadingWorker.onmessage = e => messages.push(e.data); loadingWorker.postMessage({type:'load',device:'wasm',modelId:'onnx-community/Llama-3.2-1B-Instruct-ONNX'});`);
  for (let n = 0; n < 100 && !downloadStarted; n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(downloadStarted, true, "real worker starts the local executable download");
  await page.evaluate("loadingWorker.terminate()");
  for (let n = 0; n < 100 && !downloadClosed; n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(downloadClosed, true, "termination cancels the real worker fetch");
  assert.deepEqual(await page.evaluate("messages"), [], "retired worker sends no late progress or readiness");
  console.log("PASS real Chromium: local runtime imports + WASM execution under restrictive CSP, unsupported model rejection, in-flight download cancellation.");
} finally {
  page?.socket.close();
  if (contextId) await browser.command("Target.disposeBrowserContext", { browserContextId: contextId });
  browser?.socket.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
