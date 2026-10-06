# Breakout Versus calibration (#73)

This is a deterministic **mechanical reachability probe**, not a population win
rate, a fun rating, or a claim that every human can beat the computer. Three
independent, bounded human-input recipes exercise actual controller inputs and
the game lifecycle. They do not call the production computer or prediction
functions, mutate paddles/balls, search brick collisions, or inspect AI timers.

## Reproduce

```sh
node --test tests/breakout-versus.test.js tests/breakout-outcomes.test.js
node tests/breakout-versus-report.mjs
# Full per-seed inputs' outcome, loss history, and comeback evidence:
BREAKOUT_DETAILS=1 node tests/breakout-versus-report.mjs
# Previous Versus tuning on the same policies, seeds, and fixed outcome logic:
BREAKOUT_AI_TUNING='{"versusReactionMin":0.14,"versusReactionMax":0.24}' node tests/breakout-versus-report.mjs
```

`tests/breakout-versus-probe.mjs` also exports `versusSample` and
`versusDistribution` for individual seeds. The simulation advances at 60Hz,
starts with three lives per player and the normal central brick layout, and
freezes the model for three wall-clock seconds after each nonterminal life-loss
frame, as the cabinet does. A separate disadvantage scenario starts the human
with **two** lives against the computer's **three**; it is a controlled resilience
probe, not a claim that this opening occurred naturally. Special bricks and
retained difficulty/retry rules are not disabled. The horizon is 180 active
seconds; unfinished rounds are **censored**, never counted as wins or losses.
Both elimination and clearance are valid victories.

### Seeds

- Calibration: `57, 113, 227, 449, 907, 1801, 3607, 7207, 14407, 28813, 57637, 115271`.
- Separate validation: `83, 167, 331, 659, 1327, 2657, 5309, 10613, 21227, 42457, 84913, 169859`.

The seeded world generator is the existing unsigned 32-bit LCG:
`state = (1664525 * state + 1013904223) mod 2^32`, divided by `2^32`.
Polling phase is `(seed % 7) / 60` seconds and does not consume world randomness.
The validation partition is reported separately to expose seed dependence; this
is a fixed engineering sample, not a statistically independent human study.
Full trajectories, including life-loss histories, must reproduce exactly on a
repeated seed. Global `Math.random` is restored even on failure.

### Reaction, aim, and movement assumptions

All policies see only a value snapshot of the visible human paddle geometry and
ball positions/velocities/radii. They cannot observe hidden decision state,
future randomness, score/life budgets, or brick collision results. Held controls
do not react to a new observation between polls.

| Recipe | Perception | Aim and controls |
| --- | --- | --- |
| `bank-pulse` | 200ms / 5Hz | Urgent falling ball, visible linear flight capped at 1.5s, one rough wall mirror, 24px off-centre return toward the field. Keyboard pulse uses observed distance / 460px/s, clamped to 50–200ms; 10px dead zone. Release is pre-scheduled, not another observation. |
| `coarse-pointer` | 250ms / 4Hz | Urgent falling ball, linear lead capped at 0.75s, **no** wall mirror, quantized to a 32px lane. Holds a centred mouse aim until the next poll; recentres while outgoing. Native pointer movement remains capped at 720px/s. |
| `reactive-keys` | 150ms / 6.67Hz | Chases the falling ball's **current x**, without landing prediction or bank estimates. Holds full keyboard directions, 18px dead zone; recentres while outgoing. Native keyboard movement is 460px/s. |
| `idle` | No input | Counterfactual: demonstrates that wins are input-mediated, not passive gifts. |

All movement goes through `BreakoutGame.update`/`BreakoutController`; no
teleportation or per-frame hidden target correction is supplied. Pointer holds
are allowed to continue moving toward the old cursor, as in real play.

## Change and actual outcomes

Only `versusReactionMin/Max` change: **140–240ms → 180–280ms**. Upper paddle speed
remains 360px/s, with the same one-bounce foresight and 22px dead zone. This
modestly extends a committed observation, allowing recoverable bank shots; it
does not introduce random misses or score/life-based rubber-banding. Several
speed/reaction candidates were rejected against the calibration partition
because they made a policy too dominant or left weak recovery. Blocks-mode
reaction, dwell, speed, foresight, and movement code are unchanged.

Before/after totals below have **24 rounds per row** (12 calibration + 12
validation). Baseline means the previous reaction range with the corrected
simultaneous-outcome logic, so the balance comparison does not depend on the old
queue-order winner bug.

| Recipe | Default human wins, before → after | Computer wins after | One-life-disadvantage human wins, before → after | Natural life comebacks after |
| --- | ---: | ---: | ---: | ---: |
| bank-pulse | 14 → **18 (75%)** | 6 | 5 → **10 (41.7%)** | 16 |
| coarse-pointer | 17 → **20 (83.3%)** | 4 | 15 → **14 (58.3%)** | 10 |
| reactive-keys | 11 → **18 (75%)** | 6 | 6 → **10 (41.7%)** | 15 |
| idle | 0 → **0** | 24 | 0 → **0** | 0 |

The baseline does **not** support calling all bounded policies unwinnable; it
does expose disproportionate recovery failures in two keyboard strategies. The
new tuning improves those without requiring every recipe to improve: pointer
disadvantage wins decrease by one. No row has a tie or censored run in either
scenario. Default median active durations by partition are:

| Recipe | Calibration H/C | Validation H/C | Median active seconds, calibration / validation | Disadvantage H/C, calibration / validation |
| --- | --- | --- | --- | --- |
| bank-pulse | 9/3 | 9/3 | 8.20 / 9.15 | 6/6 / 4/8 |
| coarse-pointer | 9/3 | 11/1 | 8.30 / 8.40 | 6/6 / 8/4 |
| reactive-keys | 9/3 | 9/3 | 7.13 / 8.48 | 4/8 / 6/6 |

### Comebacks are measured, not inferred from a final win

- **Natural life comeback:** during an ordinary default round, after resolving a
  nonterminal real exit, the human has fewer lives than the computer and later
  wins. This is separate from the controlled two-versus-three opening.
- **Natural score comeback:** after at least two active seconds, the human is
  down by **at least 25 points**, subsequently regains a positive lead, and wins
  while **still ahead on score**. Winning by elimination while remaining behind
  does not count as a score comeback.

Four default score comebacks occur across two independent policies (all in the
validation partition; none in calibration). This is rare recovery evidence,
not a guarantee of comeback on every policy or seed:

| Recipe / seed | Deficit at active time | Positive lead regained | Final human/computer score | Result |
| --- | --- | --- | --- | --- |
| coarse-pointer / 169859 | 25 at 6.43s | +16 at 7.85s | 207/81 | Human wins by elimination |
| reactive-keys / 659 | 29 at 5.05s | +18 at 8.07s | 112/94 | Human wins by elimination |
| reactive-keys / 2657 | 25 at 4.30s | +5 at 4.70s | 118/89 | Human wins by elimination |
| reactive-keys / 42457 | 25 at 3.08s | +16 at 4.52s | 224/94 | Human wins by clearance |

The two-versus-three opening also produces score comebacks at reactive-keys
seeds `659` and `2657`. `bank-pulse` shows life recovery but **no** qualifying
score comeback in this sample; that limit is intentional rather than concealed.

### Regression bands

These broad count bands constrain the fixed 24-seed engineering workload; they
must not be described as population probabilities:

- Each policy: default human wins **6–20/24** (25–83.3%), with at least four
  computer wins; disadvantage human wins **8–18/24** (33.3–75%).
- Each seed partition must contain at least two default and disadvantage human
  wins and at least one default computer win, avoiding a single lucky partition.
- Each policy: at least four natural life comebacks; at least three natural score
  comebacks pooled across **at least two** policies, with final score leads.
- Zero censored runs; default/scenario median at least five active seconds;
  complete denominator accounting and bounded input polls.
- Idle must lose all 24 default and all 24 disadvantage runs before five active
  seconds. It may not inherit a positive win band from calibration.

The added regressions fail under the original reaction range: bank-pulse and
reactive-keys disadvantage wins fall below 8/24, and score comebacks are confined
to one policy. Existing Blocks computer-return bands are unchanged, and a seeded
old/new Versus-tuning ablation must yield identical Blocks trajectories.

## Sibling terminal outcomes

Both players losing their final lives in the same update now produces a **tie**,
regardless of queue order or prior scores. Life-elimination winners consistently
set terminal/win/tie flags and are not announced as highest-score wins. Clearance
still selects the highest score (or a tie). Dedicated tests cover both queue
orders, either elimination winner, stale clearance flags, and fresh-round reset.

## Checks actually run

- `npm test`: **340 passed**, zero failures/skips.
- `npm run check`: syntax, model boundary, dead-code, and README-controls checks
  passed.
- `REQUIRE_BROWSER=1 CDP_URL=http://127.0.0.1:9321 COCKTAIL_URL=http://127.0.0.1:8766/ npm run test:browser`:
  **19 suites passed**, using the test Chromium and this worktree's local server.
- Dedicated outcome/retry/calibration/Blocks/tuning run: **62 tests passed**.

The default browser endpoint initially could not create an isolated context;
the explicit test-browser endpoint above succeeded. No deployment or live-site
verification was performed for this model-only change. Human playtesting remains
necessary to evaluate perception, ergonomics, and enjoyment beyond these bounds.
