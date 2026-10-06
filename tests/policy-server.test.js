import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("header-aware verification server applies CSP and refuses private/traversal paths", { timeout: 10000 }, async (t) => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../scripts/serve-with-headers.mjs", import.meta.url))], { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "exit");
      child.kill("SIGTERM");
      await closed;
    }
  });
  const [ready] = await once(child.stdout, "data");
  const origin = ready.toString().match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
  assert.ok(origin, "ephemeral local server reports its actual port");
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const policy = readFileSync(new URL("../_headers", import.meta.url), "utf8").match(/Content-Security-Policy: (.+)/)[1];
  assert.equal(response.headers.get("content-security-policy"), policy);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  for (const path of [".git/config", ".opencode/config", "%5C.git/config"]) {
    assert.equal((await fetch(new URL(path, origin))).status, 403, `${path} must not expose private files`);
  }
  const module = await fetch(new URL("src/main.js", origin), { method: "HEAD" });
  assert.equal(module.status, 200);
  assert.match(module.headers.get("content-type"), /text\/javascript/);
  assert.equal(await module.text(), "");
  assert.equal((await fetch(new URL("missing.js", origin))).status, 404);
  assert.equal((await fetch(origin, { method: "POST" })).status, 405);
});
