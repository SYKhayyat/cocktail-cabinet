# Cocktail Cabinet — remediation plan

This is the current implementation plan for the 22 open audit issues, #61–#82.
It replaces the original design brief in this file; that brief remains available
in git history. The plan is deliberately ordered by user impact and dependency,
not by issue number.

## Outcome

Make the cabinet dependable before making it richer:

1. core games and multiplayer must not lose input, progress, messages, lives, or
   score;
2. every advertised mode must be playable, fair, and accurately explained;
3. the editor and game shell must work with keyboard and assistive technology;
4. the static deployment must have a controlled browser security and dependency
   boundary; and
5. each fix must have a regression test and must preserve the existing 304-model
   test, static-check, and 19-suite browser-smoke baseline.

## Working rules

- Work in the order below unless a production incident changes the priority.
- Keep fixes small and grouped by the dependency batches shown below. Do not mix
  unrelated redesign with a bug fix.
- For every issue, first add a failing model, DOM, browser, accessibility, or
  performance regression; then fix it; then run the smallest relevant check and
  the full checks before closing the issue.
- Do not close an issue on a plausibility argument. Verify the user-visible
  behavior, and for balance/performance claims record the workload, seed, and
  outcome in the test or its documentation.
- Re-check the live site after deployment. A passing local test does not prove
  that Cloudflare Pages has published the intended headers or assets.

## Ordered work

### Batch 0 — unblock the documented multiplayer path

These are the most integral failures because a documented separate-browser mode
currently reports success while either refusing a valid pairing or silently
dropping gameplay data.

| Order | Issue | Work and acceptance criteria |
| ---: | --- | --- |
| 1 | [#68](https://github.com/SYKhayyat/cocktail-cabinet/issues/68) | Centralize the expected peer-mode rules for Human↔Human and Guess↔Provide. Both offer and answer validation must accept only the complementary, valid mode; invalid pairings must still be rejected. Add both invite directions to the contract tests. |
| 2 | [#61](https://github.com/SYKhayyat/cocktail-cabinet/issues/61) | Serialize and validate WebRTC data-channel payloads without changing the BroadcastChannel object path. Prove that chat, Guess/Provide prompts and answers, and disconnect messages cross a real manual channel. The UI must report delivery failure rather than claiming a connection is usable. |
| 3 | [#65](https://github.com/SYKhayyat/cocktail-cabinet/issues/65) | Validate Provide availability before appending or clearing user text. Rejected disconnected, waiting, and locked submissions must not appear as sent, and the user must not lose rejected input. Test the controller/model/UI boundary. |
| 4 | [#76](https://github.com/SYKhayyat/cocktail-cabinet/issues/76) | Make Guess status distinguish “human provider connected” from “AI model unavailable.” A connected Provide peer must be visibly playable without a local model; AI fallback requirements remain explicit. Add a no-model Guess↔Provide browser assertion. |

**Exit gate:** same-browser pairing and a real separate-browser WebRTC exchange
both complete a chat round and a Guess/Provide round in both directions, with no
uncaught data-channel errors.

### Batch 1 — protect round state and control boundaries

These issues can corrupt or misrepresent a normal round even without multiplayer.
They should land before balance tuning so later measurements are meaningful.

| Order | Issue | Work and acceptance criteria |
| ---: | --- | --- |
| 5 | [#64](https://github.com/SYKhayyat/cocktail-cabinet/issues/64) | Clear held and newly pressed keyboard state when stopping, switching, restarting, hiding, or losing focus as appropriate. Preserve intentional same-round pause behavior. A key held during a switch must not control the next game without a new keydown. |
| 6 | [#62](https://github.com/SYKhayyat/cocktail-cabinet/issues/62) | Define one policy for lowering Lives during game-owned rounds, then make engine and model budgets agree. Either clamp every active owner immediately or explicitly defer the setting and tell the player. No mode may display a remaining count greater than its configured maximum. |
| 7 | [#63](https://github.com/SYKhayyat/cocktail-cabinet/issues/63) | Apply respawn grace symmetrically in Asteroids Versus, preferably with independent grace state if pilots can respawn independently. Test a hazard at each spawn both during and after grace. |
| 8 | [#82](https://github.com/SYKhayyat/cocktail-cabinet/issues/82) | Thread cancellation through local, remote, and worker-backed AI requests. Destroying Imitation or invalidating a round must abort expensive work, while stale-token checks remain as a second safeguard. Test cancellation and no post-destroy mutation. |

**Exit gate:** switching, restarting, visibility changes, life loss, and AI
invalidation leave no stale input, impossible life count, immediate respawn loss,
or continuing provider request.

### Batch 2 — make modes honest and mechanically fair

Fix the feedback and objective errors before subjective tuning. Then calibrate
the two modes whose current outcomes are demonstrably one-sided.

| Order | Issue | Work and acceptance criteria |
| ---: | --- | --- |
| 9 | [#66](https://github.com/SYKhayyat/cocktail-cabinet/issues/66) | Make control hints mode-aware and rerender them whenever the selected mode changes. Every hint must describe an action that has an effect in that mode; add representative browser assertions. |
| 10 | [#80](https://github.com/SYKhayyat/cocktail-cabinet/issues/80) | Define Missile Attacker scoring around the stated objective. Successful city/battery impacts must reward the player; interceptions must not masquerade as progress. Cover impact, interception, and win scoring. |
| 11 | [#81](https://github.com/SYKhayyat/cocktail-cabinet/issues/81) | Replace Snake’s “New round” terminal instruction with the actual cabinet action, or centralize lifecycle labels so this cannot drift. Add a terminal browser assertion. |
| 12 | [#72](https://github.com/SYKhayyat/cocktail-cabinet/issues/72) | Detect both Splat Race finishers before selecting a result. Resolve by crossing time or expose a tie; never give an exact simultaneous finish to the human solely because of branch order. |
| 13 | [#73](https://github.com/SYKhayyat/cocktail-cabinet/issues/73) | Recalibrate Breakout Versus against a documented bounded human-input policy. Preserve meaningful challenge while creating a repeatable human-win/comeback band. Record seeds, reaction/aim assumptions, and outcome distributions; do not optimize only for one scripted policy. |

**Exit gate:** scores reward the objective, terminal instructions are actionable,
ties are represented correctly, and seeded Versus probes show a challenging but
not effectively unwinnable mode.

### Batch 3 — make the Splat Builder safe and usable

Treat Builder as an editor, not merely another game mode. Preserve authored work
first, then provide navigation and input parity, then impose a tested workload
limit.

| Order | Issue | Work and acceptance criteria |
| ---: | --- | --- |
| 14 | [#71](https://github.com/SYKhayyat/cocktail-cabinet/issues/71) | Changing ready-screen Splat settings must preserve an authored route or present a clear destructive confirmation with a recovery path. Add a regression that edits a distinctive gap and changes spacing. |
| 15 | [#67](https://github.com/SYKhayyat/cocktail-cabinet/issues/67) | Implement a distinct empty-canvas pan gesture with sensible bounds, or remove the promise and provide explicit navigation. Panning must not accidentally add, resize, or move a column. |
| 16 | [#69](https://github.com/SYKhayyat/cocktail-cabinet/issues/69) | Add a complete keyboard editing path: select/navigate a column, move it, and adjust its gap/tool state without a pointer. Test the full authoring flow with pointer input absent. |
| 17 | [#75](https://github.com/SYKhayyat/cocktail-cabinet/issues/75) | Set and communicate a supported route limit, reject or explain additions beyond it, and avoid needless whole-array work where practical. Add a stress test at the limit and verify frame/update cost remains bounded. |

**Exit gate:** authored routes survive settings changes, can be reached and
edited with pointer or keyboard, documented panning works, and an intentional
large-input test cannot grow the editor without bound.

### Batch 4 — accessibility and inclusive presentation

Use the shell/status architecture established in the earlier batches. Do not
solve accessibility by making the entire animated machine a live region.

| Order | Issue | Work and acceptance criteria |
| ---: | --- | --- |
| 18 | [#70](https://github.com/SYKhayyat/cocktail-cabinet/issues/70) | Remove high-frequency score/canvas/control content from the live region. Create a focused status/announcement channel for meaningful lifecycle, result, connection, and error changes. Verify that score updates do not continuously announce. |
| 19 | [#77](https://github.com/SYKhayyat/cocktail-cabinet/issues/77) | Add a mode-aware accessible representation of objectives, relevant hazards/targets, player state, and meaningful outcomes. Keep canvas rendering, but make essential game state perceivable and operable without sight. Test the accessibility tree and keyboard flow. |
| 20 | [#78](https://github.com/SYKhayyat/cocktail-cabinet/issues/78) | Replace the failing small-text palette and verify actual canvas/background contrast at normal and narrow sizes. Add a repeatable contrast check so new view labels do not reintroduce the failure. |

**Exit gate:** keyboard-only users can operate every advertised control, screen
readers receive useful low-frequency state, and status text meets the intended
contrast standard.

### Batch 5 — secure and reproduce the browser delivery

These are deployment-level concerns and must be coordinated: the CSP cannot be
designed correctly until the AI dependency decision is made.

| Order | Issue | Work and acceptance criteria |
| ---: | --- | --- |
| 21 | [#74](https://github.com/SYKhayyat/cocktail-cabinet/issues/74) | Choose and document a reproducible AI dependency strategy: preferably vendor the reviewed runtime/assets, or provide an explicit pinned/integrity-controlled alternative. Preserve the intended local AI, Ollama, worker, and WebRTC behavior. |
| 22 | [#79](https://github.com/SYKhayyat/cocktail-cabinet/issues/79) | Add HSTS only after confirming the domain/subdomain policy, and add a restrictive CSP matching the final script, worker, model, loopback, and connection requirements. Verify headers on the live HTTPS site and verify HTTP redirects without weakening normal play. |

**Exit gate:** production headers and runtime dependencies are intentional,
reviewable, and tested in both local and deployed environments; no accidental
third-party executable dependency or first-visit HTTP exposure remains.

### Batch 6 — re-audit and close the loop

After all 22 issue rows are complete, re-run the complete audit: model tests,
static checks, browser smoke locally and against
`https://games.siachshai.online/`, player-experience probes, fuzzing,
accessibility checks, mobile/touch checks, performance stress, and real
separate-browser WebRTC. Update issue evidence with the actual commands and
results, then close only confirmed fixes.

## Cross-cutting verification matrix

The issue-specific regressions are necessary but not sufficient. Before the final
re-audit, run:

```sh
npm test
npm run check
REQUIRE_BROWSER=1 npm run test:browser
node tests/player/report.mjs
REQUIRE_BROWSER=1 COCKTAIL_URL=https://games.siachshai.online/ npm run test:browser
```

Also perform the checks that cannot be established by the current automated
suite:

- two genuinely separate browser/device sessions for WebRTC invite, chat, and
  Guess/Provide payloads;
- keyboard-only operation and screen-reader inspection at desktop and narrow
  mobile widths;
- touch gestures on a real device, including Builder pan/edit conflicts;
- a long Builder route stress run and browser performance/memory observation;
- AI model download, cancellation, fallback, and offline/error behavior; and
- live HTTPS/HSTS/CSP/header and asset-freshness checks after deployment.

## Prioritization summary

- **P0 — core correctness and documented connectivity:** #61, #62, #63, #64,
  #65, #68, #76, #82.
- **P1 — objective, fairness, and data-preserving UX:** #66, #71, #72, #73,
  #80, #81.
- **P1 — Builder usability/performance:** #67, #69, #75.
- **P1 — accessibility:** #70, #77, #78.
- **P1 — production security/reproducibility:** #74, #79.

The labels are priority bands, not permission to skip lower-level correctness:
all 22 issues remain in scope, and the final audit is required before calling
the cabinet “basically perfect.”
