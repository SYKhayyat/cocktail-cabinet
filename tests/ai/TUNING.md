# Instance-level computer tuning (#44)

Every arcade model owns an `aiTuning` object copied from its exported
`<GAME>_AI_DEFAULTS`. Supply a **partial** constructor override or mutate fields
on that instance before the next policy decision:

```js
const game = new MissileModel({ aiTuning: { lead: 0.8, reloadMin: 0.4 } });
game.setSide("attacker");
game.reset();
game.aiTuning.reloadMax = 0.6;

const result = measureMissile({ runs: 150, aiTuning: { lead: 0 } });
```

All six `measure<Game>` fixtures accept the same partial `aiTuning` option.
Overrides are independent between models and are never written into the caller's
configuration or default objects. Starfall also copies its lane array. Round and
life resets clear decision state, **not tuning**. Updating a reaction/commit
interval does not rewrite a timer already running; it affects the next sample.

These are headless model experiment seams, not UI settings or a new difficulty
menu. Callers must supply meaningful values: finite nonnegative timings, ordered
min/max pairs, positive projectile speed and Snake movement scale, a positive
integer escape count, probabilities in `[0, 1]`, and nonempty Starfall lanes
inside the playfield. Zero perception/commit time and zero movement/thrust are
useful ablations. Breakout additionally supports `Infinity` lookahead bounces for
full prediction. Invalid configuration is not normalized or validated here.

Distances are pixels unless stated otherwise. Interval pairs sample uniformly,
retaining the existing random draw even when both endpoints are equal. Default
calculations, branch order, and random draw order are unchanged.

## Snake — `SNAKE_AI_DEFAULTS`

Only applies when the computer controls the snake (`apples`).

| Field | Default | Policy |
| --- | ---: | --- |
| `perceptionInterval` | 0.26 | Seconds between reads of the apple position |
| `commitMoves` | 3 | Movement decisions in a new-heading commitment; unsafe headings still yield |
| `moveIntervalScale` | 1 | Multiplies the existing score-based movement interval for the computer only |

`aiPerceptionInterval` and `aiCommitMoves` remain getter/setter aliases to the
same tuning fields for older callers. Fixture flags `perfectPerception` and
`noMomentum` also remain compatible, translating to zero tuning values;
explicit `aiTuning` wins if both are supplied. New experiments should use tuning.

## Breakout — `BREAKOUT_AI_DEFAULTS`

| Field | Default | Policy |
| --- | ---: | --- |
| `reactionMin`, `reactionMax` | 0.1, 0.18 | Blocks-mode seconds between looks |
| `speed` | 600 | Blocks-mode paddle speed, px/s |
| `versusReactionMin`, `versusReactionMax` | 0.14, 0.24 | Versus seconds to react/re-read an incoming ball |
| `versusSpeed` | 360 | Upper paddle speed, px/s |
| `lookaheadBounces` | 1 | Wall-bounce foresight in both modes |
| `arriveTolerance` | 22 | Landing-offset dead zone in both modes |
| `dwellMin`, `dwellMax` | 0.18, 0.38 | Blocks-mode seconds holding a movement decision |
| `initialReaction` | 0.08 | Blocks-mode initial/retry reaction delay |
| `idleCenterX` | 344 | Blocks-mode idle destination (paddle's left edge) |
| `idleTolerance` | 8 | Idle destination dead zone |

`computerReaction`, `computerDwell`, and versus equivalents are live clocks, not
configuration aliases. Set the tuning seam instead of rewriting those clocks.
Versus has no additional dwell mechanism; it retains its original reaction gate.

## Asteroids — `ASTEROIDS_AI_DEFAULTS`

| Field | Default | Policy |
| --- | ---: | --- |
| `turnRate` | 3.6 | Heading change limit, radians/s |
| `reactionMin`, `reactionMax` | 0.18, 0.38 | Seconds holding the initial aim on target acquisition |
| `dodgeRange` | 105 | Distance at which a rock/duel hazard triggers escape |
| `dodgeCommitMin`, `dodgeCommitMax` | 0.14, 0.3 | Seconds holding a swerve |
| `escapeChoices` | 8 | Number of discrete escape headings around a full circle |
| `speed`, `versusSpeed` | 165, 105 | Computer thrust speed, px/s, rocks/versus modes |
| `initialShotDelay` | 1.3 | Seconds before the first shot of a round |
| `shotInterval`, `versusShotInterval` | 1.3, 1.1 | Base seconds between shots, rocks/versus modes |
| `shotJitter` | 0.3 | Uniform additional seconds per shot |
| `noTargetShotDelay` | 0.5 | Seconds until a firing retry when no target exists |

Shots still follow the actual bounded ship heading; tuning does not add aim-error
dice. The fixture's legacy `dodgeRange` option only defines proximity exposure,
not ship policy. Keep its default 105 when comparing `aiTuning.dodgeRange` runs.

## Missile Command — `MISSILE_AI_DEFAULTS`

These factors govern the computer battery in `attacker` mode. Human interceptor
speeds/ammunition, enemy wave composition, shared collision geometry and level
progression remain game rules rather than computer-policy tuning.

| Field | Default | Policy |
| --- | ---: | --- |
| `interceptorSpeed` | 245 | Computer interceptor speed, px/s; also used to estimate flight time |
| `lead` | 0.62 | Fraction of estimated flight time used to lead the incoming missile |
| `reloadMin`, `reloadMax` | 0.5, 0.85 | Seconds between loaded firing opportunities |

Target priority stays deterministic (nearest remaining destination distance);
there is no artificial miss probability.

## Splat — `SPLAT_AI_DEFAULTS`

Applies to the builder's ball and the race's computer ball.

| Field | Default | Policy |
| --- | ---: | --- |
| `reactionMin`, `reactionMax` | 0.12, 0.3 | Seconds holding the remembered gap during reaction |
| `commitMin`, `commitMax` | 0.18, 0.42 | Seconds before another gap can be chosen |
| `lookahead` | 260 | Distance at which a gap engages the decision policy |
| `thrust` | 620 | Vertical acceleration limit, px/s² |
| `maxFall` | 360 | Absolute vertical speed limit, px/s |
| `velocityGain` | 4 | Converts vertical position error to desired velocity, 1/s |
| `targetTolerance` | 24 | Gap-center change needed to trigger a new decision |
| `horizontalSpeed` | 120 | Computer forward speed, px/s; human race speed is unchanged |

Lookahead gates **replanning**, not all steering: the existing fallback still aims
at the next gap when no remembered target is being held. Gravity and collision
geometry are shared game physics and are not tuning factors.

## Starfall — `STARFALL_AI_DEFAULTS`

| Field | Default | Policy |
| --- | ---: | --- |
| `perceptionMin`, `perceptionMax` | 0.1, 0.24 | Seconds between snapshots of visible stars |
| `visionHeight` | 300 | Minimum fallen-star y visible to the computer |
| `laneCommitMin`, `laneCommitMax` | 0.55, 0.95 | Seconds holding a lane, including an unsafe one |
| `laneWidth` | 45 | Horizontal star clearance used to judge candidate/current lanes |
| `speed` | 220 | Runner movement speed, px/s |
| `targetLock` | 0.45 | Seconds between reconsidering an existing safe gem target |
| `gemPastMargin` | 50 | How far below the runner a gem remains a pursuit target |
| `gemVerticalWeight` | 0.15 | Vertical-distance weight in the gem pursuit cost |
| `gemSwitchAdvantage` | 25 | Cost improvement required before considering a different gem |
| `gemSwitchFirstChance` | 0.5 | Cumulative threshold for preferring the best improved gem |
| `gemSwitchSecondChance` | 0.8 | Cumulative threshold for preferring the second improved gem |
| `gemSwitchThirdChance` | 0.9 | Cumulative threshold for preferring the third improved gem |
| `lanes` | `[20, 160, 300, 440, 580, 720, 780]` | Candidate runner destinations; original edge escape fallback stays intact |
| `arriveTolerance` | 4 | Distance at which the runner snaps to the selected lane |

The gem preference thresholds preserve the existing pursuit policy, not random
collision/miss switches. The legacy exported `RUNNER_PERCEPTION_MIN` remains a
default alias; live policy reads the instance object.

### Accounting versus policy

Policy clearance (`laneWidth`) is deliberately distinct from actual collision
radii. Starfall's outcome detector retains its original **fixed 0.95-second**
collision-course horizon, independent of a tuned lane commitment. Otherwise a
longer commitment could appear to improve dodge rate merely by reclassifying more
unrelated stars as threats. Likewise Asteroids proximity exposure stays at the
fixture's specified distance. See [ACCOUNTING.md](ACCOUNTING.md).

## Regression evidence

`tuning.test.js` checks every exposed factor at a targeted decision/movement
boundary, per-instance isolation, reset persistence, legacy compatibility, and
effective injection through every fixture. It compares explicit defaults with
implicit defaults on identical seeded runs. Existing six `*.test.js` policy
suites continue to enforce their original seeded bands (including the corrected
event-accounting baselines); no bands are widened for tuning.

```sh
node --test tests/ai/*.test.js
node --test
npm run check
npm run test:browser
```
