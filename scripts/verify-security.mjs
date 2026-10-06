// Explicit deployed check: never confuse local _headers with served policies.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const origin = new URL(process.env.COCKTAIL_URL || "https://games.siachshai.online/");
assert.equal(origin.protocol, "https:", "deployed verification requires HTTPS");
const expected = new Map(readFileSync(new URL("../_headers", import.meta.url), "utf8").split("\n")
  .filter((line) => /^\s+[^:]+: /.test(line)).map((line) => {
    const separator = line.indexOf(":");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
const response = await fetch(origin, { method: "HEAD", signal: AbortSignal.timeout(20000), cache: "no-store" });
assert.equal(response.status, 200);
for (const [name, value] of expected) assert.equal(response.headers.get(name), value, `${name} does not match the deployed configuration`);
const insecure = new URL(origin);
insecure.protocol = "http:";
const redirect = await fetch(insecure, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(20000) });
assert.ok([301, 302, 307, 308].includes(redirect.status), "HTTP must redirect instead of serving the game");
assert.equal(new URL(redirect.headers.get("location"), insecure).href, origin.href);
console.log(`Verified deployed CSP, host-only HSTS, safety headers and HTTP redirect: ${origin.origin}`);
