// Real CSS-size checks for #78. Run against a dedicated Chromium (never the
// desktop app's debugging port). Missing browser/server fails, never skips.
import assert from "node:assert/strict";

const cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9321";
const pageUrl = process.env.COCKTAIL_URL || "http://127.0.0.1:8781/";

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
          engine.ready = true; engine.stopped = true;
          if (engine.game.model.id === 'missile') engine.game.model.bases[0].alive = false;
          globalThis.__drawnLabels = [];
          engine.frame(engine.lastTime + 16);
          const panel = document.querySelector('.canvas-text-companion');
          const canvas = document.querySelector('canvas');
          const bounds = canvas.getBoundingClientRect();
          const items = panel ? [...panel.querySelectorAll('li')] : [];
          const style = panel && getComputedStyle(panel);
          const pageWidth = document.documentElement.scrollWidth;
          const panelBounds = panel && panel.getBoundingClientRect();
          const wasHidden = panel?.hidden;
          if (panel) panel.hidden = true;
          const baselinePageWidth = document.documentElement.scrollWidth;
          if (panel) panel.hidden = wasHidden;
          return {
            screenHidden: document.querySelector('#screenFrame').hidden,
            visible: !!panel && !panel.hidden && panel.getBoundingClientRect().height > 0,
            labels: items.map(item => item.textContent),
            drawn: globalThis.__drawnLabels, scale: bounds.width / canvas.width,
            fontSize: style && parseFloat(style.fontSize),
            itemSizes: items.map(item => parseFloat(getComputedStyle(item).fontSize)),
            ariaHidden: panel && panel.getAttribute('aria-hidden'),
            wrapping: style && style.overflowWrap,
            pageWidth, baselinePageWidth,
            panelInViewport: !panel || wasHidden || (panelBounds.left >= 0 && panelBounds.right <= innerWidth + 1),
            fitsPanel: items.every(item => item.scrollWidth <= item.clientWidth + 1),
            panelCount: document.querySelectorAll('.canvas-text-companion').length
          };
        })()`);
        const name = `${id}/${mode}/${width}`;
        // #70 owns existing cabinet/builder-control overflow. Isolate this
        // companion's layout rather than silently crediting it with that fix.
        assert.ok(report.pageWidth <= report.baselinePageWidth, `${name}: companion introduces no page overflow`);
        assert.equal(report.panelInViewport, true, `${name}: companion fits viewport`);
        assert.ok(report.panelCount <= 1, `${name}: one reusable companion`);
        if (id === "imitation") {
          assert.equal(report.screenHidden, true, name);
          assert.equal(report.visible, false, `${name}: companion follows hidden canvas`);
        } else if (report.drawn.some(({ size }) => size * report.scale < 12)) {
          assert.equal(report.visible, true, `${name}: readable alternative is visible`);
          assert.ok(report.fontSize >= 14 && report.itemSizes.every(size => size >= 14), `${name}: real CSS text size >=14px`);
          assert.equal(report.ariaHidden, "true", name);
          assert.equal(report.wrapping, "anywhere", name);
          assert.equal(report.fitsPanel, true, `${name}: long strings wrap inside panel`);
          for (const { text } of report.drawn) {
            assert.ok(report.labels.some(label => label.includes(text)), `${name}: ${text} has full-size copy`);
          }
          assert.ok(report.labels.includes("READY"), `${name}: lifecycle overlay included`);
          if (id === "missile") assert.ok(report.labels.includes("Battery A: destroyed"), name);
        }
        cases++;
      }
    }
  }
  console.log(`Canvas rendering browser checks passed: ${cases} mode/viewport cases (800, 375, 320 CSS px).`);
} finally {
  if (browser && contextId) await browser.command("Target.disposeBrowserContext", { browserContextId: contextId });
  page?.close(); browser?.close();
}
