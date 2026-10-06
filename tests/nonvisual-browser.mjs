// Required real Chromium accessibility-tree + native keyboard coverage for #77.
// Uses an isolated incognito context in a dedicated browser, NEVER Electron.
import assert from "node:assert/strict";
const origin = process.env.CDP_URL || "http://127.0.0.1:9321";
if (new URL(origin).port === "9223") throw new Error("Refusing Electron debugging port 9223; use dedicated Chromium.");
const url = process.env.COCKTAIL_URL || "http://127.0.0.1:8777/";
class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.ws.addEventListener("open", resolve, { once: true }); this.ws.addEventListener("error", reject, { once: true }); });
    this.ws.addEventListener("message", ({ data }) => {
      const result = JSON.parse(data); const pending = this.pending.get(result.id);
      if (!pending) return;
      this.pending.delete(result.id); clearTimeout(pending.timer);
      if (result.error) pending.reject(Error(result.error.message)); else pending.resolve(result.result);
    });
  }
  command(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id; const timer = setTimeout(() => reject(Error(`CDP timeout: ${method}`)), 20000);
      this.pending.set(id, { resolve, reject, timer }); this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const data = await this.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (data.exceptionDetails) throw Error(data.exceptionDetails.exception?.description || data.exceptionDetails.text);
    return data.result.value;
  }
}
const version = await (await fetch(`${origin}/json/version`)).json();
assert.match(version.Browser, /Chrome|Chromium/);
const browser = new Cdp(version.webSocketDebuggerUrl);
await browser.open();
const { browserContextId } = await browser.command("Target.createBrowserContext", { disposeOnDetach: true });
let page;
let peerPage;
try {
  const { targetId } = await browser.command("Target.createTarget", { url: "about:blank", browserContextId });
  const target = (await (await fetch(`${origin}/json/list`)).json()).find((item) => item.id === targetId);
  page = new Cdp(target.webSocketDebuggerUrl); await page.open();
  await page.command("Page.enable"); await page.command("Runtime.enable"); await page.command("Accessibility.enable");
  await page.command("Network.enable"); await page.command("Network.setCacheDisabled", { cacheDisabled: true });
  await page.command("Page.navigate", { url: `${url}?nonvisual=${Date.now()}` });
  async function wait(expression) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (await page.evaluate(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error(`Wait timed out: ${expression}`);
  }
  await wait("!!globalThis.__cocktailCabinet && !!document.querySelector('#nonvisualMode').textContent");
  await page.evaluate("window.addEventListener('error', event => console.error('NONVISUAL ERROR', event.message)); window.__nonvisualErrors = []; window.addEventListener('error', event => __nonvisualErrors.push(event.message))");
  async function key(key, code = key, vk = { Enter: 13, Tab: 9, Home: 36, ArrowDown: 40, ArrowUp: 38, " ": 32 }[key] || 0) {
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  }
  async function focus(selector) { assert.equal(await page.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.focus(); return document.activeElement === element; })()`), true, `Focusable: ${selector}`); }
  async function button(selector) { await focus(selector); await key("Enter"); }
  async function choose(selector, value) {
    const index = await page.evaluate(`Array.from(document.querySelector(${JSON.stringify(selector)}).options).findIndex(item => item.value === ${JSON.stringify(value)})`);
    assert.ok(index >= 0, `Option ${value} available in ${selector}`);
    await focus(selector); await key("Home");
    for (let i = 0; i < index; i += 1) await key("ArrowDown");
    await key("Enter");
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).value`), value);
  }
  async function axText() {
    const { nodes } = await page.command("Accessibility.getFullAXTree");
    return nodes.filter((node) => !node.ignored).map((node) => `${node.role?.value}: ${node.name?.value || ""}`).join("\n");
  }
  async function assistance() {
    if (!await page.evaluate("__cocktailCabinet.engine.assistance")) { await focus("#nonvisualEnabled"); await key(" ", "Space"); }
    assert.equal(await page.evaluate("__cocktailCabinet.engine.assistance"), true);
  }
  async function execute(action, target = "") {
    await choose("#nonvisualAction", action);
    await choose("#nonvisualTarget", target);
    await button("#nonvisualPerform");
    assert.deepEqual(await page.evaluate("__nonvisualErrors"), [], "No page exceptions on keyboard action");
    return page.evaluate("document.querySelector('#nonvisualFeedback').textContent");
  }
  const catalogue = await page.evaluate("Array.from(__cocktailCabinet.games, ([id, game]) => ({id, modes: game.modes.filter(mode => mode.available !== false)}))");
  let modeCount = 0;
  for (const [card, game] of catalogue.entries()) {
    await button(`.game-card:nth-child(${card + 1})`);
    for (const mode of game.modes) {
      await choose("#sideSelect", mode.value);
      const text = await axText();
      assert.ok(text.includes(`heading: ${game.id === "missile" ? "Missile Command" : game.id[0].toUpperCase() + game.id.slice(1)}: ${mode.label}`), `${game.id}/${mode.value} mode-aware AX heading`);
      assert.ok(text.includes("Players and protected objects"));
      assert.ok(text.includes("Hazards and moving objects"));
      assert.ok(text.includes("Targets and editable objects"));
      assert.ok(text.includes("Refresh state"));
      assert.ok((await page.evaluate("document.querySelector('#nonvisualObjective').textContent")).length > 30);
      if (game.id !== "imitation") {
        await assistance();
        await button("#restartButton");
        const before = await page.evaluate("JSON.stringify(__cocktailCabinet.engine.game.model.publicState()) + JSON.stringify(document.querySelector('#nonvisualPlayers').textContent)");
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(await page.evaluate("JSON.stringify(__cocktailCabinet.engine.game.model.publicState()) + JSON.stringify(document.querySelector('#nonvisualPlayers').textContent)"), before, "No ambient advancement/semantic churn");
        assert.match(await execute("wait"), /performed/);
        assert.match(await axText(), /combobox: Game action/);
        assert.match(await axText(), /combobox: Named target/);
      } else {
        assert.equal(await page.evaluate("__cocktailCabinet.engine.assistance"), false, "Imitation timers are not frozen");
        assert.match(text, /textbox: Message/);
        await focus("#chatInput");
        await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
        await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
        const prompt = `Keyboard prompt for ${mode.value}`;
        await page.command("Input.insertText", { text: prompt });
        await key("Enter");
        const remaining = await page.evaluate("document.querySelector('#chatInput').value");
        if (remaining) {
          // Disconnected peer modes correctly refuse a submission (#65). The
          // preserved draft remains perceivable as the textbox's AX value, not
          // as a falsely delivered transcript row.
          assert.equal(remaining, prompt);
          const { nodes } = await page.command("Accessibility.getFullAXTree");
          assert.ok(nodes.some(node => !node.ignored && node.role?.value === "textbox" && node.name?.value === "Message" && node.value?.value === prompt));
        } else assert.ok((await axText()).includes(prompt), `Native ${mode.value} accepted prompt reaches transcript`);
        await button("#nonvisualRefresh");
      }
      modeCount += 1;
    }
  }
  async function load(id, side) {
    await button(`.game-card:nth-child(${catalogue.findIndex((game) => game.id === id) + 1})`);
    await choose("#sideSelect", side); await assistance(); await button("#restartButton");
  }
  // Native Tab reaches the assistance controls; no application-role trap.
  await load("snake", "snake");
  await focus("#nonvisualEnabled"); await key("Tab");
  assert.equal(await page.evaluate("document.activeElement.id"), "nonvisualRefresh");
  await key("Tab"); assert.equal(await page.evaluate("document.activeElement.id"), "nonvisualAction");
  const headY = await page.evaluate("__cocktailCabinet.engine.game.model.snake[0].y");
  assert.match(await execute("up"), /performed/);
  assert.equal(await page.evaluate("__cocktailCabinet.engine.game.model.snake[0].y"), headY - 1);
  await load("snake", "apples");
  await page.evaluate("document.querySelector('#nonvisualX').value = 1; document.querySelector('#nonvisualY').value = 1");
  await execute("apple"); assert.match(await axText(), /Apple: x 1, y 1/);
  await load("breakout", "blocks");
  await button("#pauseButton");
  // Fill the coordinate inputs with real keyboard typing, then edit while paused.
  for (const [selector, text] of [["#nonvisualX", "140"], ["#nonvisualY", "300"]]) {
    await focus(selector);
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await page.command("Input.insertText", { text });
  }
  assert.match(await execute("brick-move", "brick-0"), /updated/);
  assert.match(await axText(), /Brick 1: x 140, y 300/);
  await execute("brick-cycle", "brick-0"); assert.match(await axText(), /Brick 1:.*extraLife/);
  await load("splat", "builder");
  const column = await page.evaluate("__cocktailCabinet.engine.game.model.columns[0].id");
  const gap = await page.evaluate("__cocktailCabinet.engine.game.model.columns[0].gapHeight");
  await execute("gap-larger", `column-${column}`);
  assert.equal(await page.evaluate("__cocktailCabinet.engine.game.model.columns[0].gapHeight"), gap + 10);
  await execute("column-add", `column-${column}`);
  await execute("column-remove", `column-${column}`);
  await load("asteroids", "rocks");
  await page.evaluate("document.querySelector('#nonvisualX').value = 40; document.querySelector('#nonvisualY').value = 40");
  await execute("rock"); assert.match(await axText(), /Asteroid 1:/);
  await load("asteroids", "versus");
  await execute("aim-fire", "opponent"); assert.match(await axText(), /Bullet 1 \(human\)/);
  await load("missile", "defender");
  await execute("battery-left"); await execute("intercept");
  assert.match(await axText(), /Battery A:.*ammunition 9/);
  assert.match(await axText(), /Interceptor 1:/);
  await load("missile", "attacker");
  await execute("attack", "city-0");
  assert.equal(await page.evaluate("__cocktailCabinet.engine.game.model.enemyMissiles[0].targetObject.label"), "1");
  assert.match(await axText(), /Enemy missile 1:/);
  await load("starfall", "stars");
  await execute("star"); assert.match(await axText(), /Star 1:/);
  await choose("#nonvisualDuration", "0.5"); await execute("wait");
  await execute("gem"); assert.match(await axText(), /Gem/);
  await load("starfall", "runner");
  const runnerX = await page.evaluate("__cocktailCabinet.engine.game.model.runner.x");
  await execute("left"); assert.ok(await page.evaluate("__cocktailCabinet.engine.game.model.runner.x") < runnerX);
  // Terminal outcomes and life budgets are accessible, not just painted overlays.
  await load("missile", "attacker");
  await page.evaluate("__cocktailCabinet.engine.game.model.cities.forEach(city => city.alive = false)");
  await execute("wait"); assert.match(await axText(), /YOU WIN.*Score/);
  await load("snake", "snake");
  await page.evaluate("__cocktailCabinet.engine.game.model.snake[0].x = 39");
  await execute("right"); assert.match(await axText(), /Lives 2 of 3.*Wall hit/);
  // Default animation still advances on exit; snapshots remain on-demand.
  const frozen = await page.evaluate("__cocktailCabinet.engine.game.model.snake[0].x");
  await focus("#nonvisualEnabled"); await key(" ", "Space");
  await wait("__cocktailCabinet.engine.countdown <= 0");
  await wait(`__cocktailCabinet.engine.game.model.snake[0].x !== ${frozen}`);
  // Native chat/guess flows, using real same-origin two-tab transport. Only AI
  // output is a fixture; no network model download is needed for keyboard tests.
  async function imitation(side) {
    await button(".game-card:nth-child(6)"); await choose("#sideSelect", side);
  }
  async function send(text) {
    await focus("#chatInput"); await page.command("Input.insertText", { text }); await key("Enter");
  }
  await imitation("ai");
  await page.evaluate("__cocktailCabinet.engine.game.model.aiReady = true; __cocktailCabinet.engine.game.model.requestAi = async () => 'Keyboard AI reply'");
  await send("Keyboard AI question"); await wait("document.querySelector('#chatMessages').textContent.includes('Keyboard AI reply')");
  assert.match(await axText(), /Keyboard AI reply/);
  await imitation("write");
  await page.evaluate("__cocktailCabinet.engine.game.model.aiReady = true; __cocktailCabinet.engine.game.model.requestAi = async () => JSON.stringify({label:'HUMAN', reason:'Keyboard classification fixture'})");
  await send("Keyboard classification question"); await wait("document.querySelector('#chatMessages').textContent.includes('Keyboard classification fixture')");
  assert.match(await axText(), /HUMAN/);
  const { targetId: peerId } = await browser.command("Target.createTarget", { url: "about:blank", browserContextId });
  const peerTarget = (await (await fetch(`${origin}/json/list`)).json()).find((item) => item.id === peerId);
  peerPage = new Cdp(peerTarget.webSocketDebuggerUrl); await peerPage.open();
  await peerPage.command("Page.enable"); await peerPage.command("Runtime.enable"); await peerPage.command("Accessibility.enable");
  await peerPage.command("Page.navigate", { url: `${url}?nonvisual-peer=${Date.now()}` });
  const firstPage = page;
  page = peerPage; await wait("!!globalThis.__cocktailCabinet"); await imitation("human");
  page = firstPage; await imitation("human");
  await wait("!!__cocktailCabinet.engine.game.model.peerId");
  await send("Keyboard human chat payload");
  page = peerPage; await wait("document.querySelector('#chatMessages').textContent.includes('Keyboard human chat payload')");
  assert.match(await axText(), /Keyboard human chat payload/);
  await imitation("provide");
  page = firstPage; await imitation("guess");
   await page.evaluate("__cocktailCabinet.engine.game.model.aiReady = false");
  await wait("!!__cocktailCabinet.engine.game.model.peerId");
  await send("Keyboard guessing prompt");
  page = peerPage; await wait("document.querySelector('#chatMessages').textContent.includes('Keyboard guessing prompt')");
  await send("Keyboard mystery from human provider");
  page = firstPage; await wait("__cocktailCabinet.engine.game.model.phase === 'guess'");
  assert.match(await axText(), /Keyboard mystery from human provider/);
  await button('[data-guess="human"]'); await button("#nonvisualRefresh");
  assert.match(await axText(), /Correct.*HUMAN/);
  assert.match(await axText(), /Right 1/);
  await button("#guessRestart");
  assert.equal(await page.evaluate("__cocktailCabinet.engine.game.model.guessResult"), null);
  console.log(`nonvisual-browser: PASS ${modeCount} advertised modes in Chromium ${version.Browser}; real AX tree, native keyboard actions, setup, attack, targets, outcomes, freeze/resume; two-tab chat + human guess + fixture AI/classification.`);
} finally {
  await browser.command("Target.disposeBrowserContext", { browserContextId });
  page?.ws.close(); peerPage?.ws.close(); browser.ws.close();
}
