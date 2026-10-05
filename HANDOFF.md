# Audit handoff — 2026-10-02

## Stable checkpoint

The checkout is on `main` at `76bf40f`, clean and synced with `origin/main`. (An earlier revision of this file said the fixes were uncommitted; that is stale — they are in `76bf40f`.) The full Node suite passes **174/174** and `npm run check` passes.

Node is **not** symlinked into the default PATH, so it must be added explicitly. The store path previously quoted here (`nodejs-22.23.2`) has since been garbage-collected and no longer exists. Resolve it at use time instead of trusting a hardcoded path:

```sh
NODE_BIN="$(ls -d /nix/store/*nodejs-24*/bin 2>/dev/null | head -1)"
export PATH="$NODE_BIN:$PATH"
node --version && npm --version
```

Last verified on 2026-10-05 with `nodejs-24.20.0`.

### Browser smoke suite

`npm run test:browser` needs Chromium listening on CDP at `127.0.0.1:9223` and a static server on `127.0.0.1:8765` (`npm run serve` uses 4173, so start `python3 -m http.server 8765 --bind 127.0.0.1` from the repo root instead). It exits 0 and skips when no browser answers, unless `REQUIRE_BROWSER=1`.

The suite is **not hermetic** — it shares whatever Chromium is on 9223. A run that dies mid-flight leaks live tabs that squat the Imitation peer slot and make every later run fail at `tests/browser-smoke.mjs:622` with "Timed out waiting for the provider receives the prompt". If you see that, list `curl -s http://127.0.0.1:9223/json/list` and close leftover `?smoke=` targets; do not go hunting in the game code. Tracked as #60, with the underlying product bug as #59. With no leaked tabs the suite passes 14/14.

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
- #54 separate model utilities and rendering from the host engine — **open**; the MVC boundary work.
- #55 render Imitation UI from public state, not model fields or display labels — **open**.
- #59 Imitation peer slot held forever when a partner tab closes without a clean reset — **open**; no `bye` on `pagehide` and no heartbeat, so `model.js:189` rejects every later handshake.
- #60 browser smoke suite is not hermetic and fails on tabs leaked by earlier runs — **open**; see "Browser smoke suite" above.

Do not close #44 or #53 until their remaining work is implemented and tested. The fixed issues can be closed after the checkpoint commit is pushed.

Note the overlaps before starting: **#56** (game-specific lifecycle branches / engine backreferences) and **#54** both target the `engine.js` coupling and are probably one refactor. **#58** (Monte Carlo event accounting) and **#53** both touch the Asteroids metric lifecycle. Cross-reference them so the work is not done twice.

## Main remaining work

1. Finish #44 by making each arcade model's AI policy instance-configurable (`aiTuning`) and add default/override tests; avoid editing module constants from Monte Carlo fixtures.
2. Finish #53 by removing dead Asteroids AI fields and deciding whether the Asteroids Monte Carlo harness should exercise the normal life/reset path instead of clearing `lifeLost` directly.
3. Review the broader MVC findings from the subagent: `main.js` still reaches into `engine.game.model` for Imitation provider state; `engine.js` still has a Snake-specific reset fallback; neutral geometry/decision/render helpers still live in `engine.js`. These are architectural follow-ups, not yet filed/fixed in this checkpoint.
4. After any further edits, run:
   ```sh
   cd /home/shaul/projects/cocktail-cabinet
   NODE_BIN="$(ls -d /nix/store/*nodejs-24*/bin 2>/dev/null | head -1)"
   export PATH="$NODE_BIN:$PATH"
   npm test
   npm run check
   REQUIRE_BROWSER=1 npm run test:browser   # see "Browser smoke suite" above; read its failure mode first
   ```

## Architecture conclusion so far

The per-game `model.js` / `controller.js` / `view.js` / facade structure is broadly MVC. Models own rules and computer decisions; controllers translate host input; views draw. The important contract bugs found in this pass were facade lifecycle synchronization, Splat mode-specific lives, Splat settings validation, Splat puzzle result copy, Asteroids duel loss routing, Imitation peer admission, and provider cache metadata. The Monte Carlo tests are useful seeded band checks but need the pending tuning seam work before they can be used as a clean balance laboratory.
