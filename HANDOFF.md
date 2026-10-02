# Audit handoff — 2026-10-02

## Stable checkpoint

The checkout is on `main`; the current audit fixes are in the working tree and should be committed before further work. The full Node suite passes **174/174**, `npm run check` passes, and the browser smoke suite previously passed 14 suites. Node is available in this environment at `/nix/store/px7gqzm666330dd9bi1xg8a25a11w3wx-nodejs-22.23.2/bin`; use it in `PATH` because `node`/`npm` are not symlinked into the default PATH.

## GitHub issues filed

- #42 Splat facade reports per-pilot lives outside race mode — fixed locally.
- #43 README test inventory — fixed locally.
- #44 expose computer difficulty tuning seams — **open/incomplete**; Snake was briefly started then reverted, no partial tuning should be assumed.
- #45 model-backed lifecycle properties on every facade — fixed locally.
- #46 validate Splat settings at the model boundary — fixed locally.
- #47 replace vacuous Splat `aiError` assertions — fixed locally with commitment/target assertions.
- #48 Asteroids versus rock losses through engine lifecycle — fixed locally and covered by an engine test.
- #49 prevent Imitation impostor handshakes replacing an active peer — fixed locally.
- #50 Splat Builder generic win overlay — fixed locally with `resultHeading()`.
- #51 make Splat commitment control actual steering — fixed locally and covered by a focused test.
- #52 persist Chrome/Ollama cache records — fixed locally with provider-path tests.
- #53 remove obsolete Asteroids state and strengthen metric lifecycle — **open/incomplete**.

Do not close #44 or #53 until their remaining work is implemented and tested. The fixed issues can be closed after the checkpoint commit is pushed.

## Main remaining work

1. Finish #44 by making each arcade model's AI policy instance-configurable (`aiTuning`) and add default/override tests; avoid editing module constants from Monte Carlo fixtures.
2. Finish #53 by removing dead Asteroids AI fields and deciding whether the Asteroids Monte Carlo harness should exercise the normal life/reset path instead of clearing `lifeLost` directly.
3. Review the broader MVC findings from the subagent: `main.js` still reaches into `engine.game.model` for Imitation provider state; `engine.js` still has a Snake-specific reset fallback; neutral geometry/decision/render helpers still live in `engine.js`. These are architectural follow-ups, not yet filed/fixed in this checkpoint.
4. After any further edits, run:
   ```sh
   cd /home/shaul/projects/cocktail-cabinet
   PATH=/nix/store/px7gqzm666330dd9bi1xg8a25a11w3wx-nodejs-22.23.2/bin:$PATH npm test
   PATH=/nix/store/px7gqzm666330dd9bi1xg8a25a11w3wx-nodejs-22.23.2/bin:$PATH npm run check
   PATH=/nix/store/px7gqzm666330dd9bi1xg8a25a11w3wx-nodejs-22.23.2/bin:$PATH npm run test:browser
   ```

## Architecture conclusion so far

The per-game `model.js` / `controller.js` / `view.js` / facade structure is broadly MVC. Models own rules and computer decisions; controllers translate host input; views draw. The important contract bugs found in this pass were facade lifecycle synchronization, Splat mode-specific lives, Splat settings validation, Splat puzzle result copy, Asteroids duel loss routing, Imitation peer admission, and provider cache metadata. The Monte Carlo tests are useful seeded band checks but need the pending tuning seam work before they can be used as a clean balance laboratory.
