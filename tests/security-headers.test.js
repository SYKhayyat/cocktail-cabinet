import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const headers = readFileSync(new URL("../_headers", import.meta.url), "utf8");
const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1];
const directives = new Map(csp?.split(";").map((part) => {
  const [name, ...values] = part.trim().split(/\s+/);
  return [name, values];
}));

test("deployment restricts scripts, workers, framing and forms without breaking WASM", () => {
  assert.deepEqual(directives.get("default-src"), ["'self'"]);
  assert.deepEqual(directives.get("script-src"), ["'self'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(directives.get("worker-src"), ["'self'"]);
  assert.deepEqual(directives.get("style-src"), ["'self'"]);
  for (const name of ["object-src", "base-uri", "frame-ancestors"]) assert.deepEqual(directives.get(name), ["'none'"]);
  assert.deepEqual(directives.get("form-action"), ["'self'"]);
  assert.ok(!csp.includes("'unsafe-inline'") && !csp.includes("'unsafe-eval'") && !csp.includes("cdn.jsdelivr.net"));
});

test("network policy permits model data and only the supported HTTP Ollama loopback ports", () => {
  assert.deepEqual(directives.get("connect-src"), ["'self'", "https://huggingface.co", "https://*.hf.co", "http://127.0.0.1:11434", "http://127.0.0.1:11435", "http://localhost:11434", "http://localhost:11435"]);
  assert.ok(!directives.has("upgrade-insecure-requests"), "Ollama intentionally uses trustworthy HTTP loopback");
});

test("HSTS is limited to this game's host as authorized, not subdomains/preload", () => {
  assert.equal(headers.match(/Strict-Transport-Security: (.+)/)?.[1], "max-age=31536000");
  assert.ok(!headers.includes("includeSubDomains") && !headers.includes("preload"));
  assert.match(headers, /X-Content-Type-Options: nosniff/);
});
