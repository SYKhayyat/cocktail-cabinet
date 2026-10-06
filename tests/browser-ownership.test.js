import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("browser smoke refuses a desktop endpoint before any browser-control connection", { timeout: 10000 }, async () => {
  let upgrades = 0;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ "User-Agent": "Test Electron omnirush.ai", webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/must-not-connect` }));
  });
  server.on("upgrade", (_request, socket) => { upgrades++; socket.destroy(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let child;
  try {
    child = spawn(process.execPath, [fileURLToPath(new URL("./browser-smoke.mjs", import.meta.url))], {
      env: { ...process.env, CDP_URL: `http://127.0.0.1:${server.address().port}`, REQUIRE_BROWSER: "1" }, stdio: ["ignore", "pipe", "pipe"]
    });
    let error = "";
    child.stderr.on("data", chunk => { error += chunk; });
    const [code] = await once(child, "exit");
    assert.equal(code, 1);
    assert.match(error, /dedicated Chromium, not the desktop/);
    assert.equal(upgrades, 0, "never opens the desktop control WebSocket");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
