# Player-experience regression proxies (#57)

These tests check **playable mechanical affordances**, not whether a game is
literally fun, fair to every person, or accessible to every input device.
`tests/player/` is separate from `tests/ai/`: its player is a hand-authored,
bounded keyboard/pointer recipe acting through the real game controller. The
six arcade games are Snake, Breakout, Splat, Asteroids, Missile Command and
Starfall. Imitation is a conversation game and is not an arcade simulation.

## Run and inspect

```sh
node --test tests/player/*.test.js
node tests/player/report.mjs
npm test
```

The report prints one JSON line per game, including min, lower quartile,
median, upper quartile, max and arithmetic mean, censor/completion counts,
objective reachability, pressure, and recovery-probe results. It is not an
additional test runner or a committed generated snapshot. `node --test`
discovers the tests normally. Node 24.20.0 was used for initial calibration;
on the Nix development host its `bin` directory must be on `PATH` before using
`npm`/`node`. There are no additional test dependencies.

## Sampling, controls and lifecycle

* Fixed seeds: `57, 113, 227, 449, 907, 1801, 3607, 7207, 14407, 28813, 57637,
  115271`. A scoped 32-bit LCG controls world randomness and restores
  `Math.random` even on exceptions. Policy polling phases depend on the seed
  without consuming the world random stream. Samples are serial within a file;
  Node runs different test files in separate processes.
* Twelve default, twelve progressed, and twelve idle samples per game:
  **216 simulation samples** in the report. The horizon is 45 active seconds
  (60 for Missile Command). Samples stop at their **first loss**, victory, or
  horizon. Earned extra lives cannot inflate the first-life score sample.
* Independent clearance trials add **48 whole-round samples**: twelve default
  and twelve progressed each for Breakout and Splat. They use the same fixed
  seeds, a fresh three-life round, real earned lives/retries and a predeclared
  180-active-second limit. They are not continuations of the first-life samples.
* Simulation is 60Hz, not the policy's reaction rate. Snake polls at 10Hz,
  Splat requests 120ms intervals (rounded up to 133ms by the fixed step, about
  7.5Hz), and the others poll at 5Hz. Controls persist between
  polls, except Breakout pre-schedules a keyboard release from the last observed
  distance (50–200ms pulse, rounded up to a simulation frame). That timed key-up
  reads no new objects and does not increase its 5Hz perception/reaction rate.
  `pressed` and pointer `clicked` are one-frame edges, not auto-fire
  injected every simulation tick. The model's normal movement speed applies.
  Asteroids additionally bounds cursor bearing changes to 2.8 radians/second.
* Policies receive copied, whitelisted visual snapshots, **not a model**.
  They cannot see AI fields, AI logs, random state, future spawns, model clocks
  or helper functions. Motion speeds for Breakout/Starfall are idealized visual
  estimates; Missile motion is estimated from consecutive visible positions,
  without reading the enemy's hidden destination. Entity IDs only associate
  successive visible objects. Geometrical measurements have no sensor noise.
* `policy-contract.test.js` freezes snapshots, checks actual input types and
  bounds, and disables production computer steering/targeting helpers while
  stepping the real solo controllers. No AI module is imported as the player,
  and no computer position/intent/aim is transplanted into the human.
* `harness.mjs` consumes the actual facade's `lifecycle` contract. It passes
  value-only round context, consumes rewards once, resolves real loss edges,
  spends host/game budgets, restarts through `restartAfterLife`, and freezes
  model time during the three-second retry countdown. It does not instantiate
  a canvas, renderer or `GameEngine`. There is no initial ready/countdown delay
  in the measured active-play clock.

These policies have perfect measurement of their selected visible fields and
limited strategy, reaction and input speed. They are **competent scripted
proxies**, neither the production AI nor a representative human cohort. They
have no learning, fear, fatigue, multi-step route search or motor noise.

## Exact metric meanings

| Metric | Definition and limitation |
| --- | --- |
| `survival` | Active seconds to first life loss; Missile instead uses terminal loss of all cities. If no loss occurs, record the horizon or earlier victory time. These are restricted observed durations, **not estimates of uncapped lifetime**. |
| `censored` / `finished` | `censored` counts samples still alive at the horizon. `finished` counts an earlier victory separately. A shorter Splat duration can mean finishing, not dying. |
| `gain` | Maximum observed score minus starting fixture score, in that game's own units. Never compare raw scores between games. Breakout includes paddle points and special bricks; Missile includes end-level bonuses, not just interceptions. |
| `objective` / `reached` | Domain outcome count / number of runs with at least one such outcome: apples eaten; bricks cleared (not paddle points); columns cleared; rock/fragment destructions; logged enemy interceptions; gems collected. Missile also reports samples advancing at least one level. Idle Missile bonuses cannot masquerade as successful defence. |
| `rewardDrought` | Longest active-time interval without a new domain objective, including time from start to first objective and from last objective to stopping. Paddle points/passive bonuses do not reset it. It is a stalled-reward proxy, **not experienced boredom**; a short drought in an early fatal run does not make that run good. |
| `opportunities` | **Choice-bearing polling observations**, using the per-game predicate below. Repeated polls during one threat count repeatedly. This is exposure to actionable choices, not a count of unique threats, independent decisions, strategy depth or experienced agency. Idle input has no policy polls and is reported as zero, not as a zero-opportunity world. |
| `agencyWindows` | Number of distinct one-second bins `floor(activeTime)` containing a choice-bearing poll. It checks temporal spread, not the duration of continuous engagement or unique threat identity. Coupled with survival, objective and paddle-return floors, it rejects a large count clustered in one brief opening. |
| `actions` | Nonempty control changes and emitted press/click edges. Holding a direction is not counted every frame, but explicitly re-pressing the same Snake direction at another poll is an input action. Used to prevent an inert baseline from passing. |
| Quantiles | Sort the 12 values and select `floor((n-1)*fraction)` for .25/.5/.75; the median is the lower middle order statistic, not the average of the middle two. |
| `maxSafeDelay` | Largest successful **sampled** delay in a controlled recovery scene. It is not the exact deadline or a guarantee for every naturally occurring near-miss. |

### Per-game hypotheses and player recipes

| Game | Hypothesis and bounded human policy | Choice-bearing poll |
| --- | --- | --- |
| Snake | A player can earn several apples before walls become unavoidable; longer/faster snakes increase pressure without making all turns instantly lethal. Chase the visible apple by Manhattan distance, rejecting reversal, walls and occupied next cells (vacating tail permitted). Only one-cell inspection; no AI route scorer, pathfinding or board-clear solver. | At least two legal non-reversing next cells are available. This often includes multiple polls before the next grid move. |
| Breakout | Keyboard interception reaches bricks and extends survival relative to a stationary paddle; progressed play should sustain several returns rather than collapse on its first trajectory. Extend the lowest descending ball's visible motion to the paddle, capped at 1.5s, mirror at most one side-wall overshoot, and aim a modest 24px off-centre return toward the middle. Use real Left/Right input, a 10px deadband, and pre-scheduled 50–200ms pulses at 460px/s. Follow the visible ball when none is descending. No brick simulation, repeated-bank solver, hazard-location foreknowledge or production paddle predictor. | A descending ball above the paddle requires a correction exceeding 10px. It does not certify that every correction is still feasible. |
| Splat | Default gaps are traversable with held human drift controls; later gaps narrow but retain recovery room. Centre on the next on-screen unpassed column with held Up/Down and a 16px deadband. No synthesized bounce taps or computer acceleration policy. | A visible remaining gap requires vertical correction of at least 16px. |
| Asteroids | A slowly aiming pilot can score and evade immediate rocks, while score-based speed/spawn pressure shortens survival. Aim at the nearest rock's current centre; within 160px, choose the shorter of two right-angle sidesteps and hold the normal mouse thrust/fire input. Click while aiming only within 0.3 radians of alignment. Aim turns at 2.8 rad/s; no projectile intercept solution or computer dodge lanes. A 90px alarm plus a 180° reversal was too late for the progressed rock speed: the reversal alone takes over a second. Earlier orthogonal steering is a competent human correction, applied identically to both scenarios. | The closest visible wrapped rock is within 330px, permitting an aim/fire/escape choice. |
| Missile Command | A player prioritizing low missiles and bombers can intercept enemies, preserve cities and reach level 2; later salvos increase pressure. Prioritize aircraft as if at y=250 unless a ground threat is lower, choose a live stocked battery by coarse travel time, cycle with actual Right presses, and use 80% of a single observed-motion travel-time lead. Click for aircraft or missiles below y=240. Ammo is finite; no machine interceptor function. | A visible enemy is above y=460 and at least one live stocked battery exists, allowing battery/aim/fire/wait choices. |
| Starfall | Collecting gems and evading nearby stars outperforms standing still; higher-score stars leave less dodge time. Seek the lowest reachable gem past y=300; move 100px away from a star past y=290 and within 65px horizontally. Keyboard speed is 240px/s; no computer lane list, vision filter or AI target locks. | Such a nearby danger or reachable low gem exists. Safety takes priority over collection. |

### Default versus progressed fixtures

All samples use the unchanged shipped default HUMAN-controlled mode and default
settings. Progressed fixtures only set pressure/progression context; they do not
tune the computer player. They are **section/restart scenarios**, not saved
human play histories and not proof that a novice can attain the starting score.

| Game | Default | Progressed | Four monotonicity samples |
| --- | --- | --- | --- |
| Snake | Score 0, length 3, 40×28, no wrap | Score 12, length 15 via normal reset | Scores 0/4/8/12; lengths 3/7/11/15; movement interval must decrease |
| Breakout | Score 0, full default wall | Score 60, same full wall; normal `applyDifficulty` speeds balls | Scores 0/20/40/60; speed rises, starting paddle width stays 112 |
| Splat | Start x=70 at column 1 | Start 120px before column 31, score/passed-columns=30, y=280 | Sections 1/11/21/31; gap heights 112/107/102/97, unchanged spacing 130 |
| Asteroids | Score 0, normal initial rocks | Score 120 and normal score-preserving reset, with human score baseline restored | Scores 0/40/80/120; initial rock speed rises and subsequent spawn interval decreases |
| Missile | Level 1, 12 enemies, 30 initial rounds | Start level 4 through normal level advancement, fresh initial cities/ammo; 28 enemies | Levels 1/2/3/4; salvo size and speed rise, launch interval decreases |
| Starfall | Score 0 | Score 150, fresh default gems/runner | Scores 0/50/100/150; new star speed rises and spawn interval decreases |

Reset paths can consume different numbers of random draws, so equal seed labels
do not imply identical default/progressed object layouts. Pressure comparisons
use controlled mechanics, not a paired causal difficulty estimate. Actual
mid-game Breakout has depleted bricks and actual late Missile has depleted
ammo; these fresh progressed fixtures intentionally do not claim to reproduce
those economies. Score distributions are **not required to decrease** with
progression: more targets, higher multipliers, shorter completed sections and
different trajectories can raise scores or even survival. Monotonicity here
means sampled pressure variables, not human enjoyment or every possible score.

## Guardrails and threshold rationale

The following are mechanical **regression floors**, chosen below the observed
calibration to catch unusable defaults/inert input while allowing substantial
variation. They are not targets for balancing and were not derived from a
statistical power calculation. They do not certify that every progressed scene
is well balanced. Thresholds must not be widened simply to turn a failure green.

| Game | Default median duration ≥ seconds | Default median gain ≥ | Default median opportunities ≥ | Progressed earliest duration ≥ seconds | Idle upper-quartile duration ≤ seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Snake | 20 | 5 apples | 100 | 2 | 5 |
| Breakout | 15 | 30 points | 20 | 15 | 3 |
| Splat | 20 | 15 columns | 50 | 10 | 2 |
| Asteroids | 8 | 50 points | 20 | 3 | 40 |
| Missile | 30 | 150 points | 20 | 15 | 45 |
| Starfall | 15 | 50 points | 20 | 3 | 45 |

Rationale: default floors require multiple movement/threat cycles and multiple
rewards, not merely one successful frame. Lower-quartile duration and gain must
also exceed half their median floors, preventing a few lucky runs from carrying
the sample. At least 10/12 defaults and 9/12 progressed samples must achieve an
actual domain objective; Missile must reach the next level in at least 10/12
defaults. Every progressed sample must clear its earliest-duration floor; those
emergency bounds are **not sufficient to pass sustained agency**. Default
average gain must exceed idle average by half
the default gain floor, objective average must exceed idle, and median duration
must beat idle by more than three seconds. These contrast checks reject an
ineffective or idle baseline even if points accrue passively.

### Sustained progressed lower-tail gates

For each game, the **lower quartile**, not just the median, must meet all of the
following floors. In addition, at least **10/12 of the same individual runs**
must jointly meet duration, actionable polls, temporal bins and actual domain
objectives. Breakout's qualifying runs must also make at least three real
paddle returns. Thus different lucky runs cannot carry different metrics, and
three opening polls cannot satisfy the agency requirement.

| Game | Progressed duration ≥ seconds | Actionable polls ≥ | One-second agency bins ≥ | Domain objectives ≥ |
| --- | ---: | ---: | ---: | ---: |
| Snake | max(20, 50% default p25 duration) | 100 | 15 | 5 apples |
| Breakout | max(15, 50% default p25 duration) | 20 | 10 | 5 bricks plus 3 paddle returns |
| Splat | 15 | 30 | 10 | 10 columns |
| Asteroids | max(8, 50% default p25 duration) | 30 | 8 | 5 destructions |
| Missile | max(25, 50% default p25 duration) | 30 | 10 | 10 interceptions |
| Starfall | max(15, 50% default p25 duration) | 40 | 10 | 2 gems |

Rationale: these are multiple navigation/return/obstacle cycles, not a single
successful move. Eight seconds in progressed Asteroids covers many normal
spawn/fire cycles; fifteen seconds in Breakout must include repeated observed
paddle returns; Splat requires ten of its twenty remaining columns; Missile
must retain agency through a substantial portion of its 28-enemy salvo; and
Starfall must afford multiple gem/dodge decisions after the initial fall.
The 50% default lower-quartile floor rejects a population-wide duration collapse
even if an absolute floor is still met. Splat uses an absolute section floor
instead: a completed 20-column remainder legitimately takes less time than the
50-column default, so its successful completion must not be classified as an
early death. Its temporal and objective gates still require sustained play.
Fixed samples can contain up to two adverse early runs; those remain visible
in the minima and are not declared comfortable/fair. No progressed score,
level or old default/drought threshold was reduced/widened for these gates.

### Independent actual clearance gates

`completion.test.js` checks the facade's real victory state, not score or brick
counts, in the independent 180s/three-life rounds. Both default and progressed
Breakout/Splat must win in at least 10/12 trials, with at most two horizon
censors and at most one exhausted budget. These intentionally distinguish
positive first-life progress, first-life completion and completion with actual
retries. Every sample must be exactly one of won/censored/exhausted; censored
rounds have no imputed success or completion time. The reported duration
distribution mixes observed terminal durations and restricted censor durations,
so it is not an estimate of uncapped time-to-win.

The longer limit is necessary: default Splat's route alone takes about 55s at
its unchanged horizontal speed, making 45s full-route reachability impossible.
Breakout needs repeated paddle cycles and pursuit of scattered final bricks;
180s permits meaningful retries while bounding a stalled finish. A 10/12 floor
allows two real timeouts, not zero-win “reachability.” Asteroids/Starfall solo
and Missile defence are endurance/ongoing-level games, so universal terminal
victory is not their goal. Snake's 1,120-cell default board-fill victory is not
claimed by this bounded local human recipe; its tested reachability milestone
is repeated apple growth, not a Hamiltonian full-board solution. Full-board
Snake calibration remains an explicitly unvalidated product goal.

Default maximum objective drought is bounded at 12s Snake, 22s Breakout,
3s Splat, 8s Asteroids, 22s Missile and 20s Starfall. Those bands allow board
crossings, sparse initial gem falls and end-of-salvo delays, but remain below
the test horizon and reject a reward stream that permanently stalls after an
early success. They complement survival/recovery checks; neither a quick
death nor endless paddle-only points can be interpreted as good pacing.

Idle losses must occur in at least 9/12 samples. Idle quartile bounds are tight
for forced forward motion (Snake/Splat/Breakout) and broad for randomly arriving
hazards (Asteroids/Starfall/Missile). Twelve fixed seeds make quartiles and
failures repeatable at low runtime cost, **not** evidence for real population
percentages or rare-event confidence. Different polling phases matter even in
games whose initial geometry has no randomness.

### Recovery and retry probes

For both default and progressed context, one seeded near-miss scene is tried
at delays `0, .1, .2, .3, .4, .5, .6, .8, 1, 1.2, 1.6, 2` seconds, plus a
no-input counterfactual: **156 probe runs** total. Immediate ordinary input must
save the scene; the idle counterpart must lose a life (or the targeted city in
Missile); at least a 100ms sampled reaction delay must remain recoverable, and
some delayed action must fail. The 100ms floor rejects zero-room control bugs;
it is **not** a normative human reaction-time requirement. The 5Hz baseline and
manual playtest must evaluate whether such a narrow window is actually usable.

* Snake: head two cells from the right wall; one Up press, one-second observation.
* Breakout: ball at (600,340) descending at 210px/s before normal difficulty
  scaling; paddle starts at x=350. Hold Right until x>565; observe 1.3 seconds.
* Splat: player 120px before the current column and 80px below its lower gap
  edge. Hold Up, then release at the centre; observe 1.15 seconds.
* Asteroids: a single seeded rock starts at (535,280), flying left at 80px/s
  (110 progressed), with spawn grace disabled and no new spawn during the probe.
  Normal upward thrust must escape; observe 1.4 seconds.
* Missile: a missile at (400,330) threatens city 4 at 100px/s (150 progressed).
  One real click at (435,390), observe 2.1 seconds. Other cities are not
  artificially destroyed. Success means this city survives, not generic score.
* Starfall: star at (400,340) descending at 130px/s (430 progressed); Right
  input, 1.8 seconds. Other spawns/gems are removed to isolate dodge timing.

Fixtures edit scene setup only. No rescue rewrites position, life flags or AI
state during simulation. Probe speed overrides for Asteroids/Missile isolate
timing; they are not claims that those exact objects spawn naturally at those
speeds. `maxSafeDelay` is a grid lower bound on this scene's last successful
tested rescue, with 100–400ms grid spacing and a 16.67ms simulation step.

Separate three-life idle checks for the five host-life games require a real
first collision, exactly one charge, frozen snapshots over a two-second portion
of the retry countdown, at least 250ms of active recovery input without another
loss, and eventual budget exhaustion without an infinite resurrection loop.
Missile has city-based termination and **no host retry**, so that test is
intentionally inapplicable to it; its idle distribution and city-rescue probe
check its appropriate boundaries instead.

## Revised calibration: observed, not desired

Values below are from the seeded report, rounded to two decimals. Duration
vectors are `[min, p25, median, p75, max]`; `45*`/`60*` means horizon censoring,
and `22.42 finish` is successful section completion. Score vectors use the same
five order statistics. All default runs achieved a domain objective; progressed
Starfall did so in 11/12, the other games in 12/12.

| Game/context | Observed duration seconds | Score-gain distribution | Median objective count | Median choice-bearing polls |
| --- | --- | --- | ---: | ---: |
| Snake/default | [45*,45*,45*,45*,45*] | [8,10,11,14,17] | 11 | 449 |
| Snake/progressed | [5.07,45*,45*,45*,45*] | [2,14,16,19,23] | 16 | 447 |
| Breakout/default | [25.42,25.42,25.42,25.42,25.42] | [158,158,158,158,158] | 13 | 24 |
| Breakout/progressed | [33.48,33.48,33.48,33.48,33.48] | [446,446,446,446,446] | 41 | 68 |
| Splat/default | [45*,45*,45*,45*,45*] | [41,41,41,41,41] | 41 | 175 |
| Splat/progressed | [22.42 finish ×12] | [20,20,20,20,20] | 20 | 79 |
| Asteroids/default | [9.42,14.00,16.23,24.17,31.83] | [80,110,170,200,370] | 17 | 80 |
| Asteroids/progressed | [5.55,9.00,12.47,16.10,21.87] | [80,90,120,170,240] | 12 | 63 |
| Missile/default | [40.38,41.95,47.10,55.17,60*] | [420,435,510,670,875] | 24 | 80 |
| Missile/progressed | [26.42,29.73,33.37,36.58,52.05] | [300,350,425,635,895] | 27 | 60 |
| Starfall/default | [10.60,23.20,26.63,45*,45*] | [50,150,200,450,500] | 4 | 87 |
| Starfall/progressed | [5.05,26.30,35.05,44.88,45*] | [0,250,300,350,400] | 6 | 132 |

Observed progressed p25 (duration / actionable polls / one-second agency bins /
objectives): Snake 45 / 443 / 45 / 14; Breakout 33.48 / 67 / 28 / 41;
Splat 22.42 completed / 74 / 22 / 20; Asteroids 9 / 44 / 9 / 9;
Missile 29.73 / 57 / 12 / 22; Starfall 26.30 / 87 / 21 / 5. All six satisfy
the joint 10/12 sustained-run gate. Breakout makes thirteen paddle returns in
every default first life and six in every progressed first life. The seed phases
do not make its world random: identical score/duration results are reported
honestly rather than presented as independent random outcomes.

| Independent round | Actual wins / horizon censors / budget exhausted | Restricted active duration [min,p25,median,p75,max] seconds |
| --- | --- | --- |
| Breakout/default | 11 / 1 / 0 | [89.40,89.40,103.92,111.72,180*] |
| Breakout/progressed | 12 / 0 / 0 | [71.57,71.57,76.23,87.52,87.52] |
| Splat/default | 12 / 0 / 0 | [54.92,54.92,54.92,54.92,54.92] |
| Splat/progressed | 12 / 0 / 0 | [22.42,22.42,22.42,22.42,22.42] |

No Breakout sample wins during its first life; real retry resolution preserves
bricks and permits the measured full-round completions. Default seed 57637 is
still alive but unfinished at 180s and remains censored. It is not a victory.

**Production retry-pressure limitation:** Breakout's first respawn in every
clearance sample has speed 276.59px/s while `difficultyLevel` remains 8. A
separate seed-57 progressed trace observes score 506, level 8 and a 402.13px/s
ball immediately before loss, then the 276.59px/s replacement remains at that
speed on its next normal update. The current respawn path does not restore
the retained difficulty scaling to the new ball. The report exposes first
respawn speed/difficulty as diagnostics; this work neither fixes production
nor interprets retry-assisted wins as continued same-pressure clearance.
Within-life score progression is tested; monotonic pressure **across life
restarts** is a real uncorrected product limitation outside these owned files.

| Game | Default idle median seconds | Successful recovery delay default/progressed seconds |
| --- | ---: | ---: |
| Snake | 3.67 | .3 / .2 |
| Breakout | 1.27 | .6 / .4 |
| Splat | .92 | .5 / .5 |
| Asteroids | 8.68 | .8 / .4 |
| Missile | 22.02 | .8 / .5 |
| Starfall | 13.70 | 1 / .2 |

Observed maximum objective drought default/progressed (seconds): Snake
8.43/6.30, Breakout 2.53/6.08, Splat 1.13/1.13, Asteroids 5.62/4.47,
Missile 14.23/10.42, Starfall 11.78/14.32. Report distributions, not just these
maxima, before drawing conclusions about pacing.

**Review correction:** the old Breakout recipe collapsed at 2.32s and three
actionable polls across every progressed seed. Its 1.5s/two-poll emergency
threshold blessed that collapse and was inadequate. The revised input recipe,
unchanged score-60 fixture, temporal/return gates and independent completion
samples replace that inference; neither scores nor bands were widened to hide
it. A reflected projection alone did not cure the recurring hazard-brick path;
the modest inward return and properly timed motor pulses make a useful human
baseline, applied identically in both contexts. This is not a production fix.

**Remaining warnings requiring manual calibration:** all revised Breakout
first lives still end (25.42s default; 33.48s progressed). Retry-assisted
clearance does not prove these deaths feel fair, and one default full round
stalls beyond 180s. Snake seed 57637 loses at 5.07s, progressed Asteroids has a
5.55s early loss, and progressed Starfall seed 449 loses at 5.05s before any gem.
The majority-cohort gate does not erase those adverse tails. Progressed Starfall's
controlled dodge window is only .2 seconds. Its higher median survival does not
contradict increased star pressure; the paths and collection timing differ.
Missile advances to the next level in 11/12 defaults but only 1/12 progressed
fixtures; fresh-ammo level 4 is not proof of sustainable late-game economics.
Twelve default Snake/Splat samples are censored: do not report “infinite
survival” or “perfect players.” Splat's later section finishes sooner precisely
because fewer columns remain.

## Manual calibration / playtest procedure

No manual playtest is claimed by the automated results. Before approving a
balance change:

1. Save the exact revision, report JSON, device/control mode, frame rate, default
   settings, and seeds. Run the target suite and full suite. Investigate failed
   accounting/controller/lifecycle checks before adjusting balance thresholds.
2. Play all six default human modes in the browser. At minimum use three people
   with different arcade familiarity, two fresh rounds each, and both keyboard
   and pointer where supported. Give only the displayed control hints and one
   practice round; keep practice separate from recorded samples. Record active
   first-loss time, score, domain outcomes, unprompted decisions, missed controls,
   perceived unavoidable deaths and idle/confusing periods. Record actual
   participants/sample counts, not a claimed representative population.
3. Compare actual reached progression with the section fixtures listed above.
   For deliberate fixture replays use a development-only test/console setup or
   the headless harness; don't silently change production defaults. Note which
   stages each person reaches naturally, depletion of bricks/ammo, and whether
   the scripted policy has an unfair observation/motor advantage. Specifically
   inspect Breakout's early progressed hazard and final-brick pursuit,
   Starfall's score-150 dodge timing, and Missile's aircraft priorities/stock.
4. Replay missed recoveries. Ask players to describe the perceived warning,
   alternative action and ability to recover, then measure actual warning-to-hit
   time. Confirm the three-second retry really pauses the board, inputs work
   after it, and repeat losses stop at the configured budget. Check touch and
   low-refresh devices separately; these headless tests do not measure them.
5. Ask neutral questions: “What choices did you notice?”, “Which death seemed
   preventable?”, “Was there a period with nothing useful to do?”, “Would you
   retry, and why?” Do not tell participants the intended answer or convert a
   survival number into a fun score. Include frustration/engagement comments
   alongside, rather than inferred from, mechanical measurements.
6. If changing a baseline or threshold, document the hypothesis, old/new report,
   manual evidence, reason for the exact new band and checks of lower tails.
   Re-run the old seed set unchanged and a larger exploratory set (e.g. 100
   seeds), varying polling delays, before selecting any new fixed regression
   seeds. Never remove a difficult seed to achieve a pass. Preserve honest
   warnings and censor/completion distinctions.

Revised automated verification: the player suite contains 36 passing tests
(distribution, sustained lower-tail agency, progression, recovery, retry and
independent clearance checks plus input-boundary, motor/perception and
random-scope checks). Browser/device experience and human calibration remain
manual work; there is no assertion named or interpreted as “is fun.”
