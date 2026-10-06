// The deployed site cannot reach a local Ollama server, and the automated suite
// cannot prove it either way because it serves from a loopback origin.
//
// Ollama answers only loopback origins by default, and the deployed origin is
// additionally blocked by Private Network Access, which requires an
// Access-Control-Allow-Private-Network header Ollama never emits. Setting
// OLLAMA_ORIGINS clears the CORS gate and still fails.
//
// So these tests do not attempt to prove connectivity. They assert the one thing
// that regresses silently: that the documentation keeps stating the real limit
// rather than quietly claiming a fix that does not work.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The constants are module-private; read them from source so the test tracks reality.
const source = readFileSync(new URL("../src/ai/on-device.js", import.meta.url), "utf8");
const OLLAMA_BASE_URLS = [...source.matchAll(/"(http:\/\/[^"]*1143\d)"/g)].map((m) => m[1]);
const OLLAMA_MODEL = source.match(/const OLLAMA_MODEL = "([^"]+)"/)?.[1];

const docs = readFileSync(new URL("../docs/ai-runtime.md", import.meta.url), "utf8");
const productionOrigin = "https://games.siachshai.online";

test("docs state that the deployed origin cannot reach Ollama at all", () => {
  assert.match(docs, /cannot work when it is served from/, "the loopback-only limit must be stated up front, not buried");
  assert.match(docs, /not a misconfiguration/, "it is a browser boundary, not a local setup error");
});

test("docs do not present OLLAMA_ORIGINS as a working fix", () => {
  assert.ok(docs.includes("OLLAMA_ORIGINS"), "the variable must still be discussed");
  assert.match(docs, /`OLLAMA_ORIGINS` alone is therefore \*\*not\*\* a fix/,
    "OLLAMA_ORIGINS must be explicitly marked as insufficient");
  // A reader must not find a copy-pasteable "fix" that does not work.
  assert.ok(!/systemctl edit ollama/.test(docs), "do not ship an operator step that provably changes nothing");
});

test("docs name the Private Network Access header Ollama never sends", () => {
  assert.match(docs, /Private Network Access/);
  assert.match(docs, /Access-Control-Allow-Private-Network/,
    "name the exact missing header so the limit is falsifiable rather than vague");
});

test("docs explain that no page can grant itself this access", () => {
  assert.match(docs, /No web page can grant itself this/,
    "the browser grants access, not the site; say so before anyone tries to work around it");
});

test("the production origin is named and is not a placeholder", () => {
  assert.ok(docs.includes(productionOrigin));
  assert.ok(!docs.includes("example.com"), "a placeholder origin would hide which host is affected");
});

test("documented endpoints are the ones the code actually calls", () => {
  for (const baseUrl of OLLAMA_BASE_URLS) assert.ok(docs.includes(baseUrl), `docs must document ${baseUrl}`);
  assert.ok(docs.includes(OLLAMA_MODEL), `docs must name the required model ${OLLAMA_MODEL}`);
});

test("docs warn that the local browser suite cannot detect this", () => {
  assert.match(docs, /cannot detect this|cannot detect a missing production origin/,
    "a future reader must know the green suite is not evidence of deployed connectivity");
});