import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("browser runners and CI share dedicated endpoints and require the full verification matrix", () => {
  for (const path of ["browser-smoke.mjs", "imitation-browser.mjs", "nonvisual-browser.mjs", "canvas-rendering-browser.mjs", "ai-runtime-browser.mjs"]) {
    assert.match(read(`tests/${path}`), /process\.env\.CDP_URL \|\| "http:\/\/127\.0\.0\.1:9321"/, path);
  }
  for (const path of ["browser-smoke.mjs", "imitation-browser.mjs", "nonvisual-browser.mjs", "canvas-rendering-browser.mjs"]) {
    assert.match(read(`tests/${path}`), /process\.env\.COCKTAIL_URL \|\| "http:\/\/127\.0\.0\.1:8765\/"/, path);
  }
  const pkg = JSON.parse(read("package.json"));
  for (const name of ["test:browser", "test:imitation:browser", "test:nonvisual-browser", "test:canvas:browser", "test:ai-runtime:browser"]) assert.ok(pkg.scripts["test:browser:all"].includes(`npm run ${name}`));
  const ci = read(".github/workflows/verify.yml");
  assert.match(ci, /REQUIRE_BROWSER: "1"/);
  assert.match(ci, /CDP_PEER_URL: http:\/\/127\.0\.0\.1:9322/);
  assert.match(ci, /PORT=8765 node scripts\/serve-with-headers\.mjs/);
  assert.match(ci, /run: npm run test:browser:all/);
  assert.ok(!ci.includes("9223"), "CI must not conflict with the desktop endpoint");
});
