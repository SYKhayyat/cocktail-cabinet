// Run against a dedicated Chromium and static server, never the desktop app:
// CDP_URL=http://127.0.0.1:9321 COCKTAIL_URL=http://127.0.0.1:8768/ node tests/imitation-browser.mjs
import assert from "node:assert/strict";

const endpoint = process.env.CDP_URL || "http://127.0.0.1:9321";
const url = process.env.COCKTAIL_URL || "http://127.0.0.1:8768/";
const contexts = [];
const pages = [];
class Cdp {
  constructor(url) { this.socket = new WebSocket(url); this.sequence = 0; this.pending = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
    });
  }
  command(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
  close() { this.socket.close(); }
}
const game = "globalThis.__cocktailCabinet.games.get('imitation')";
async function waitFor(page, expression) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (await page.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}
async function openPage(browser, mode, contextId) {
  if (!contextId) {
    ({ browserContextId: contextId } = await browser.command("Target.createBrowserContext", { disposeOnDetach: true }));
    contexts.push(contextId);
  }
  const { targetId } = await browser.command("Target.createTarget", { url: "about:blank", browserContextId: contextId });
  const targets = await (await fetch(`${endpoint}/json/list`)).json();
  const page = new Cdp(targets.find(({ id }) => id === targetId).webSocketDebuggerUrl);
  await page.open();
  pages.push(page);
  await page.command("Page.enable");
  await page.command("Page.navigate", { url });
  await waitFor(page, "Boolean(globalThis.__cocktailCabinet)");
  await page.evaluate(`(() => {
    globalThis.__cocktailCabinet.loadGame('imitation');
    const select = document.querySelector('#sideSelect');
    select.value = ${JSON.stringify(mode)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  return { page, contextId };
}
async function submit(page, text) {
  return page.evaluate(`(() => {
    document.querySelector('#chatInput').value = ${JSON.stringify(text)};
    document.querySelector('#chatForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return { input: document.querySelector('#chatInput').value, sent: ${game}.chatLog.filter(({sender}) => sender === 'You').map(({text}) => text) };
  })()`);
}
async function assertNoModelPlayable(page) {
  const state = await page.evaluate(`({ aiReady: ${game}.publicState().aiReady, status: document.querySelector('#roundStatus').textContent })`);
  assert.equal(state.aiReady, false);
  assert.match(state.status, /Human provider connected/);
  assert.doesNotMatch(state.status, /Download.*play/);
}
async function manualPair(browser, firstMode, secondMode) {
  // Different browser contexts have separate BroadcastChannel partitions. All
  // gameplay below therefore crosses real RTCDataChannels rather than a stub.
  const { page: first } = await openPage(browser, firstMode);
  const { page: second } = await openPage(browser, secondMode);
  assert.equal(await first.evaluate(`${game}.model.peerId`), null);
  const invite = await first.evaluate(`${game}.createManualInvite()`);
  const answer = await second.evaluate(`${game}.acceptManualInvite(${JSON.stringify(invite)})`);
  await first.evaluate(`${game}.acceptManualAnswer(${JSON.stringify(answer)})`);
  for (const page of [first, second]) await waitFor(page, `${game}.controller.manualChannel?.readyState === 'open' && Boolean(${game}.model.peerId)`);
  return [first, second];
}
const version = await (await fetch(`${endpoint}/json/version`)).json();
assert.doesNotMatch(version["User-Agent"] || "", /Electron|omnirush/i, "use a dedicated browser, not the desktop app");
const browser = new Cdp(version.webSocketDebuggerUrl);
await browser.open();
try {
  const [left, right] = await manualPair(browser, "human", "human");
  assert.equal((await submit(left, "Hello 👋 שלום")).input, "");
  await waitFor(right, `${game}.chatLog.some(({ sender, text }) => sender === 'Partner' && text === 'Hello 👋 שלום')`);
  await left.evaluate("dispatchEvent(new Event('pagehide')); true");
  await waitFor(right, `!${game}.model.peerId`);
  assert.equal((await submit(right, "keep disconnected chat")).input, "keep disconnected chat");
  console.log("PASS real manual Human chat and disconnect");

  for (const firstMode of ["guess", "provide"]) {
    const [first, second] = await manualPair(browser, firstMode, firstMode === "guess" ? "provide" : "guess");
    const [guess, provide] = firstMode === "guess" ? [first, second] : [second, first];
    await assertNoModelPlayable(guess);
    assert.equal((await submit(provide, "keep waiting input")).input, "keep waiting input");
    assert.equal((await submit(guess, "What is your favourite meal?")).input, "");
    await waitFor(provide, `${game}.phase === 'provide-ready'`);
    await provide.evaluate(`${game}.model.aiLocked = true; true`);
    assert.equal((await submit(provide, "keep locked input")).input, "keep locked input");
    await provide.evaluate(`${game}.model.aiLocked = false; true`);
    assert.equal((await submit(provide, "Pasta with tomato sauce.")).input, "");
    await waitFor(guess, `${game}.phase === 'guess'`);
    assert.equal((await submit(provide, "keep duplicate input")).input, "keep duplicate input");
    const state = await guess.evaluate(`({ text: ${game}.model.mystery.text, enabled: [...document.querySelectorAll('[data-guess]')].every(button => !button.disabled) })`);
    assert.equal(state.text, "Pasta with tomato sauce.");
    assert.equal(state.enabled, true);
    await guess.evaluate("document.querySelector('[data-guess=human]').click(); true");
    assert.equal(await guess.evaluate(`${game}.model.guessStats.right`), 1);
    await provide.evaluate("dispatchEvent(new Event('pagehide')); true");
    await waitFor(guess, `!${game}.model.peerId`);
    assert.match(await guess.evaluate("document.querySelector('#roundStatus').textContent"), /Download/);
    console.log(`PASS real manual ${firstMode} invite, no-model round and preserved rejected input`);
  }

  const { page: guess, contextId } = await openPage(browser, "guess");
  const { page: provide } = await openPage(browser, "provide", contextId);
  await waitFor(guess, `Boolean(${game}.model.peerId)`);
  await assertNoModelPlayable(guess);
  await submit(guess, "Same browser question");
  await waitFor(provide, `${game}.phase === 'provide-ready'`);
  await submit(provide, "Same browser response");
  await waitFor(guess, `${game}.phase === 'guess'`);
  console.log("PASS BroadcastChannel Guess/Provide without an AI model");
} finally {
  for (const contextId of contexts) await browser.command("Target.disposeBrowserContext", { browserContextId: contextId });
  pages.forEach(page => page.close());
  browser.close();
}
