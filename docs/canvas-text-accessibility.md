# Canvas text palette and the narrow-size decision (#78)

`src/rendering.js` owns `CANVAS_PALETTE`. All eight game views and the engine's
ready/countdown/pause/end overlay use it. Apply the **4.5:1 normal-text threshold
to every color**, even headings: CSS can shrink the 800px board below the
large-text threshold. The old `#64748b` text on `#080d18` was approximately
4.08:1; `muted` is now `#94a3b8` (approximately 7.6:1).

`drawText` gives light HUD text an opaque board-colored backplate. This keeps
its contrast stable when rocks, Splat columns, projectiles or other objects
pass underneath. Only `onBright` badges omit the plate: dark text is audited
against every bright Breakout power-up and live Missile battery. Destroyed
battery labels use light text with a plate, not dark text on dark gray.

## The label companion was removed

#78 originally shipped a *text companion*: whenever any drawn label fell below
12 CSS px, an unscaled `<ul>` of every string drawn that frame was inserted
after the board. It existed because at 375px a 12px label on an 800px board is
at most 5.6 CSS px, and Breakout's power-up badges are 7px to begin with.

It is gone. It was `aria-hidden` — a visual duplicate, never part of the #77
nonvisual contract — and it cost more than it bought:

- **Its contents were frame-volatile.** It listed *whatever had been drawn that
  frame*, deduplicated. Scores, lives, countdown text and brick badges appeared,
  reordered and vanished mid-round. Breakout looked like it was shuffling.
- **It moved the page.** Its height changed constantly, and the board's width is
  `min(100%, 68.57vh)`. Crossing the viewport height toggled the scrollbar,
  which changed the viewport width, which rescaled the board, which could flip
  the 12px threshold and hide or show the panel again. A feedback loop.
- **Its heading was internal jargon** ("Canvas labels (full size)") rendered into
  the middle of a game.

Contrast is not text-size evidence, and a duplicating, reflowing list is not
accessibility. `src/rendering.js` is now pure drawing: it creates and inserts
no DOM, at any board width or label size. Game state is already in the DOM where
it belongs — `#score`, `#lives`, `#roundStatus`, and the nonvisual panel.

The smallest text still drawn is 7px (`src/games/breakout/view.js`, power-up
badges). Enlarging those labels would overlap the playfield on narrow screens,
so the geometry is unchanged. If low-vision readability is pursued further, it
belongs with #77 and with human testing, not with a panel that reflows.

## Repeatable checks

```sh
node --test tests/rendering.test.js
npm test
npm run check
```

The rendering unit tests execute actual view draw calls for all 21 modes at
800/375/320 widths, check fill-time styles against backing shapes at 4.5:1,
exercise all six power-up colors, destroyed batteries, split-screen race and
builder route-limit text, and assert that drawing creates and inserts **no**
element. Host-frame tests cover the ready/countdown/pause/end overlays. Tests
use a recording canvas and lightweight DOM; they do not pretend to measure
browser layout.

For real browser layout, start a **dedicated** headless Chromium and server
(never attach to the desktop app's debugging browser):

```sh
python3 -m http.server 8781 --bind 127.0.0.1
chromium --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9321 --user-data-dir=/tmp/opencode/canvas-contrast-browser about:blank
CDP_URL=http://127.0.0.1:9321 COCKTAIL_URL=http://127.0.0.1:8781/ \
  node tests/canvas-rendering-browser.mjs
```

The rendering browser check fails if the browser/server is absent. It uses an
owned isolated context and verifies all 21 modes at 800/375/320 viewports in
both the ready and running postures: no label panel exists before or after 40
drawn frames, 40 frames leave the board's geometry and the number of elements
after the screen frame byte-identical, the board still paints its own labels,
and no label is drawn below the 7px floor. Remaining manual checks:
low-vision playtesting, readability while playing, and zoom/font overrides.
Existing cabinet overflow at 320px is #70 and is deliberately not claimed here.
