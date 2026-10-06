// Explicit post-deployment byte comparison; no hosting credentials needed.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const origin = new URL(process.env.COCKTAIL_URL || "https://games.siachshai.online/");
assert.equal(origin.protocol, "https:");
const root = new URL("../", import.meta.url);
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const files = execFileSync("git", ["ls-files", "-z", "index.html", "styles.css", "src", "vendor/ai"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const path of files) {
  const url = new URL(path, origin);
  url.searchParams.set("revision", revision);
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), cache: "no-store" });
  assert.equal(response.status, 200, `${path} must be served`);
  const actual = new Uint8Array(await response.arrayBuffer());
  const expected = await readFile(new URL(path, root));
  assert.equal(hash(actual), hash(expected), `${path} differs from checkout ${revision}`);
  if (path.endsWith(".wasm")) assert.match(response.headers.get("content-type"), /application\/wasm/, "WASM must use the executable MIME type");
}
console.log(`Verified ${files.length} deployed application/runtime assets byte-for-byte against ${revision}: ${origin.origin}`);
