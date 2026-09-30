# Deployment and local development

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