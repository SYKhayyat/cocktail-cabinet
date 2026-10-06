# Canvas text palette and narrow-size policy (#78)

`src/rendering.js` owns `CANVAS_PALETTE`. All seven game views and the engine's
ready/countdown/pause/end overlay use it. Apply the **4.5:1 normal-text threshold
to every color**, even headings: CSS can shrink the 800px board below the
large-text threshold. The old `#64748b` text on `#080d18` was approximately
4.08:1; `muted` is now `#94a3b8` (approximately 7.6:1).

`drawText` gives light HUD text an opaque board-colored backplate. This keeps
its contrast stable when rocks, Splat columns, projectiles or other objects
pass underneath. Only `onBright` badges omit the plate: dark text is audited
against every bright Breakout power-up and live Missile battery. Destroyed
battery labels use light text with a plate, not dark text on dark gray.

Contrast is not text-size evidence. At 375px a 12px label on an 800px board is
at most 5.625 CSS px; at 320px it is at most 4.8px. We preserve canvas geometry
to avoid overlapping gameplay, rather than enlarging or horizontally squeezing
canvas text. The engine brackets each drawn frame with `beginCanvasTextFrame`
and `endCanvasTextFrame`. Whenever **any** drawn label falls below 12 CSS px,
an unscaled visual companion below the screen copies **all actual drawn
strings**, including live scores/lives and the lifecycle overlay. It uses at
least 14 CSS px, wraps long strings, and never shrinks with the canvas. This
also covers the 7px Breakout badges on desktop. Duplicate strings are combined;
Missile badges include battery identity so repeated numbers remain meaningful.
Updates replace stale game strings and skip unchanged DOM contents.

The companion is `aria-hidden`: it is a visual duplicate, **not** the nonvisual
game-status contract owned by #77. Imitation already presents chat and status
in DOM and hides its canvas; the companion follows that visibility. Neither
this fix nor a default-size screenshot establishes full game accessibility.

## Repeatable checks

```sh
node --test tests/rendering.test.js
npm test
npm run check
```

The 23 rendering unit tests execute actual view draw calls for all 20 modes
at 800/375/320 widths, check fill-time styles against backing shapes at 4.5:1,
exercise all six power-up colors, destroyed batteries, split-screen race and
builder route-limit text, and verify copies of every drawn string. Host-frame
tests cover ready/countdown/pause/end overlays. Tests use a recording canvas
and lightweight DOM; they do not pretend to measure browser layout.

For real browser layout, start a **dedicated** headless Chromium and server
(never attach to the desktop app's debugging browser):

```sh
python3 -m http.server 8781 --bind 127.0.0.1
chromium --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9321 --user-data-dir=/tmp/opencode/canvas-contrast-browser about:blank
CDP_URL=http://127.0.0.1:9321 COCKTAIL_URL=http://127.0.0.1:8781/ \
  node tests/canvas-rendering-browser.mjs
REQUIRE_BROWSER=1 CDP_URL=http://127.0.0.1:9321 COCKTAIL_URL=http://127.0.0.1:8781/ \
  npm run test:browser
```

The rendering browser check fails if the browser/server is absent. It uses
an owned isolated context and verifies all 20 modes at 800/375/320 viewports:
actual CSS font sizes >=14px, wrapping/no companion overflow, drawn-string parity,
lifecycle overlay copies, and no stale companion on hidden Imitation canvas.
Remaining manual checks: low-vision playtesting, readability while playing,
zoom/font overrides, and combined screen-reader behavior after #77 integration.

## Verification on this branch

- `npm test`: **336 passed**, no skips (includes all 23 new rendering tests).
- `npm run check`: passed syntax, model boundary, dead-code and README checks.
- `node tests/canvas-rendering-browser.mjs`: **60 mode/viewport cases passed**
  against dedicated Chromium 152 on port 9321.
- Existing `npm run test:browser`: first eight suites passed, then failed at
  `tests/browser-smoke.mjs:706` (Splat builder click expected one added column,
  got zero). The same failure was reproduced with **unmodified HEAD source**
  served from `git show` in a separate server, without reverting any edits.
  This is a baseline Builder/smoke-fixture mismatch, not a #78 pass claim.

The real-browser rendering check isolates companion overflow by measuring
the page with and without it. Existing Splat cabinet overflow remains outside
this fix (#70); the companion itself fits the viewport and adds no overflow.
