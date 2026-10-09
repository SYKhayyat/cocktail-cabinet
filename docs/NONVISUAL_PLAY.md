# Nonvisual play (#77)

Every advertised mode has a mode-specific **Nonvisual game state and assistance**
section below the board/chat. It exposes the objective, actual player/AI objects,
hazards, targets/editable objects, score, life ownership and round outcome as
headings, text and lists—not just a canvas label. **Refresh state** reads a fresh
snapshot in real-time play. Snapshots do not mutate on animation frames.

## Keyboard workflow

1. Choose a game and **You control** mode with the native buttons/select.
2. For arcade games, check **Enable step-by-step assistance**. This freezes game
   physics and countdown time, but leaves the visual renderer intact.
3. Read the objective, coordinates, players, hazards and targets. Choose **New
   game** when ready. Builder/brick editing also works before starting or paused.
4. Tab to **Game action**, **Named target**, coordinate fields and **Time per
   action**. Choose an action and press **Perform action and read updated state**.
   Use 0.1, 0.5 or 1 second; Snake always advances one move.
5. Read the updated lists/outcome after each action. A short action receipt is
   announced once; the semantic lists are not a continuous live feed.

Time advances through the real model rules in at-most-1/60-second ticks. Computer
perception, commitment, movement, projectiles, cooldowns, spawn limits, collisions,
score, power-ups, life loss and win/loss logic remain active. Steps skip only the
visual countdown and stop at a life reset or round end. Pause still blocks steps;
Continue permits them. Disabling assistance resumes normal animation/gameplay.
There is no auto-dodge, auto-hit, teleported paddle/ship or alternate collision
system.

## Mode coverage

| Game | Nonvisual operation |
| --- | --- |
| Snake, snake | Read head/body/apple cells and heading; move in four directions or advance. Reverse-direction and wall/body collision rules still apply. |
| Snake, apples | Enter 1-based column/row to place an apple in a free cell; advance the real computer snake. Occupied/out-of-bounds cells are refused. |
| Breakout, bottom/versus | Read paddle positions/widths, every ball's position/velocity, brick type/activity/cleared state and duel lives; move paddle left/right or advance. |
| Breakout, blocks | Select a named brick; move it using entered coordinates or cycle its actual type. Normal drag bounds and saved layout rules apply; test the computer with timed advances. |
| Splat, climber/race | Read ball positions/vertical velocities and world-coordinate column gaps; bounce/drift up/down or advance the race. |
| Splat, builder | Select any named column, including off-camera ones; move it, move/resize its gap, add after it or remove it using existing Builder rules. Read SOLVED/UNSOLVED, retries and route state after testing. |
| Asteroids, ship/versus | Read ships, asteroids and bullets; aim/fire or aim/thrust at a named target or coordinates; turn, thrust, fire forward or advance. Wrapped aiming, travelling bullets and firing cooldown remain real. |
| Asteroids, rocks | Send a rock from entered coordinates toward the actual computer ship; advance the computer, observing real asteroid limits, splitting and collisions. |
| Missile Command, defender | Select a battery, read alive/ammunition state, and launch an interceptor toward a named threat or coordinates. Read moving missiles, destinations, interceptors, fireballs, city state and wave progress. |
| Missile Command, attacker | Select a named live city or battery and launch a real missile. Destroying all cities wins; destroying all batteries while cities survive loses. |
| Starfall, runner | Read the runner, stars and gems with positions/velocities; move left/right or advance. |
| Starfall, stars | Send a star or gem lure at an entered x coordinate; advance the real computer runner. Limits and gem cooldown/removal rules are retained. |
| Lamp, walk | Read the walker's tile, light, coins, wisps and cleared-maze count; read the exit, every uncollected coin and wisp, and every hazard by name, patrolling or not. Walk in four directions, pulse the lamp, or advance. A walk attempted while the lamp is lit is refused in words, because the model will not move. |
| Lamp, continue | As Lamp/walk, plus the count of mazes cleared. Reaching the exit advances to a new maze in the same step, keeping light, coins and lives, so the counter and the meter are the whole read. |
| Imitation, all five modes | Native Message/Send, model download, invite/answer, guessing and Restart round controls remain available. Mode-specific objectives/status are readable with Refresh state. No arcade stepping is applied to connection/model timers. |

Coordinates are explicitly explained in the panel: Snake uses 1-based cells,
Splat uses world (not camera) pixels, and other games use x/y canvas pixels.
The interface intentionally offers simpler keyboard equivalents for attacks
(aimed missiles, ship-directed rocks, vertical stars), not every pointer-drag
trajectory. These still use the actual rules and are enough to operate every
advertised mode without sight.

## Checks and limits

- `npm test`: includes `tests/nonvisual.test.js`, catalogue checks for all 17
  arcade modes and targeted rule/lifecycle/editing tests.
- `npm run check`: syntax, model boundary, dead-code and README checks.
- `npm run test:nonvisual-browser`: **required** Chromium CDP test (default port
  9321; explicitly refuses Electron 9223). It creates an isolated context, reads
  Chromium's real accessibility tree, sends native keyboard events, checks all
  22 modes, exercises named edits/attacks and outcomes, and verifies freeze/resume.
  Two real same-origin tabs cover keyboard human chat and provider/guesser flow;
  local AI and classification replies are deterministic fixtures.

Example with a dedicated Chromium process and this worktree served on port 8777:

```sh
CDP_URL=http://127.0.0.1:9321 COCKTAIL_URL=http://127.0.0.1:8777/ npm run test:nonvisual-browser
```

Automated AX-tree checks are not a human screen-reader usability audit. No
NVDA/JAWS/VoiceOver/Orca speech-output review or real AI weight download/inference
was performed by this dedicated suite. Real-time nonvisual play does not provide
continuous positional audio; use opt-in assistance for a frozen readable board.
Multiplayer/model work still requires its normal partner/model setup.
