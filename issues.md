# Cocktail Cabinet issues log

**Test date:** 2026-09-25
**Scope:** All seven games, all exposed side modes where practical, MVC layers, progressive difficulty, fun/balance, and computer strength.
**Repository:** `cocktail-cabinet`

## How this was tested

This pass treated the project as MVC rather than testing only the rendered page:

- **Model:** Direct Node.js simulations against the six arcade models plus the Imitation model. I used deterministic random seeds, repeated runs, model score/progression probes, and stress inputs.
- **View:** A local static server plus Chromium 152 headless with the Chrome DevTools Protocol (CDP). I loaded the real page, selected every game card and every side selector, started and paused games, sent real keyboard and mouse events, and read the live title, status, score, lives, messages, canvas, and chat DOM.
- **Controller:** Exercised the real browser event path and the controller unit tests. The controller tests cover keyboard, mouse, pointer, click, drag, chat, and model-to-controller contracts.
- **Existing verification:** `npm test` passed all 74 tests. `npm run check` passed. No existing code was changed during this audit.

The browser was run at a desktop viewport with the canvas coordinate mapping checked before sending pointer events. The first CDP pass accidentally clicked the game-card sidebar when using unscaled canvas coordinates; that was a test-harness error, not a product finding, and was corrected before the recorded results.

## Executive assessment

| Game | Progressive difficulty | Fun / balance | Computer assessment |
|---|---|---|---|
| Snake | **Yes, but harsh at the floor** | Human mode is playable; apple-placement mode is mostly a greedy one-step chase. | Competent and generally fair in the seeded tests, but almost perfect by design. |
| Breakout | **No score ramp** | The normal wall is a valid challenge; the computer paddle is in a good range. | `blocks` mode is good; `versus` mode is too exact and has no visible reaction error. |
| Splat | **No difficulty ramp** | Builder mode is close to a good target. Race mode is currently too punishing. | Builder AI is good. Race AI fails almost every full route. |
| Asteroids | **Yes** | Human ship mode has a real ramp and clear escalation. | Rocks mode is competent but seed-sensitive; versus AI is very accurate. |
| Missile Command | **Yes, strongly** | Defender escalation is clear and readable. | Attacker-mode computer interception is aggressive and needs a human-skill baseline. |
| Imitation | **Not applicable** | Conversation/guessing is a mode, not an arcade difficulty curve. | Human-tab handshake is not reliable in the clean CDP run. AI response path was not fully downloaded/tested here. |
| Starfall | **Yes** | Runner mode has a good basic ramp; flipped mode is stressful but playable. | Runner AI is safe and predictable; the default runner label is inaccurate. |

## Model results

### Snake

- The model does progressively accelerate: `moveInterval()` is 0.18 seconds at score 0, 0.14 at 10, 0.10 at 20, and reaches the 0.08-second floor at score 25 and above (`src/games/snake/model.js:66`).
- In 200 seeded apple-placement runs of up to 12,000 updates, the computer ended every run, averaging 38.41 apples. The existing Monte Carlo test expects a 6:1–25:1 success-to-failure range and passes.
- The AI uses a greedy Manhattan route score, filters immediate wall/body collisions, and has a `0.0001` mistake chance (`src/games/snake/model.js:113-130`). It is good but has little lookahead. This is acceptable for a casual opponent, but it will feel robotic once the snake is long.
- **Finding:** The difficulty ramp is real, but the speed floor arrives quickly and the computer has almost no meaningful failure mode. Consider a short route-planning horizon and occasional safe-but-losing mistakes rather than a single-step mistake roll.

### Breakout

- There is no score-based difficulty ramp. The wall and special bricks are fixed; the `speed` brick changes ball velocity, but score does not make later rounds progressively harder (`src/games/breakout/model.js:84-100`, `src/games/breakout/model.js:263-285`).
- In 200 seeded `blocks` runs of 5,000 updates, the computer recorded 2,051 paddle hits and 207 misses: **9.91:1 hits to misses**. 168/200 runs eventually lost the ball. This is a plausible casual-opponent range and agrees with the existing 4:1–15:1 test band.
- The `bottom` side is labeled “You vs computer — bottom paddle” in the UI (`src/main.js:60-63`), but the model only moves the human paddle in that mode; the computer paddle is not active (`src/games/breakout/model.js:121-157`). This is misleading and means the default mode has no machine opponent.
- In `versus`, the computer predicts the most urgent rising ball and moves at 480 px/s with no reaction delay or target error (`src/games/breakout/model.js:104-119`). It is likely too good for a human who can line up a shot.
- **Findings:** Keep the `blocks` tuning. Add a real opponent or rename `bottom`; add bounded reaction/error to `versus`; add levels or a deliberate finite campaign if progressive difficulty is required.

### Splat

- Every normal run creates exactly 50 columns with 112-pixel gaps and configurable 90–240 pixel spacing (`src/games/splat/model.js:64-69`, `src/games/splat/model.js:36-39`). There is no score ramp: the route is finite but does not get harder as the score rises.
- In 200 seeded builder runs of 4,000 updates, the computer won 177 and failed 23: **7.7:1**, a good casual range and consistent with the existing 4:1–14:1 test band.
- The `race` mode assigns an 8% forced mistake every time the computer passes a column (`src/games/splat/model.js:176-185`). Over a 50-column route, that is approximately a **98.5% chance of at least one forced failure** before considering ordinary steering errors.
- A mirrored-AI stress run, where the human ball was driven with the same computer state to isolate the policy, produced 197 computer failures in 200 full-route attempts, with only 3 wins and an average of 12.7 columns passed before failure. This is too hard and not fun as a race opponent.
- The `climber` side is labeled “You vs computer — steer the ball,” but `computerPlayer` is only created in `race` (`src/games/splat/model.js:40-50`, `src/main.js:63`). The default climber mode has no computer opponent.
- **Findings:** Reduce race mistakes to a small, non-per-column chance or use occasional bounded steering errors with recovery. Add a real opponent to climber or rename it. Add a real late-route difficulty ramp if the mode is meant to become progressively harder.

### Asteroids

- This is the clearest progressive arcade ramp. Spawn interval falls from 1.3 seconds at score 0 to 0.7 at 50 and the 0.25 floor at 100; human firing raises the asteroid-speed multiplier from 1.0 to 1.6 at 50 and caps at 1.8 (`src/games/asteroids/model.js:101-105`, `src/games/asteroids/model.js:159-160`).
- The model starts three asteroids, adds rocks over time in ship/versus modes, splits larger rocks, and increases pressure. The `rocks` side starts empty so the user controls the threat (`src/games/asteroids/model.js:13-37`).
- The versus computer targets the nearest rock, has a short reaction delay, and uses a 1.1–1.4 second fire interval (`src/games/asteroids/model.js:68-99`, `src/games/asteroids/model.js:147-153`). Its versus steering is much more exact than the casual rock-placement policy.
- The rocks-mode computer has a binary periodic mistake state: every 8–14 seconds it gets a 20% chance to fail if a rock is within 72 pixels (`src/games/asteroids/model.js:133-137`). This is less natural than a small aim/steering error and can feel unfair when it activates at a bad moment.
- The `ship` side is labeled “You vs computer — fly the ship,” but only the human ship exists in that mode (`src/main.js:64`, `src/games/asteroids/model.js:138-143`). The default mode is human versus the asteroid field, not human versus a computer ship.
- **Findings:** Keep the ramp. Add a real versus opponent to `ship` or correct the label. Replace the periodic binary rocks-mode mistake with bounded aiming/steering error and make it depend on proximity and recovery state.

### Missile Command

- The defender model has the strongest and clearest level curve. Level 1 launches 16 enemies at 1.42-second intervals with speed 86; level 6 launches 36 at 1.02-second intervals with speed 126. Smart missiles begin at level 2 and split missiles at level 3 (`src/games/missile/model.js:73-77`, `src/games/missile/model.js:115-124`, `src/games/missile/model.js:243-250`).
- The progression also adds aircraft at level 1+ and increases scoring multipliers, so the player receives visible reasons to keep playing.
- In a 200-run attacker-mode stress test with one user missile per second, the computer destroyed all three batteries in 68 runs and survived 132. This is not yet a balanced human-skill baseline because the test intentionally supplies a steady stream of attacks, but it shows the machine interceptor can be oppressive.
- The computer interceptor chooses the first active enemy, leads it, adds 55/40-pixel error, and launches on a 0.45–0.70-second cycle (`src/games/missile/model.js:96-105`, `src/games/missile/model.js:131-140`). The fixed first-target policy is predictable.
- **Findings:** Defender difficulty is good. Attacker mode needs a human-play baseline and likely a slower cadence or occasional empty launch windows. Prefer target prioritization by threat rather than always using `enemyMissiles[0]`.

### Imitation

- There is no progressive difficulty curve. The modes are AI chat, two-tab human chat, guess AI/human, provide a guessing message, and classify text (`src/games/imitation/model.js:8-21`, `src/main.js:66`).
- The local AI path depends on a model download/runtime and was not fully exercised in this pass. The UI correctly exposes the download action and the model state.
- **Real CDP finding:** In a clean two-target Chromium run, the second tab reached “Two tabs or windows are connected” and received `hello clean`, while the first remained “Open another tab or window to join” and did not render its own sent message. The existing two-page unit test uses a fake `BroadcastChannel`; it verifies protocol calls but not a real browser handshake or two independently rendered views.
- **Findings:** Add a real two-tab CDP/browser test to CI. Investigate the one-sided `hello`/`hello-ack` handshake and ensure both views render their own outgoing messages before broadcasting. The AI response path also needs a separate model-runtime test with a mocked provider or a deliberately small fixture.

### Starfall

- Starfall has a real score ramp. Spawn interval falls from 1.1 seconds at score 0 to 0.8 at 50 and 0.5 at 100; star fall speed rises from 130 to 230 at 50 and 330 at 100 (`src/games/starfall/model.js:80-83`).
- In a 200-run flipped-mode stress test with one user star every 30 updates, the computer runner survived 150 and lost 50: **3:1 survival-to-loss**, which is a reasonable pressure range but not very expressive.
- The computer chooses among seven safe x positions and immediately changes target whenever a star threatens the current target (`src/games/starfall/model.js:112-134`). It has no reaction delay, target commitment, or imperfect safe-position choice, so it can look robotic and may be too good once the star field becomes dense.
- The `runner` side is labeled “You vs computer — guide the runner,” but the model only creates the human runner in that mode; `aiRunner` is called only in `stars` mode (`src/games/starfall/model.js:43-79`, `src/main.js:67`).
- **Findings:** Keep the ramp. Add a real computer runner to the default mode or correct the label. Add a short target commitment/reaction delay and occasional imperfect safe-position selection to make the flipped opponent feel human.

## MVC findings

### Model

- The game models are mostly separated cleanly from rendering and input. Direct model tests are fast and deterministic.
- The main balance defect is not a collision or state bug; it is policy design: Splat race mistakes are too frequent, several “computer” modes have no computer, and some versus policies have no meaningful error model.
- The existing Monte Carlo tests are useful smoke/balance guards, but they do not assert progression curves or compare default UI labels with actual opponent presence.

### View

- The real CDP pass loaded the cabinet and selected all seven game cards and all side selectors without a module-load failure.
- Canvas pointer coordinates were correctly scaled to the canvas rectangle in the corrected CDP harness. The earlier unscaled click issue was in the temporary harness, not the application.
- The live status/score/lives DOM updated during play, life-loss countdowns, and game switching.
- The clean Imitation two-tab run exposed the view/handshake problem above: the connected state and chat transcript were not symmetric between tabs.

### Controller

- Keyboard and pointer controller tests pass for movement, fire/launch, click, drag, and chat input.
- The CDP pass confirmed real keyboard/mouse events reach the canvas, but a generic automated key pattern is not a substitute for human playtesting. The naive Snake pattern intentionally hit a wall, so it is not evidence that Snake is unfair.
- No committed CDP harness exists. The temporary harness used for this audit should become a maintained smoke test or be represented by a documented repeatable procedure.

## Prioritized issues

### P1 — Correct or implement the advertised opponents

`src/main.js:60-67` labels several default sides as “You vs computer,” but these model modes do not create an active computer opponent:

- Breakout `bottom`
- Splat `climber`
- Asteroids `ship`
- Starfall `runner`

Either add the promised opponent or change the labels and descriptions. This is the highest-impact trust/clarity issue because the player is explicitly promised a versus experience.

### P1 — Make Splat race survivable

Reduce or redesign the 8% per-column forced mistake in `src/games/splat/model.js:184`. The current policy fails almost every full route in the isolated model test. Target a full-route completion rate around 50–80% for an average player, with failure caused by readable steering pressure rather than a hidden random death roll.

### P1 — Fix and test Imitation’s real two-tab handshake

The clean CDP run connected only one side. Add a browser-level test using two real pages, assert both statuses become connected, send from each side, and assert both local and remote transcript entries render. Keep the current unit test for the controller contract, but do not treat its fake `BroadcastChannel` as sufficient coverage.

### P1 — Add human-skill error to Breakout versus

The versus computer has exact prediction and no reaction error. Add a bounded reaction delay, small target error, and occasional over/under-correction while preserving the good `blocks` policy’s 9.91:1 hit/miss balance.

### P2 — Add progression where the games currently stop

Breakout normal/setup and Splat builder/climber have fixed layouts. Add level-specific speed, gap, brick, or column patterns if they are intended to be endless score games. If they are intentionally finite puzzles, state that clearly and show remaining route/progress.

### P2 — Make computer mistakes feel earned

Asteroids rocks mode uses a periodic binary mistake, Breakout versus has no error, and Starfall’s AI reacts instantly. Replace abrupt hidden failures with proximity-gated, bounded errors and short recovery windows.

### P2 — Establish attacker baselines

Missile Command attacker mode and the flipped modes need playtests with competent human input, not only stress bots. Record completion rate, average survival time, and first-life loss cause for each computer policy before tuning further.

### P3 — Add CDP regression coverage

The repository has no committed browser automation. Add a lightweight Chromium CDP smoke test for boot, all game cards, side selection, New game, Pause/Continue, canvas input, and the two-tab Imitation handshake. Keep model Monte Carlo tests separate and fast.

## Bottom line

The cabinet is mechanically alive and the strongest progression is in Asteroids and Missile Command. Breakout’s setup computer and Splat’s builder computer are in a reasonable casual range. The biggest quality problems are not rendering: they are misleading versus labels, the nearly unwinnable Splat race policy, the one-sided real-browser Imitation handshake, and several computer policies that are either absent or too exact. Fix those before adding more games or more difficulty knobs.

## Whole-repository Lamdan design critique

**Skill:** Lamdan 3.1.0 from `SYKhayyat/claude-skills`
**Overview used:** `lamdan/README.md` and the authoritative `lamdan/skills/lamdan/SKILL.md`; the repository has no file literally named `Overview`
**Sweep date:** 2026-09-25
**Sweep mode:** Whole repository, five regions, design lenses 1–3. This critique is separate from the earlier correctness, balance, and CDP findings above.

### What I would have built first

A static, framework-free cabinet with seven separate, explainable game slices; one small shared lifecycle/input contract; symmetric human and machine roles; a browser-local AI path with no secret key; a deliberately honest same-browser or cross-device multiplayer boundary; deterministic model tests; a real browser smoke test; and a release check that proves the custom domain serves the current commit.

### Coverage

The sweep read all 52 tracked files. It covered:

1. Core shell and deployment: `index.html`, `styles.css`, `src/main.js`, `src/engine.js`, `netlify.toml`, `package.json`, `.gitignore`.
2. Six non-Imitation game models/controllers/facades: all `src/games/{asteroids,breakout,missile,snake,splat,starfall}/` runtime files and top-level wrappers.
3. All seven view renderers.
4. Imitation and local AI: `src/ai/*`, the Imitation model/controller/facade/view, and the top-level wrapper.
5. Verification, documentation, and operations: all tests, `PLAN.md`, `REFERENCE_NOTES.md`, `DELEGATION_LOG.md`, and `.github/workflows/netlify.yml`.

`issues.md` was treated as prior audit context, not as evidence by itself. No tracked source was edited during the Lamdan sweep. History was used only after the region sweep: `tests/models.test.js`, `src/games/imitation/model.js`, `src/main.js`, `src/games/splat/model.js`, and `src/engine.js` are the highest-churn areas, which makes the shared lifecycle and mode contracts the highest-value architectural targets.

## Lens 1 — Was this the right artifact?

### 1. The static, no-build cabinet is the right artifact

**Steelman:** The assignment explicitly asks for static HTML/CSS/JavaScript, no API keys, and code the author can explain. A plain module site is inspectable from `index.html` to `src/main.js` to a game model, deploys without a build service, and does not hide the game rules inside a framework.

**Verdict:** `wrong-but-keep`

**Concrete change:** Keep the zero-build shape. Add a concise submission/README map that says: static shell, shared engine, one folder per game, local AI, and Netlify. Do not add React, a backend, accounts, analytics, or a physics framework merely to make the project look more substantial.

**Cost:** 30–60 minutes for documentation; no runtime migration.

### 2. The literal multiplayer requirement and the static/no-server constraint are currently contradictory

**Steelman:** `BroadcastChannel` is the correct privacy-preserving transport for two tabs on one machine. It has no server, no API key, and no signaling requirement, and the project honestly documents that limitation in `PLAN.md:29-33`.

**Evidence:** The assignment asks for two separate browsers, while `ImitationController` uses `BroadcastChannel` and the UI says “another tab or window” (`src/games/imitation/controller.js:1-32`, `src/games/imitation/model.js:21`, `src/main.js:66`). A clean CDP run also showed the real handshake is not symmetric: one tab remained in searching state while the other connected.

**Verdict:** `rewrite`

**Concrete change:** Decide the actual contract before more implementation:

- If separate browsers means separate browser instances on the same machine, use a real browser-level test and clearly call the feature “two windows in one browser.”
- If it means separate devices/browsers, `BroadcastChannel` is the wrong artifact. Use WebRTC with a signaling service, or implement explicit copy/paste offer/answer signaling so the site remains static. The latter preserves the no-server constraint but adds a manual setup step.

Do not submit the current two-tab transport as literal cross-browser multiplayer. The requirements need a decision because the replacement changes the architecture by two orders of magnitude.

**Cost:** Same-browser clarification is low cost. True cross-browser play is a substantial protocol, reconnect, privacy, and UX project; a signaling service also conflicts with the strict no-server reading of the brief.

### 3. The local AI artifact is honest about its implementation, but not literal Claude

**Steelman:** The current provider ladder is safer than putting an Anthropic key in browser JavaScript. It uses Chrome built-in AI where available, local Ollama, and a pinned local Llama 3.2 model through browser-side Transformers.js. The project does not pretend that a browser-held Anthropic key is safe.

**Evidence:** `src/ai/on-device.js:1-5,39-124` selects Chrome AI, Ollama, or Llama 3.2; `PLAN.md:29-33` explicitly explains the no-key decision. The assignment text says the AI runs through Claude in the browser, while the project documents local Llama instead.

**Verdict:** `rewrite`

**Concrete change:** Get the instructor’s interpretation in writing. If “Claude” is literal, the current implementation does not meet it and the safe browser-only architecture needs a different approved runtime or a clarified exception for a server-side key. If the real requirement is “AI runs locally in the browser without exposing a key,” keep the local model ladder and change the submission wording so it does not claim Claude.

**Cost:** Clarification is free. A literal Claude implementation is not a small UI change: it requires an approved browser-safe runtime, a local Claude-capable model, or a requirements exception. Do not solve this by embedding an Anthropic secret in the static site.

### 4. The seven separate game slices are more valuable than a generic arcade framework

**Steelman:** Snake’s grid, Breakout’s paddle/brick ownership, Splat’s route editing, Asteroids’ inertia, Missile Command’s targeting, Starfall’s gestures, and Imitation’s chat are not variants of one game loop. Separate models and controllers make each collision rule traceable and explainable.

**Verdict:** `wrong-but-keep`

**Concrete change:** Keep the per-game model/controller/view structure. Extract only genuinely shared lifecycle, input vocabulary, geometry, and neutral policy fields. Do not create a universal entity, mode, AI, or collision abstraction.

**Cost:** Some repetition remains by design. The cost is a little duplicated code; the benefit is that a student can open one game and explain it without first learning a second abstraction language.

## Lens 2 — Is this the right architecture?

### 1. `main.js` and `GameEngine` have accumulated too many responsibilities

**Steelman:** A single composition root is very easy to locate, and a single shared engine is preferable to seven independent lifecycle implementations. The optional hooks let games remain different without forcing them into a lowest-common-denominator base class.

**Evidence:** `src/main.js:20-263` owns the registry, DOM queries, settings, chat rendering, side selection, controls, and all UI event binding. `src/engine.js:10-245` owns input, lifecycle, countdown, lives, rendering, overlays, and game-specific branches.

**Verdict:** `rewrite`

**Concrete change:** Keep `main.js` as the composition root, but extract a small cabinet UI controller and explicit game contract. Define lifecycle states, timer ownership, settings application, result rendering, and side guarantees. Move Imitation’s special UI behind an adapter. Do not introduce a framework.

**Cost:** 6–10 hours, with game facade and test updates. This is the most valuable structural refactor because future modes currently touch the engine, main controller, view, and model together.

### 2. Imitation has a good single class but an undisciplined mode protocol

**Steelman:** The five modes share most chat plumbing, so five classes would create more drift than clarity. One model with mode branches is a reasonable choice for a small project.

**Evidence:** Raw `side` strings drive nested conditionals across `src/games/imitation/model.js`, `controller.js`, `view.js`, and `src/main.js:66,191-221`. `phase` mixes round lifecycle and capability state. The model calls optional controller callbacks while the controller writes model fields directly.

**Verdict:** `rewrite`

**Concrete change:** Keep one model, but add a `MODES` table containing label, initial phase, model requirement, channel behavior, and mode-specific transitions. Make the model own phase transitions through explicit methods. Route controller writes through model methods. Add a `bye` message and stale-peer timeout before attempting any cross-device transport.

**Cost:** Roughly 80–120 lines of focused refactoring plus tests. It removes repeated five-way conditionals and gives future multiplayer work one place to change.

### 3. The AI provider ladder is the right seam, but its implementation hides too much state

**Steelman:** A single local-AI provider interface is the correct narrow waist for Chrome AI, Ollama, WebGPU, and WASM. Memoizing one model engine is correct because loading two 1B models would waste memory.

**Evidence:** `src/ai/on-device.js:90-124` is a nested try/catch ladder; the first progress callback is captured by a module-global promise; `hasCachedModel()` is a localStorage flag rather than proof that the current model weights are cached; `src/ai/worker.js` is not imported anywhere and carries a second, dead web-llm dependency.

**Verdict:** `rewrite`

**Concrete change:** Use one declarative backend list for both support checks and loading. Store a listener set alongside the memoized engine. Store the resolved model ID with cache metadata. Return raw text from a narrower `chat({messages, schema, maxTokens, temperature})` interface. Delete `src/ai/worker.js` unless a real WebLLM path is selected.

**Cost:** About 50–80 lines and a small UI copy change. The first change is bounded; a literal Claude runtime is not.

### 4. The views are correctly separate, but cabinet chrome is duplicated

**Steelman:** Each game’s scene is different enough that one universal renderer would obscure the game. Immediate-mode Canvas drawing is easy to inspect and has no asset pipeline.

**Evidence:** All seven views independently draw their own 800×560 frame, background, text placement, and status treatment. Breakout and Splat carry the most role-specific layout complexity; Imitation’s canvas repeats status copy already returned by `publicState()`.

**Verdict:** `rewrite`

**Concrete change:** Keep seven `draw(model, context)` functions. Extract only neutral cabinet bands/backgrounds, common text tokens, and a stable status/objective slot. Add role cards and ownership legends, especially for Breakout, Splat, Missile Command, and Starfall. Do not build a declarative sprite/component engine.

**Cost:** 1–2 days. The immediate-mode scenes remain; only the repeated frame and instruction architecture changes.

### 5. The lifecycle has two sources of truth

**Steelman:** Separating simulation state in the engine from presentation state in the DOM is a reasonable boundary. The engine should not know CSS, and the DOM should not advance physics.

**Evidence:** Engine state, game state, active game ID, panel visibility, settings state, and status text are all mutated independently. Overlay interpretation exists in both `src/engine.js:217-231` and `src/main.js:213-226`.

**Verdict:** `wrong-but-keep`

**Concrete change:** Keep the separation, but emit one declarative machine state containing active game, phase, status, visible controls, stats, settings, and message. The DOM should render that state, not infer it from several independent variables.

**Cost:** 3–5 hours, mostly in the shell and tests.

## Lens 3 — Is the implementation being carried in a human-sized way?

### 1. Immediate-mode rendering and shared collision primitives are the right implementation choices

**Steelman:** The Canvas API is transparent, stateless, and appropriate for seven small scenes. Shared circle/rectangle helpers remove only geometry duplication without pretending all games share physics.

**Verdict:** `wrong-but-keep`

**Concrete change:** Keep immediate mode and the current collision helpers. Expand semicolon-dense draw functions into named local blocks only where the scene hierarchy is hard to explain. Promote repeated visual constants, not every one-off coordinate.

**Cost:** Small to medium. This is a readability improvement, not a performance rewrite.

### 2. The draw functions hide scene hierarchy and semantic values

**Steelman:** Compressed immediate-mode statements let a reader see an entire entity in one place, which is useful for small renderers.

**Evidence:** Breakout, Missile Command, Asteroids, and Starfall combine path construction, colors, text, and state branching in dense statements. Several magic numbers carry meaning such as marker radius, status band, and label size.

**Verdict:** `rewrite`

**Concrete change:** Split each view into local semantic functions: configure, draw world, draw actors, draw effects, draw cursor/selection, draw objective. Name repeated or meaningful values. Keep local game palettes.

**Cost:** 1–2 days. It improves explanation and tracing without changing gameplay.

### 3. AI progress and cache state are represented optimistically

**Steelman:** The worker does report progress and a localStorage marker gives the user a fast “cached model” label before a large load. A bounded chat timeout is necessary for a 1B model.

**Evidence:** Progress is reduced to a string, the cache marker is not tied to the model ID, and a timeout can leave a worker generation running. The UI reports a cached/ready state without proving the current weights remain available.

**Verdict:** `rewrite`

**Concrete change:** Track model ID and actual load state, show bytes/percentage, separate engine lifecycle from transient request errors, and terminate/recreate a worker after an aborted generation. Keep raw diagnostics in the console or a debug view rather than turning transport errors into game copy.

**Cost:** 1–2 days plus model-runtime tests. This is required for a transparent browser-local AI experience.

### 4. The source is too repetitive in places to explain quickly

**Steelman:** Repetition in the facades, controllers, and collision code is partly intentional teaching clarity. The student can compare games without learning a framework.

**Evidence:** Facade getters repeat across all games; controller constructors repeat; AI policy fields have different names and semantics; settings are declared in HTML and parsed again in `main.js`; mode copy is repeated across model, view, and main.

**Verdict:** `wrong-but-keep` for the facades, `rewrite` for duplicated contracts and policy vocabulary

**Concrete change:** Keep thin facades and per-game controllers. Standardize only host lifecycle fields, input names, and a small AI-policy object. Generate settings/mode descriptors from one data source. Do not build a universal model base class.

**Cost:** Low to medium. The goal is fewer hidden contracts, not fewer visible game-specific rules.

## Cross-region synthesis

The regions agree on four points:

1. **Keep the static artifact and separate game slices.** A generic arcade engine would make the project less explainable and would not make the games more fun.
2. **Fix the boundaries around lifecycle, modes, and AI.** The highest churn is concentrated in `main.js`, `engine.js`, Imitation, and the large model tests; that is evidence that the shared contract is where future work is becoming expensive.
3. **Make the product tell the truth.** The shell, views, model labels, and assignment requirements currently disagree about “versus,” “two browsers,” “Claude,” and “local AI.” Copy changes are not cosmetic here; they are part of the artifact’s contract.
4. **Prove the user wants, not only the model mechanics.** The tests are strong on rules and weak on browser interaction, custom-domain reachability, cross-browser multiplayer, and the complete seven-game journey.

## Requirements acceptance matrix

| Requirement | Evidence in repository | Verdict | Required next proof/change |
|---|---|---|---|
| One static page with seven named games | `index.html`, `src/main.js:10-18`, seven game facades | **Pass** | Keep. |
| Human or computer on either side | Side selectors exist, but several default labels have no active computer opponent | **Fail/partial** | Implement opponents or correct labels and prove each role with a browser journey. |
| Fair collisions, no scripted wins | Shared model collision paths and Monte Carlo tests; prior CDP/model audit | **Partial** | Add per-game fairness metrics and human play baselines. |
| Easy then gradually harder | Snake, Asteroids, Missile Command, and Starfall ramp; Breakout and Splat are fixed routes; Imitation is not an arcade difficulty curve | **Partial** | Add explicit level/route policy or document finite-puzzle scope. |
| Two separate browsers for Imitation | `BroadcastChannel` is same-origin tabs/windows only | **Fail under literal reading** | Clarify requirement, then implement signaling/WebRTC or manual offer/answer. |
| Delayed matchmaking | `matchmaking` countdown and periodic hello exist | **Pass for same-browser tabs** | Add a real two-target browser test and peer lifecycle timeout. |
| Static site/no API key | Static modules, local provider ladder, Netlify static publish | **Pass** | Keep; do not embed secrets. |
| Claude in the browser | Current runtime is Chrome AI/Ollama/Llama 3.2, not literal Claude | **Unclear/fail under literal reading** | Get instructor clarification; do not claim literal Claude until true. |
| Netlify continuous deployment | Main workflow verifies then runs Netlify production deploy; recent GitHub Actions runs succeeded | **Partial** | Confirm Netlify site/domain configuration and add post-deploy canonical URL smoke check. |
| Custom domain | `PLAN.md:48` names `games.siachshai.online`; DNS lookup failed during this audit | **Fail currently** | Configure DNS/custom domain and verify HTTPS, canonical marker, and latest deploy. |
| Explainable human-written code | Small modules, no framework, tests and delegation log | **Pass, with architecture debt** | Preserve separate models/views and simplify shared contracts. |
| Canvas submission packet | Repository contains no Canvas submission record with all three fields | **Unverified** | Prepare site URL, GitHub URL, and current delegation log after domain is live. |
| Slack challenge post/replies | No repository artifact proves this external action | **Unverified** | Post in the course channel and record links/screenshots in the delegation log. |

## Prioritized Lamdan changes

### P0 — Resolve the requirements contradictions

1. Decide whether “two browsers” means two windows in one browser or two devices.
2. Decide whether “Claude in the browser” means literal Claude or any approved browser-local model.
3. Configure and verify the custom domain before submitting.

These are not implementation details. Each choice changes the right artifact.

### P1 — Repair the shared contract and Imitation lifecycle

- Introduce an explicit game lifecycle contract without a framework.
- Add a mode descriptor table to Imitation.
- Add peer `bye` and stale-peer handling.
- Fix the one-sided real-browser handshake and add a CDP regression test.
- Do not add cross-device transport before the mode table and peer lifecycle exist.

### P1 — Make every “versus” promise true

Implement or rename the missing computer roles in Breakout bottom, Splat climber, Asteroids ship, and Starfall runner. This is the clearest assignment-level failure, independent of Lamdan’s architectural critique.

### P1 — Make AI loading honest and recoverable

Delete the unused WebLLM worker, unify backend probing, bind progress to all callers, tie cache state to the model ID, report download size/progress, and recover from timed-out workers.

### P2 — Improve evidence before adding features

Add:

- An acceptance matrix to `PLAN.md`.
- A browser smoke suite for all game cards, side selectors, New game, Pause/Continue, keyboard/pointer input, and Imitation’s two-target flow.
- A custom-domain post-deploy check.
- A current delegation entry with commit SHA, test commands, deployment run, canonical URL, and any unresolved DNS/requirements blockers.

### P2 — Keep the readable core

Do not replace the seven models with a generic engine, do not add a framework, and do not add sprites/animation infrastructure merely for appearance. The best design alternative I could not beat is the current set of small, separate game slices with only shared lifecycle, input, and neutral geometry extracted.

## What Lamdan could not beat

I could not beat the zero-build static artifact or the one-model-per-game structure for this assignment. The current architecture is strongest precisely because a student can open a game, trace its controller into its model, and see the same collision path used for the computer. The redesign should make that structure more honest and less overloaded, not hide it behind a generic engine.

The next likely harmful change is adding cross-device multiplayer directly on top of the current `BroadcastChannel` controller. It looks like a transport swap, but it requires signaling, reconnect state, peer lifecycle, privacy decisions, and a new round protocol. That change will be expensive unless the mode table and peer exit path are built first.

## Lamdan release verdict

**Wrong-but-keep:** the static cabinet, separate game models, thin facades, immediate-mode views, shared geometry helpers, and local-AI direction.

**Rewrite before submission:** the game lifecycle contract, Imitation mode/protocol state, AI provider/progress/cache handling, role labels, and deployment proof.

**Do not build yet:** a universal game engine, framework, backend, generic physics system, sprite framework, or cross-device transport before the requirements and peer lifecycle are settled.

The prior balance/CDP findings remain valid and actionable. Lamdan adds the larger point: the project’s hardest problems are now boundary and truthfulness problems, not the existence of the cabinet itself.

## Remediation pass after the audit

**Date:** 2026-09-25

### Completed

- Changed the four misleading selectors to honest solo labels:
  - Breakout bottom is now “Solo — keep the ball alive.”
  - Splat climber is now “Solo — steer the ball.”
  - Asteroids ship is now “Solo — fly the ship.”
  - Starfall runner is now “Solo — guide the runner.”
- Reduced the Splat race forced-mistake chance from 8% to 2% per passed column. The isolated mirrored-AI simulation now completed 72/200 full routes, with 128 failures and an average of 19.6 columns before failure. This is still difficult, but no longer nearly deterministic.
- Added progressive Breakout ball speed. Every 10 score points multiplies ball velocity by 1.045, capped at eight difficulty increases. The increase applies to normal, setup, and versus play using the relevant score.
- Weakened Breakout versus AI. The computer now has a 0.14–0.24 second reaction delay, a 65% chance of bounded target error, and moves at 360 px/s instead of predicting perfectly at 480 px/s.
- Added progressive Splat gap narrowing. Generated gaps start at 112 pixels and shrink by 5 pixels every ten columns, with a 76-pixel floor.
- Added Imitation peer-leave handling with a `bye` message and return to matchmaking.
- Made Imitation state rendering event-driven so a background or throttled tab updates its status and local chat immediately when a peer event or local send occurs.
- Added model download progress text with loaded/total byte counts when the worker reports it.
- Stored the resolved model ID and device in the local AI cache record instead of storing only a bare `ready` flag.
- Deleted the unused `src/ai/worker.js` WebLLM spike.
- Added `tests/browser-smoke.mjs` and `npm run test:browser`. It checks cabinet boot, all seven cards, all side selectors, the separate-browser connection panel, two real Imitation targets, connection state, and local/remote message rendering through CDP.
- Added model tests for Breakout reaction/difficulty, Splat gap narrowing, and Imitation peer departure.
- Added manual WebRTC offer/answer controls to Imitation. One browser creates an invite, the other creates an answer, and the first pastes the answer back. This provides a static-site path for separate browsers without an application server.
- Added worker cancellation and fresh-worker recovery for timed-out browser AI requests.
- The teacher’s clarification resolves the four-mode concern: the intended reversal is player control versus setup/placement control. Snake, Splat, Breakout, and the other games already provide that kind of role reversal, so the honest Solo labels are appropriate.

### Verification

- `npm test`: **77 passed, 0 failed**.
- `npm run check`: passed.
- Syntax checks passed for the changed model, AI, Imitation, and browser-test modules.
- `npm run test:browser`: passed against Chromium CDP for boot, selectors, same-browser Imitation, and the separate-browser control surface. The manual WebRTC exchange still needs one real non-headless browser pass because the headless target does not expose a usable `RTCPeerConnection` for that path.
- Splat race isolated simulation: 72 full-route completions and 128 failures across 200 mirrored-AI runs.
- Breakout and Splat changes have direct regression tests.

### Remaining blockers

1. **Manual WebRTC still needs a real-browser verification pass.** The static controls and signaling code are implemented, but the headless CDP environment does not expose a usable `RTCPeerConnection` for the full offer/answer exchange. Test it in two normal browser windows on the target network before claiming separate-browser play is proven.
2. **The literal Claude requirement remains unresolved.** The current browser-local alternatives are Chrome Built-in AI, Ollama, and Transformers.js with Llama 3.2. These are valid no-key alternatives, but they are not Claude.
3. **The custom domain remains an external deployment task.** It was intentionally not changed in this pass.
4. **Canvas and Slack submission actions remain external tasks.** They were intentionally not fabricated or claimed as complete.
5. **The four solo labels are not considered blockers after the teacher clarification.** They represent the player side of the player/setup reversal; the actual computer-controlled reverse modes remain available.
