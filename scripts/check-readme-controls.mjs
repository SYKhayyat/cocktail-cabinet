// Keeps README.md honest about the game's controls.
//
// The in-page "How to play" panel is generated from each controller's
// controlHint(), so it cannot drift from the code. README.md is prose and
// therefore can drift. This suite parses its games table and checks that every
// advertised mode label and control hint still exists in the source.
//
// Failing here means either the README is out of date or a game genuinely
// changed its controls -- both worth noticing in CI rather than at review time.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { SnakeGame } from "../src/games/snake/index.js";
import { BreakoutGame } from "../src/games/breakout/index.js";
import { SplatGame } from "../src/games/splat/index.js";
import { AsteroidsGame } from "../src/games/asteroids/index.js";
import { MissileCommandGame } from "../src/games/missile/index.js";
import { ImitationGame } from "../src/games/imitation/index.js";
import { StarfallGame } from "../src/games/starfall/index.js";
import { LampGame } from "../src/games/lamp/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

const GAMES = [
  { id: "snake", label: "Snake", game: new SnakeGame() },
  { id: "breakout", label: "Breakout", game: new BreakoutGame() },
  { id: "splat", label: "Splat", game: new SplatGame() },
  { id: "asteroids", label: "Asteroids", game: new AsteroidsGame() },
  { id: "missile", label: "Missile Command", game: new MissileCommandGame() },
  { id: "imitation", label: "Imitation", game: new ImitationGame() },
  { id: "starfall", label: "Starfall", game: new StarfallGame() },
  { id: "lamp", label: "Lamp", game: new LampGame() }
];

// Normalises a single control hint key into the vocabulary the README uses.
function normalizeKey(key) {
  if (key.startsWith("Arrow")) return "Arrows";
  if (["w", "a", "s", "d"].includes(key.toLowerCase())) return "WASD";
  if (key === " ") return "Space";
  if (key === "Mouse") return "Mouse";
  return key;
}

function tableRow(label) {
  const row = readme.split("\n").find((line) => line.startsWith(`| **${label}** |`));
  if (!row) throw new Error(`README.md has no games-table row for ${label}`);
  const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
  return { modes: cells[1] ?? "", controls: cells[2] ?? "" };
}

const failures = [];

for (const { id, label, game } of GAMES) {
  const row = tableRow(label);

  for (const mode of game.modes.filter((entry) => entry.available !== false)) {
    // The table lists each mode value in backticks, so the check is exact
    // rather than a fuzzy prose match.
    if (!row.modes.includes(`\`${mode.value}\``)) {
      failures.push(`README.md: ${label} does not list its ${mode.value} mode`);
    }
    // Inspect every registered side, not just the constructor's default.
    // Setting the model value avoids opening Imitation transports in a docs check.
    game.model.side = mode.value;
    for (const { keys } of game.controlHint()) {
      for (const key of keys) {
        const token = normalizeKey(key);
        if (!row.controls.includes(token)) {
          failures.push(`README.md: ${label}/${mode.value} does not document ${token} (from ${key})`);
        }
      }
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`README drift: ${failure}`);
  console.error(`\n${failures.length} README/code mismatch(es). Update README.md or the game's controlHint().`);
  process.exit(1);
}

console.log(`README controls table matches all ${GAMES.length} games' registered modes and control hints`);
