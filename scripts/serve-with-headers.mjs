// Local verification server for the repo's single Cloudflare /* header rule.
// Testing only: no deployment, account, global config or background scheduler.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);
const headers = (await readFile(resolve(root, "_headers"), "utf8")).split("\n")
  .filter((line) => /^\s+[^:]+: /.test(line)).map((line) => {
    const separator = line.indexOf(":");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  });
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".md": "text/plain", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  for (const [name, value] of headers) response.setHeader(name, value);
  response.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname.split("/").some((segment) => segment.startsWith("."))) { response.writeHead(403).end(); return; }
    const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const file = await stat(path);
    if (!file.isFile()) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", mime[extname(path)] || "application/octet-stream");
    response.setHeader("Content-Length", file.size);
    response.end(request.method === "HEAD" ? undefined : await readFile(path));
  } catch { response.writeHead(404).end(); }
});
const port = Number(process.env.PORT || 8880);
server.listen(port, "127.0.0.1", () => console.log(`Header-aware test server: http://127.0.0.1:${port}/`));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
