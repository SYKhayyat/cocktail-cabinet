# Cocktail Cabinet

A static, framework-free arcade cabinet with eight games. Every game gives you a
human side and a machine side, starts gently, and gets more active as the score
rises. There is no build step, no server code, and no API key.

**This file is the current source of truth** for controls, architecture,
testing, and deployment. Current supporting guides and verification evidence are
linked below; older design records are listed under [Historical documents](#historical-documents).

## Running it

```sh
npm install
npm test          # models, lifecycle, computer policies, player proxies
npm run check     # syntax, architecture, dead-code and README checks
npm run serve     # static server on http://localhost:4173
```

Requires Node.js 22 or newer. The repository root is the publish directory.

## Games and controls

Each game's controls are defined by its controller and rendered into the
"How to play" panel, so this table is a summary rather than the definition.
`src/games/<id>/controller.js` → `controlHint()` is authoritative.

| Game | Modes | Controls |
| --- | --- | --- |
| **Snake** | `snake` — Solo (steer); `apples` — Computer vs you (place apples) | Snake: Arrows or WASD to steer, Hold to steer toward the pointer. Apples: Click to place an apple |
| **Breakout** | `bottom` — Solo (bottom paddle); `blocks` — Computer vs you (drag blocks); `versus` — Versus (two paddles) | Bottom/Versus: Arrows, WASD, or Mouse to move your paddle. Blocks: Drag to move a block; Click to cycle its type |
| **Splat** | `climber` — Solo (steer); `race` — Race (two balls); `builder` — Builder (place columns) | Climber/Race: Arrows or WASD to drift and bounce; Click the upper/lower half to bounce. Builder: Click/Drag to place/select/move columns or gaps; Arrows to select a column/move its gap; Home/End first/last; A/D move column; Q/E resize gap; C/G tool; N/Delete add/remove column; PageUp/PageDown or Wheel to pan |
| **Asteroids** | `ship` — Solo (fly); `versus` — Versus (both ships); `rocks` — Rocks (send asteroids) | Ship/Versus: Arrows or WASD to turn/thrust; Mouse to aim; Space or Click to fire; Hold to aim, thrust and fire. Rocks: Click to send an asteroid; Drag to release it with velocity |
| **Missile Command** | `defender` — Defender (defend cities); `attacker` — Attacker (attack cities) | Defender: Arrows to choose a battery; Mouse to aim; Space or Click to launch. Attacker: Click to send an enemy missile toward the nearest city or battery; Drag to release it with velocity |
| **Imitation** | `ai` — Chat with AI; `human` — Chat with a player; `guess` — Guess; `provide` — Provide; `write` — Classify | Enter sends a message (AI/Human), prompt (Guess), response (Provide), or classification sample (Classify). Guess only: Click AI/Human after the mystery reply |
| **Starfall** | `runner` — Solo (runner); `stars` — Stars (send hazards) | Runner: Arrows, WASD, or Mouse to guide the runner. Stars: Click to send a star; Drag for sideways velocity; Double-click to send a gem; Hold to send gems |
| **Lamp** | `walk` — Solo (walk blind) | Arrows or WASD to walk blind; Space or Click to pulse the lamp; Hold to keep it lit |

In Missile Command, Left/Right selects which of the three batteries fires. Space
and clicking both launch an interceptor at the current crosshair; in Attacker
mode, clicking launches an enemy missile toward the nearest city or battery and dragging
releases a free-flight missile with the gesture's velocity.

### Lives

The **Lives** control sets the round maximum. Lowering it clamps the maximum and
every active owner's remaining lives immediately, without restoring spent lives;
raising it takes effect from the next game, so a
change can never hand you a free life mid-round. Breakout's `extraLife` brick
raises the cap permanently.

Missile Command has no retry-life budget: cities and batteries determine its
outcome, so its Lives controls are hidden. Earned duel lives stay with the pilot
who earned them while increasing the cabinet cap; they do not restore the other
pilot's spent lives.

Breakout retries preserve earned score difficulty on replacement balls; surviving
duel balls are not scaled twice. Starfall's human mode ramps through score 150,
then caps stars at 280px/s and spawning at one every .6s to retain a measurable
keyboard recovery window. Flipped computer tuning is unchanged.

## Architecture

One game per folder. No game file knows the other seven exist.

```
index.html          cabinet shell and controls
styles.css          all visual styling
src/engine.js       canvas, input collection, animation loop, host lifecycle
src/game-lifecycle.js facade capabilities, value-only round context, rewards/results
src/geometry.js     model-safe geometry
src/decisions.js    bounded computer-decision recording
src/rendering.js    canvas text helper
src/main.js         cabinet UI; swaps game modules in and out
src/games/<id>/     model.js (rules), controller.js (input), view.js (drawing), index.js (facade)
src/ai/on-device.js local-AI provider ladder: Chrome built-in AI → Ollama → WebGPU/WASM worker
tests/              model/contract tests, ai/ policies, player/ proxies, browser-smoke.mjs
scripts/            architecture, dead-code and README checks
```

The engine owns host lives, pause, the new-game countdown, and the end-of-round
overlay. Facades expose lifecycle capabilities; games own rules, scores and any
per-player life budget. Models receive value-only round context, never an engine
reference. Games expose `publicState()`; Imitation includes stable mode/provider
flags so display-label changes cannot alter controls. Switching games calls
`destroy()` on the outgoing controller, which releases channels and timers.

Mode values, labels, and settings bounds are declared once per game as
`<GAME>_MODES` and `<GAME>_SETTINGS` in the model, and the UI derives its
selectors, help text, and validation from them.

The shell has one focused polite announcement channel for lifecycle transitions,
results, connection/errors, and new incoming chat. Scores, route statistics and
download progress stay outside live regions. Existing chat rows are retained
instead of replaying the transcript on every reply. Native buttons keep their
Space/Enter behavior without also sending controls to the arcade game.

## AI

The machine opponents are local JavaScript controllers whose decisions are made
from current positions and collision state. They do not skip rounds, award
themselves points, or bypass collision checks.

Imitation is the exception: it loads a real local model. A static page cannot
hold an API key safely, because anything sent to a browser can be read by a
visitor. The provider ladder tries Chrome's built-in AI, then a local Ollama
server, then a WebGPU or WASM worker — no key at any tier. If no model is
available, Imitation says so rather than faking a reply.

The browser runtime and WASM are vendored, SHA-256 checked, and reconstructed
from integrity-locked npm archives; model downloads use immutable revisions.
See [the AI runtime dependency boundary](docs/ai-runtime.md) for provenance,
remaining large downloads, offline limitations, CSP requirements, and checks.

Imitation pairs tabs in one browser over `BroadcastChannel`, and separate
browsers via a manual WebRTC offer/answer that the players copy between
themselves. It remains a static page with no application server.
Same-browser peers send `bye` on `pagehide` and renew heartbeats. A silent peer
expires after 3.5 active simulation seconds, allowing re-pairing without letting
a third tab replace an active peer. BFCache restoration reopens discovery.

## Testing

| Command | What it covers |
| --- | --- |
| `npm test` | Model/host contracts, event accounting, seeded computer-policy bands/tuning, and independent bounded HUMAN-input experience proxies |
| `npm run check` | Syntax, architectural dependencies, dead code and README control descriptors |
| `npm run test:browser` | 27 CDP suites: all twenty-one modes, hints, lifecycle/input, low-frequency announcements, native keyboard and emulated touch editing, capped Builder workload, race ties, narrow layouts, provider fixtures, cross-tab protocol and isolation |
| `npm run test:imitation:browser` | Real RTCDataChannels in both invite directions, human chat, no-model Guess/Provide and cancellation; `CDP_PEER_URL` selects a second browser process |
| `npm run test:nonvisual-browser` | Accessibility tree and native keyboard flow in all twenty-one modes |
| `npm run test:canvas:browser` | Actual canvas text and full-size companions across 63 mode/viewport cases |
| `npm run test:ai-runtime:browser` | Vendored runtime/WASM execution under CSP and real download cancellation |
| `npm run test:browser:all` | All five browser runners; required in CI with the actual security headers |

Computer tuning is documented in [tests/ai/TUNING.md](tests/ai/TUNING.md), and
explicit event denominators/calibration in [tests/ai/ACCOUNTING.md](tests/ai/ACCOUNTING.md).
Player hypotheses, distributions, thresholds and manual-playtest limitations are
in [docs/player-experience.md](docs/player-experience.md). Run
`node tests/player/report.mjs` for reproducible player metrics. These automated
proxies do **not** establish subjective enjoyment or replace human playtesting.

The browser suite drives a seeded `Math.random` and a manual clock, so it is
deterministic rather than racing `requestAnimationFrame`: it cancels the queued
boot frame before installing its virtual clock. Each suite (or cross-tab group)
has a fresh browser context; owned contexts dispose on cleanup or runner detach.
Unrelated tabs are never closed. It skips cleanly when
no browser is listening on `CDP_URL`; CI sets `REQUIRE_BROWSER=1` so a missing
browser fails the build instead.

To run it locally:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 &
chromium --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9321 --user-data-dir=/tmp/opencode/smoke about:blank &
REQUIRE_BROWSER=1 npm run test:browser:all
```

## Deployment

Production is Cloudflare Pages with Git integration: production branch `main`,
build command `npm test && npm run check`, publish directory `.`, Node 22, headers
from `_headers`. Connect the repository once in the Cloudflare dashboard and
pushes to `main` deploy automatically. See [DEPLOYMENT.md](DEPLOYMENT.md) for the
local `wrangler pages dev` equivalent.

`.github/workflows/verify.yml` runs `npm test`, `npm run check`, and all five browser
runners on every push and pull request, with two dedicated Chromium processes.
To verify the deployment, run `node scripts/verify-security.mjs` and
`node scripts/verify-deployed-assets.mjs`. See [HANDOFF.md](HANDOFF.md) for the
issue-to-commit map, actual verification and remaining manual gates.

## Historical documents

These are kept for provenance. They describe earlier states of the project and
are **not** authoritative — where they disagree with this file or with the code,
this file and the code win.

| Document | Status |
| --- | --- |
| [WALKTHROUGH.org](WALKTHROUGH.org) | A file-by-file reading of the codebase, written before the mode/settings descriptors were centralized and before the browser suite was expanded. Still useful as an orientation to the per-game structure. |
| [PLAN.md](PLAN.md) | Current remediation plan for #61–#82, including post-deployment and manual acceptance gates; the original brief is in git history. |
| [REFERENCE_NOTES.md](REFERENCE_NOTES.md) | Gameplay research from 2026-09-24 and its source links. Its Missile Command row describes the controls as they are today. |
| [DELEGATION_LOG.md](DELEGATION_LOG.md) | Per-task record of past changes and how they were verified. Accumulates; each entry is accurate as of its date. |
| [issues.md](issues.md) | The 2026-09-25 gameplay audit that produced the GitHub issues tracked here. A point-in-time report, not a status list. |
## Nonvisual play

Every mode exposes actual game state as readable DOM text and lists. Arcade
games also offer optional **step-by-step assistance**: freeze time, read players,
hazards and named targets, then perform keyboard actions using the real rules.
This includes apple placement, brick/route editing and flipped attack modes.
Imitation uses native chat and guessing controls. See
[Nonvisual play](docs/NONVISUAL_PLAY.md) for controls, coverage and test limits.
