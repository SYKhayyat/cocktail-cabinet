# Deployment and local development

> This covers hosting and the local commands. For controls, architecture, and the
> full test story, see [README.md](README.md).

## Host

This is a static site with no build step. The repository root is the publish directory.

Production hosting is Cloudflare Pages using Git integration:

- Project name: `cocktail-cabinet`
- Production branch: `main`
- Build command: `npm test && npm run check`
- Publish directory: `.`
- Node version: `22`
- Headers: `_headers`

Connect the repository once in Cloudflare's Workers & Pages dashboard. Cloudflare then builds and deploys every push to `main` automatically. GitHub Actions runs the same test and syntax checks independently before the Cloudflare build starts.

After the first successful Cloudflare deployment, point the production domain at Cloudflare Pages. No Netlify configuration, tokens, or deploy job are needed.

## Local development

Install Node.js 22 or newer, then run:

```sh
npm install
npm test
npm run check
npm run serve
```

Open `http://localhost:4173` to play the site locally. The local server only serves files; it does not deploy anything.

To emulate Cloudflare Pages locally:

```sh
npx wrangler@3 pages dev .
```

`npm test`, `npm run check`, and `npm run serve` are the required local checks before pushing.

## Browser smoke suite

`npm run test:browser` drives the real page over the Chrome DevTools Protocol.
CI runs it in `verify.yml`, and locally it needs a browser and a static server:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 &
chromium --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9223 --user-data-dir=/tmp/smoke about:blank &
npm run test:browser
```

It skips cleanly when no browser is listening on `CDP_URL` (default port 9223);
set `REQUIRE_BROWSER=1` to make a missing browser a failure instead.

## Browser security policy

`_headers` limits executable JavaScript and module workers to this site's files.
WASM compilation is explicitly allowed, but arbitrary JavaScript evaluation,
inline scripts, framing, plugins, and foreign form submissions are not. The
vendored runtime, pinned model revisions, hashes and remaining trust boundaries
are documented in `docs/ai-runtime.md`. Hugging Face hosts are permitted only
for model **data**; the four documented Ollama loopback URLs remain usable.
`upgrade-insecure-requests` is deliberately absent because it would break local
HTTP Ollama servers. CSP does not replace Ollama CORS/local-network permissions.

The owner authorized the simplest HSTS policy: `max-age=31536000` for the game
host alone. There is **no** `includeSubDomains` or preload registration, and no
parent-domain changes. HTTPS visits teach browsers to use HTTPS for one year;
first-ever HTTP visits still depend on the hosting redirect. Do not claim this
provides preload protection before the first visit.

Cloudflare applies these policies on deployment; Python's ordinary static server
does not. After a push has deployed, verify the actual HTTPS headers and the HTTP
redirect with:

```sh
node scripts/verify-security.mjs
```

This check fails on stale or missing headers instead of treating checked-in
configuration as evidence of production behavior. Then run the required browser
suites with `COCKTAIL_URL=https://games.siachshai.online/` and a dedicated Chromium
CDP endpoint. Never use the desktop application's internal browser endpoint.

For repeatable local CSP checks, `node scripts/serve-with-headers.mjs` serves the
actual `_headers` rule at `http://127.0.0.1:8880/` (override with `PORT`). Set
`COCKTAIL_URL` to that URL when running browser tests. It is a test server only;
HSTS persistence itself must be verified over deployed HTTPS.
