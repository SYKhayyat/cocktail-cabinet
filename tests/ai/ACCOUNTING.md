# Seeded outcome accounting (#53, #58)

The four event-based fixtures drain each model's bounded `eventLog` every update.
Lamp is not here: it has no opponent and therefore no `eventLog`. Its outcome
events (coin scored, wisp refilled, hazard spent a life, light ran out, exit
reached) are asserted directly against the model in `tests/models.test.js`.
Entities have deterministic IDs, and Missile/Starfall entities keep their first
terminal outcome. An array shrinking or a score changing is not evidence of an
interception, impact, dodge, collection, or clearance.

- **Asteroids:** `hits` are actual `life-loss` events, resolved through
  `handleLifeLoss()` and `resetAfterLife()`. Rocks wrap, so they do not have a
  terminal dodge outcome. `hazardProximityFrames` is explicitly a lower-level
  exposure measure: a rock is within 105 pixels, including protected frames.
  It is not a count of collision opportunities. Respawn clearance is despawn,
  not destruction or a second hit. The fixture supplies three initial rocks;
  it does not replenish them.
- **Missile:** interceptions, arrivals at target objects, and off-screen expiry
  are distinct outcomes. `leakRate` is the share of resolved attacks reaching
  their target rather than being intercepted, not the percentage of launched
  attacks or destroyed cities. An attack may arrive at an already-destroyed
  target; that is still an arrival, not additional destruction. The model now
  resolves that arrival instead of retaining a missile indefinitely. Intercepted
  attacks cannot also damage a target during the same update.
- **Starfall:** a threat is projected into the runner's collision corridor
  (runner radius + star radius) within one maximum lane-commitment window.
  Horizontal alignment high on the board does not qualify. Only a previously
  threatening star passing the bottom is a `star-dodged` outcome; lateral expiry,
  unrelated bottom expiry, gesture cancellation and life-reset cleanup are not
  dodges. Dodge/collision rates use **resolved threats**, excluding unfinished or
  despawned entities. Gems are collected, passed below the runner's collision
  row, expired, or despawned. `gemCollectionRate` is collected / (collected +
  passed), not a rate over all removals or all spawned gems. It measures gems
  reaching the row, not how many were within horizontal reach.
- **Splat:** `column-cleared` is counted in the update that clears the gate,
  including the final update. A column can be attempted again after a loss, so
  records include owner, column ID and attempt. Collisions are deduplicated per
  owner until the retry, and Builder's own configured budget decides “unsolved.”

`lifecycle.mjs` implements the headless loss handshake: the model consumes the
loss edge, the appropriate owner spends a life, then either the model respawns
or the fixture stops at the terminal state. Countdown time is omitted because
the game is frozen during it; fixture durations are **active gameplay time**.
Fixtures never clear `lifeLost` to continue a run.

## Calibration (2026-10-05)

No AI speed, reaction, steering, spawning or geometry constants were retuned.
Removing Asteroids' obsolete mistake-clock draw changes its seeded random
stream, as expected; the dead fields no longer pretend to be part of a policy.
The prior Asteroids band counted repeat collision frames, while Starfall's
prior percentages included unrelated removals and pre-window alignment.

With seed `1000 + run * 7919`, default timestep/horizon, and three lives:

| Fixture | Runs | Corrected baseline | Band change |
| --- | ---: | --- | --- |
| Asteroids | 150 | 27 losses / 0.18 per run; 0.37 per 1,000 nearby-rock frames | 0.05–0.4 losses/run; 0.1–1 per 1,000 proximity frames |
| Missile | 150 | 208 interceptions, 472 target arrivals, 2,249 shots; 69.4% leak rate | Existing shot/leak bands unchanged |
| Starfall | 150 | 25 collisions, 41 dodges; 62.1% dodge / 37.9% collision on resolved threats; 14.2% gem collection | 45–80% dodge; 20–55% collision; 8–25% gem collection |
| Splat generated | 100 | 50 gates/run, zero losses, 100% solved | Existing bands unchanged |
| Splat hard | 100 | 45.4 clearances/run, 1.12 losses/run, 61% solved | Existing bands unchanged |

`event-accounting.test.js` separately checks the event categories, cleanup
exclusion, multiple collisions versus one life edge, retry exhaustion,
respawn identities, final-update clearance, and deterministic repeatability.
