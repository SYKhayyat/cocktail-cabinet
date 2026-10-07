// Real CSS-size checks for #78. Run against a dedicated Chromium (never the
// desktop app's debugging port). Missing browser/server fails, never skips.
import assert from "node:assert/strict";

const cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9321";
const pageUrl = process.env.COCKTAIL_URL || "http://127.0.0.1:8765/";

class Connection {
  constructor(url) { this.socket = new WebSocket(url); this.pending = new Map(); this.id = 0; }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const response = JSON.parse(data); const pending = this.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(response.id);
      if (response.error) pending.reject(new Error(response.error.message));
      else pending.resolve(response.result);
    });
  }
  command(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

let browser; let page; let contextId;
try {
  const version = await (await fetch(`${cdpUrl}/json/version`)).json();
  browser = new Connection(version.webSocketDebuggerUrl); await browser.open();
  ({ browserContextId: contextId } = await browser.command("Target.createBrowserContext", { disposeOnDetach: true }));
  const { targetId } = await browser.command("Target.createTarget", { url: "about:blank", browserContextId: contextId });
  const targets = await (await fetch(`${cdpUrl}/json/list`)).json();
  page = new Connection(targets.find(({ id }) => id === targetId).webSocketDebuggerUrl); await page.open();
  await page.command("Page.enable");
  await page.command("Network.enable");
  await page.command("Network.setCacheDisabled", { cacheDisabled: true });
  await page.command("Page.navigate", { url: pageUrl });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await page.evaluate("!!globalThis.__cocktailCabinet")) break;
    if (attempt === 199) throw new Error("Cabinet did not boot");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await page.evaluate(`(() => {
    const engine = globalThis.__cocktailCabinet.engine;
    cancelAnimationFrame(engine.animationFrame);
    requestAnimationFrame = () => 0;
    cancelAnimationFrame = () => {};
    globalThis.__drawnLabels = [];
    const context = engine.context;
    const original = context.fillText.bind(context);
    context.fillText = (text, ...args) => {
      globalThis.__drawnLabels.push({ text: String(text), size: Number(context.font.match(/([\\d.]+)px/)[1]), color: context.fillStyle });
      original(text, ...args);
    };
    return true;
  })()`);
  const games = await page.evaluate("[...globalThis.__cocktailCabinet.games].map(([id, game], index) => ({ id, index, modes: game.modes.map(({value}) => value) }))");
  let cases = 0;
  for (const width of [800, 375, 320]) {
    await page.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const { id, index, modes } of games) {
      for (const mode of modes) {
        const report = await page.evaluate(`(() => {
          document.querySelectorAll('.game-card')[${index}].click();
          const select = document.querySelector('#sideSelect');
          select.value = ${JSON.stringify(mode)};
          select.dispatchEvent(new Event('change', { bubbles: true }));
          const engine = globalThis.__cocktailCabinet.engine;
          // Only geometry the panel could have disturbed. Text below the board
          // legitimately changes height as the round state changes.
          const furniture = () => {
            const box = document.querySelector('canvas').getBoundingClientRect();
            return {
              left: Math.round(box.left), top: Math.round(box.top),
              width: Math.round(box.width), height: Math.round(box.height),
              afterScreen: document.querySelectorAll('#screenFrame ~ *').length,
              companion: document.querySelectorAll('.canvas-text-companion').length
            };
          };
          // Both postures, because the panel this guards against appeared and
          // disappeared *during* a round, not only on the ready screen.
          const poses = [];
          for (const running of [false, true]) {
            engine.ready = !running; engine.stopped = !running; engine.paused = false; engine.countdown = 0;
            const before = furniture();
            globalThis.__drawnLabels = [];
            for (let frame = 0; frame < 40; frame += 1) engine.frame(engine.lastTime + 16);
            poses.push({ running, before, after: furniture(), drawn: globalThis.__drawnLabels });
          }
          const canvas = document.querySelector('canvas').getBoundingClientRect();
          return {
            id: ${JSON.stringify(id)},
            mode: ${JSON.stringify(mode)},
            screenHidden: document.querySelector('#screenFrame').hidden,
            canvasRight: Math.round(canvas.right),
            poses
          };
        })()`);
        const name = `${report.id}/${report.mode}/${width}`;
        // #70 owns existing cabinet/builder-control overflow at 320px. Assert
        // only what this change owns: the board itself, and the page furniture
        // around it. Silently crediting #78 with #70's fix was the old mistake.
        assert.ok(report.canvasRight <= width + 1, `${name}: the board fits the ${width}px viewport`);
        for (const pose of report.poses) {
          assert.equal(pose.before.companion, 0, `${name}: no label panel before drawing (running=${pose.running})`);
          assert.equal(pose.after.companion, 0, `${name}: no label panel after 40 frames (running=${pose.running})`);
          // The panel rebuilt itself from whatever was drawn that frame, so its
          // height and contents changed constantly and the page moved with it.
          // Forty frames of play must now leave the page furniture identical.
          assert.deepEqual(pose.after, pose.before, `${name}: 40 frames add and resize no page furniture (running=${pose.running})`);
          assert.ok(pose.drawn.length > 0, `${name}: the board still paints its own labels (running=${pose.running})`);
          assert.ok(pose.drawn.every(({ size }) => size >= 7), `${name}: no label is drawn below the 7px floor`);
        }
        if (report.id === 'imitation') assert.equal(report.screenHidden, true, `${name}: the hidden board stays hidden`);
        cases++;
      }
    }
  }
  console.log(`Canvas rendering browser checks passed: ${cases} mode/viewport cases (800, 375, 320 CSS px).`);
} finally {
  if (browser && contextId) await browser.command("Target.disposeBrowserContext", { browserContextId: contextId });
  page?.close(); browser?.close();
}
