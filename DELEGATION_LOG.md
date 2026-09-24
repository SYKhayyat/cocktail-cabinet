# Delegation log

## First draft

- **Requested:** Build the first readable Cocktail Cabinet draft.
- **Produced:** A framework-free static cabinet with seven game modules, shared engine, local machine opponents, two-tab Imitation mode, tests, and a Netlify config.
- **Verification:** `nix-shell -p nodejs --run "npm test"` passed 4 tests; `nix-shell -p nodejs --run "npm run check"` passed; every JavaScript file passed `node --check`; a local static server returned the HTML and main module successfully. Browser playtesting and Netlify deployment remain.
- **AI constraint:** This draft uses explainable local JavaScript opponents. No Claude or Anthropic API key is used. A static page cannot safely call Claude directly without exposing a key; any model-backed version needs instructor approval and a browser-safe design.
