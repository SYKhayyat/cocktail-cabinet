import test from "node:test";
import assert from "node:assert/strict";
import { classifyPolicyViolations } from "./csp-evidence.mjs";

const site = "https://games.siachshai.online/";
const beacon = { directive: "script-src-elem", disposition: "enforce", resource: "https://static.cloudflareinsights.com/beacon.min.js/v31edd6df95cf4e85" };
test("only an enforced optional production analytics block is expected CSP evidence", () => {
  assert.deepEqual(classifyPolicyViolations(site, [beacon]), { expected: [beacon], unexpected: [] });
  for (const violation of [
    { ...beacon, disposition: "report" },
    { ...beacon, directive: "connect-src" },
    { ...beacon, resource: "https://static.cloudflareinsights.com/other.js" },
    { ...beacon, resource: "https://static.cloudflareinsights.com.evil.example/beacon.min.js" },
    { ...beacon, resource: "inline" }
  ]) assert.deepEqual(classifyPolicyViolations(site, [violation]), { expected: [], unexpected: [violation] });
  for (const url of ["http://127.0.0.1:8880/", "https://another.example/"]) assert.equal(classifyPolicyViolations(url, [beacon]).unexpected.length, 1);
});
