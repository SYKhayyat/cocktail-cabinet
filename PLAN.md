# Cocktail Cabinet — first draft plan

## Goal

Build one static, framework-free cabinet with seven readable games. Each game gets a human side and a machine side, starts gently, and gets more active as the score rises. No server code or API keys are required.

## Structure

- `index.html` contains the cabinet shell and controls.
- `styles.css` contains all visual styling.
- `src/engine.js` owns the canvas, fixed input collection, animation loop, and small geometry helpers.
- `src/main.js` owns the cabinet UI and swaps game modules in and out.
- `src/games/*.js` contains one self-contained game per file.
- `tests/core.test.js` checks the shared rules and representative game state.
- `netlify.toml` makes the static publish directory explicit.

## Game rules

Every game exposes the same small contract:

- `reset()` starts a fair round.
- `update(delta, input)` advances real game state.
- `draw(context)` renders the current state.
- `setSide(side)` changes which side the human controls.
- `publicState()` supplies UI text.

The machine code makes decisions from current positions and collision state. It does not skip a round, award itself points, or bypass collision checks.

## AI and browser constraints

A static browser page cannot safely hold a Claude API key: anything sent to a browser can be read by a visitor. The first draft therefore uses local JavaScript opponents with explainable decisions. This satisfies the static/no-key constraint without pretending that an unapproved external AI service is secure. If the instructor requires a model, the next step is an approved local browser model behind the same `AiController` interface.

Imitation uses `BroadcastChannel` for a two-tab first draft. It waits through a visible matchmaking delay before starting. True cross-device play needs WebRTC signaling or a tiny signaling service; neither is silently pretended to exist in this draft.

## Fix pass

- Defaults use the normal human role: steer Snake, control the bottom Breakout paddle, climb Splat, fly Asteroids, defend Missile Command, and guide the Starfall runner.
- Every game accepts mouse input; keyboard input remains available where it helps.
- Snake exposes starting length, board size, and wrap settings.
- Breakout has a normal paddle mode and a setup mode where bricks can be dragged while the computer plays.
- Imitation uses one visible chat transcript, supports two tabs on one computer, and sends AI replies after a human-like delay. Its local model fallback never exposes WebGPU or model errors as a user-facing feature.
- Chat typing keeps spaces and Enter/Submit behavior independent from arcade keyboard controls.

## Deployment

Netlify should publish the repository root as a static site. The public GitHub remote is configured at `https://github.com/SYKhayyat/cocktail-cabinet`. The custom domain to configure in Netlify is `siachshai.online`.
