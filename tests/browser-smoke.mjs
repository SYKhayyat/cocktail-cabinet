const pageUrl = process.env.COCKTAIL_URL || "http://127.0.0.1:8765/";
const cdpUrl = process.env.CDP_URL || "http://127.0.0.1:9223";
const required = process.env.REQUIRE_BROWSER === "1";

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result || {});
    });
  }
  command(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async evaluate(expression) {
    const result = await this.command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    return result.result?.value;
  }
  close() { this.socket.close(); }
}

async function targetFor(url) {
  const response = await fetch(`${cdpUrl}/json/new?${url}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not create browser target: ${response.status}`);
  return response.json();
}

async function waitFor(page, expression, description) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await page.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function openPage(url) {
  const target = await targetFor(url);
  const page = new Cdp(target.webSocketDebuggerUrl);
  await page.open();
  await page.command("Page.enable");
  await page.command("Runtime.enable");
  await page.command("Page.navigate", { url: `${url}${url.includes("?") ? "&" : "?"}cdp=${Date.now()}` });
  await waitFor(page, "document.readyState === 'complete' && document.querySelectorAll('.game-card').length === 7", "cabinet boot");
  return { target, page };
}

async function selectImitation(page) {
  await page.evaluate("(()=>{document.querySelectorAll('.game-card')[5].click(); const s=document.querySelector('#sideSelect'); s.value='human'; s.dispatchEvent(new Event('change',{bubbles:true})); return true})()");
}

async function closeTarget(id) {
  await fetch(`${cdpUrl}/json/close/${id}`);
}

async function main() {
  let first;
  let second;
  try {
    first = await openPage(pageUrl);
    const cardCount = await first.page.evaluate("document.querySelectorAll('.game-card').length");
    if (cardCount !== 7) throw new Error(`Expected seven game cards, found ${cardCount}`);
    for (let index = 0; index < 7; index += 1) {
      await first.page.evaluate(`document.querySelectorAll('.game-card')[${index}].click(); true`);
      const sideCount = await first.page.evaluate("document.querySelectorAll('#sideSelect option').length");
      if (!sideCount) throw new Error(`Game ${index + 1} has no side options`);
    }
    await selectImitation(first.page);
    const manualVisible = await first.page.evaluate("!document.querySelector('#manualConnect').hidden");
    if (!manualVisible) throw new Error("Separate-browser connection controls are hidden");
    second = await openPage(pageUrl);
    await selectImitation(second.page);
    await waitFor(first.page, "document.querySelector('#roundStatus')?.textContent === 'Two players are connected'", "first Imitation connection");
    await waitFor(second.page, "document.querySelector('#roundStatus')?.textContent === 'Two players are connected'", "second Imitation connection");
    await first.page.evaluate("(()=>{const input=document.querySelector('#chatInput'); input.value='CDP smoke message'; document.querySelector('#chatForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return true})()");
    const messageSelector = "[...document.querySelectorAll('#chatMessages p')].some((node) => node.textContent === 'CDP smoke message')";
    await waitFor(first.page, messageSelector, "first Imitation local message");
    await waitFor(second.page, messageSelector, "second Imitation remote message");
    console.log("CDP smoke passed: boot, seven games, side selectors, and two-tab Imitation messaging");
  } catch (error) {
    if (!required && (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"))) {
      console.log("CDP smoke skipped: start Chromium with --remote-debugging-port=9223 and a local static server");
      return;
    }
    throw error;
  } finally {
    first?.page.close();
    second?.page.close();
    if (first) await closeTarget(first.target.id);
    if (second) await closeTarget(second.target.id);
  }
}

await main();
