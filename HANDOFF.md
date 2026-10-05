# Issue-fix handoff — 2026-10-05

All nine issues open at the start of this pass are implemented, tested, pushed
to `origin/main`, and closed. Overlapping #53/#58 share one event/lifecycle fix.
No dependencies, global settings, credentials or deployment accounts changed.

## Published checkpoints

Each issue checkpoint was tested from its **exact staged tree**, not only from
the integrated working directory, before commit/push/closure.

| Issues | Commit | Node tests | Required browser suites |
| --- | --- | ---: | ---: |
| #54 neutral utilities/rendering and architectural check | `526688e` | 177 | 14 |
| #53/#58 explicit outcomes, obsolete-state cleanup, complete loss/reset | `994926b` | 190 | 14 |
| #56 facade lifecycle, value-only context, no engine backreferences | `52a8cf0` | 199 | 14 |
| #44 isolated, reset-persistent computer tuning seams | `e678b6d` | 230 | 14 |
| #59 peer bye/heartbeat expiry, discovery and controller restoration | `071e218` | 241 | 14 |
| #55 stable public mode/provider state and UI fixtures | `6af4b79` | 243 | 16 |
| #60 fresh contexts, hostile leftovers and page lifecycle | `6d1a178` | 243 | 18 |
| #57 separate human-input player-experience baselines | `013c1da` | 279 | 18 |

`npm run check` passed at every checkpoint. Current local verification:
**279 Node tests**, architectural/static/README checks, and **18 browser suites**.
The deterministic player report also completed.

## Browser/CI follow-ups

- `31385d6`: repaired a pre-existing CI startup failure. The workflow now passes
  setup-chrome's `chrome-path` output into `CHROME_PATH` and checks readiness.
- `e429c35`: cancels the native animation frame queued at boot before replacing
  RAF/cancellation. Otherwise it could arrive after virtual ticks and corrupt
  `dt`/cooldowns. A per-page clock assertion reproduces the pre-fix failure and
  passes after cancellation. All 18 local browser suites passed after this fix.
- `8934d80`: isolates Asteroids duel loss fixtures from random reset rocks.
  Seed 278 reproduced an unrelated collision in a bullet-only scene; it is now
  retained as a regression seed with an inert distant rock and spawn/refill guards.
- GitHub verification for `8934d80` is **green**, including Node 22, all static
  checks and required browser smoke on stable Chrome:
  https://github.com/SYKhayyat/cocktail-cabinet/actions/runs/37301880519
- Every single-page suite and the cross-tab group use fresh CDP browser contexts.
  Contexts are disposed in cleanup and on runner detach; unrelated tabs are not
  modified. The hostile-leftover fixture lives in its own owned context.

## Reproduce locally

Resolve an available Node runtime rather than relying on a stale Nix store path:

```sh
NODE_BIN="$(ls -d /nix/store/*nodejs-24*/bin 2>/dev/null | head -1)"
export PATH="$NODE_BIN:$PATH"
node --version && npm --version
npm test
npm run check
node tests/player/report.mjs
REQUIRE_BROWSER=1 npm run test:browser
```

Node 24.20.0 and Chromium 152 were used locally. CI uses Node 22 and stable Chrome.
Browser smoke requires a static server on `127.0.0.1:8765` and Chromium CDP on
`127.0.0.1:9223`; see README for startup commands. `COCKTAIL_URL` and `CDP_URL`
override these endpoints. Always use `REQUIRE_BROWSER=1` for verification.

## Calibration and honest remaining limits

- `tests/ai/TUNING.md`: model defaults, units, override semantics and factor tests.
- `tests/ai/ACCOUNTING.md`: explicit categories, denominators and seeded bands.
- `docs/player-experience.md`: six independent bounded human-input policies,
  sampled distributions, sustained agency/recovery/clearance checks, censoring,
  threshold rationale and a manual playtest procedure. Proxies are not proof of fun.
- Breakout's existing retry path retains difficulty level 8 but creates an
  unscaled replacement ball; retry-assisted clearance is not same-pressure
  clearance. The player report documents this production limitation rather
  than masking it. Progressed Starfall's controlled recovery probe is only 0.2s.
- Manual human/device playtesting and a real separate-browser WebRTC exchange
  remain outside the automated verification; no such playtest is claimed.
