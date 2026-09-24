# Delegation log

## First draft

- **Requested:** Build the first readable Cocktail Cabinet draft.
- **Produced:** A framework-free static cabinet with seven game modules, shared engine, local machine opponents, two-tab Imitation mode, tests, and a Netlify config.
- **Verification:** `nix-shell -p nodejs --run "npm test"` passed 4 tests; `nix-shell -p nodejs --run "npm run check"` passed; every JavaScript file passed `node --check`; a local static server returned the HTML and main module successfully. Browser playtesting and Netlify deployment remain.
- **AI constraint:** The machine opponents are transparent local JavaScript controllers. Imitation uses a pinned local Llama 3.2 1B model for real responses, with no API key. A static page cannot safely call Claude directly without exposing a key.

## Gameplay reference and repair pass

- **Requested:** Compare the games with real reference gameplay, fix controls and mechanics, add lives/stop/score, repair Breakout and Missile Command, and add CI/CD.
- **Produced:** Configurable lives, a stop control, live score display, keyboard-priority mouse controls, Asteroids steering deadzone, no-top-paddle Breakout, draggable block setup, clearer Missile Command, chat layout/input cleanup, reference notes, and GitHub Actions deployment workflows for all three sites.
- **Verification:** Five local tests pass, every JavaScript file passes syntax checking, every game/side combination passes a 90-frame smoke run, the headless browser loads the cabinet, and the games/quiz/portal GitHub workflows all completed successfully. The live test URL is `https://cocktail-cabinet-323.netlify.app`.
- **Known deployment issue:** `siachshai.online` still points to GitHub Pages; the custom subdomains need DNS CNAME records before the final domains resolve.

## Focused controls pass

- **Requested:** Add New game, Pause, and Continue to every arcade game; show score and lives while paused; make Snake marginally faster after each apple.
- **Produced:** Per-game controls, a score/lives pause overlay, configurable lives, and a Snake movement interval that decreases gently with each apple.
- **Verification:** Five tests pass, all JavaScript syntax checks pass, the cabinet loads in a headless browser, and the focused build is ready for deployment.

## Snake settings and life pause pass

- **Requested:** Make Snake settings use separate X/Y selectors, queue changes until the next game, show score/lives below the board, require New game before starting, pause after a lost life, and make the computer opponent imperfect.
- **Produced:** Separate columns/rows selectors, queued settings, X/Y life display, READY/PAUSE/LIFE LOST overlays, queued lives, a speed ramp per apple, and occasional safe-but-imperfect computer decisions.
- **Verification:** Five tests pass, all JavaScript syntax checks pass, and the headless browser shows the READY state and settings panel before New game is pressed.

## Snake numeric settings pass

- **Requested:** Use numeric columns/rows/length inputs with validation, preview settings before starting, make the computer competent but slightly delayed, fit the board on screen, place score/lives opposite each other, and queue lives/settings for the next game.
- **Produced:** Validated number inputs, READY preview updates, queued mid-round settings, `lives x/y`, a fit-to-viewport board, and a delayed-but-competent computer path.
- **Verification:** Six tests pass, including a computer-apple acquisition test; all JavaScript syntax checks pass; the headless browser renders the updated READY screen.

## Snake imperfect-opponent pass

- **Requested:** Make the computer Snake good but not perfect, allowing occasional wall and body collisions.
- **Produced:** The AI keeps delayed route planning but has a small chance of choosing a legal-but-dangerous direction on recalculation.
- **Verification:** Six tests pass; a 20-run simulation confirms the computer reaches apples and can eventually lose.

- **Requested:** Add a countdown after New game, Continue, and life loss; make invalid-size feedback persistent; centralize grid/pointer coordinates so clicked apples land exactly where clicked.
- **Produced:** A three-second GET READY countdown, a non-letterboxed board mapping, shared Snake cell conversion helpers, and stronger numeric validation feedback.
- **Verification:** Six tests pass, all JavaScript syntax checks pass, and the headless browser renders the board without coordinate letterboxing.

## Breakout power-brick pass

- **Requested:** Stabilize the paddle, keep balls fully visible, outline the box, add colored special bricks, support extra lives, double balls, speed-ups, danger/life loss, and a clear-wall win.
- **Produced:** Smoothed paddle targeting, bounded multi-ball physics, a playfield outline, labeled colored special bricks, engine extra-life support, and a win overlay.
- **Verification:** Six tests pass and all JavaScript syntax checks pass; a 600-frame setup-mode smoke run confirms the computer can return the ball while the human can drag blocks before starting.
