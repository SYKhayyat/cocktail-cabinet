import { clamp } from "../../geometry.js";

// The drawing surface is a fixed 800x560 canvas that CSS scales, exactly as in
// every other game, so the model works in maze tiles and never learns a pixel
// size. The view converts.
export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 560;

// Bands reserved above and below the maze for the readouts. Two lines are needed
// under it: the status sentence, and the out-of-light band above it.
export const LAMP_TOP = 44;
export const LAMP_BOTTOM = 60;

// Feel, not content. These are the numbers a designer would want to reach for
// when changing how Lamp reads, and they are deliberately not settings: the
// player picks the size and the contents of a maze, not how a pulse feels.
// Exported and frozen so a test can assert the model never writes to them.
export const LAMP_TUNING = Object.freeze({
  lightMax: 80,
  lightDrain: 10,
  wispLight: 25,
  tapDuration: 1.4,
  fadeTime: 0.6,
  fadeDrainScale: 0.6,
  walkSpeed: 4.6,
  startFlash: 2,
  // A key has a clean press edge and a mouse does not: a click is a press held
  // for as long as the hand takes. Past this the controller treats a held
  // button as a deliberate hold, and before it the same press is only a tap.
  pointerHoldDelay: 0.3,
  bodyRadius: 0.3,
  coinRadius: 0.42,
  wispRadius: 0.45,
  hazardRadius: 0.38,
  exitTriggerRadius: 0.4,
  exitClearRadius: 2,
  braidChance: 0.75
});

// A geometric ladder, and every bundle is a whole maze rather than four
// separate numbers, so choosing one can never produce a configuration that no
// preset would. "custom" is the fifth dropdown option and hands the numbers back
// to the player.
//
// Two things forced the shape of this. The board is 800x560 with room for a
// 752x456 maze, so a square maze is height-limited and every square size drew
// an identical 456x456 block in the middle of the screen -- three options that
// looked the same. The bundles are therefore wider than they are tall, roughly
// the board's own 1.65 aspect, so a maze fills the space it is given and the
// sizes are obvious at a glance.
//
// And the wisps scale with the maze. Light is only spent while the lamp is lit,
// so the cost of a journey is the number of pulses needed to walk it blind,
// which grows with the route; a 17x17's five wisps would strand a player in the
// dark by the third corridor of a 53x31.
export const LAMP_PRESETS = Object.freeze({
  small: Object.freeze({ cols: 21, rows: 13, coins: 8, hazards: 8, wisps: 4 }),
  medium: Object.freeze({ cols: 29, rows: 17, coins: 16, hazards: 14, wisps: 6 }),
  big: Object.freeze({ cols: 41, rows: 25, coins: 34, hazards: 30, wisps: 16 }),
  huge: Object.freeze({ cols: 53, rows: 31, coins: 52, hazards: 46, wisps: 24 })
});

const PRESET_CHOICES = ["custom", "small", "medium", "big", "huge"];

export const LAMP_MODES = [
  { value: "walk", label: "Solo — walk blind to the exit" },
  // Reaching the exit does not end this one. It opens the next maze in the same
  // breath, with the light, the coins and the lives exactly as they were, so
  // the run is a question of how far a single lamp can get.
  { value: "continue", label: "Chained — clear mazes back to back" }
];

export const LAMP_SETTINGS = {
  preset: {
    type: "select",
    label: "Difficulty",
    default: "medium",
    options: [
      { value: "custom", label: "Custom — pick the numbers below" },
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "big", label: "Big" },
      { value: "huge", label: "Huge" }
    ]
  },
  // The recursive backtracker walks a 2-cell lattice, so both dimensions have
  // to be odd. Even numbers are rejected rather than silently rounded, because
  // a rounded maze is not the maze the player asked for.
  cols: { label: "Maze columns", min: 11, max: 61, step: 2, default: 25 },
  rows: { label: "Maze rows", min: 11, max: 51, step: 2, default: 17 },
  coins: { label: "Coins", min: 0, max: 140, step: 1, default: 16 },
  hazards: { label: "Hazards", min: 0, max: 100, step: 1, default: 14 },
  wisps: { label: "Light wisps", min: 0, max: 40, step: 1, default: 6 }
};

const DIRECTIONS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function shuffle(list) {
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

function key(x, y) { return `${x},${y}`; }

export class LampModel {
  constructor() {
    this.id = "lamp";
    this.title = "Lamp";
    this.description = "A game of borrowed light. Tap to pulse — the maze reveals for a moment, then fades. Hold to keep it lit as long as you dare. While it is lit you cannot move, so a pulse buys a moment of sight you cannot spend on walking; walk in the dark. Light only burns while the lamp is lit, and a cyan wisp refills it. Reach the green exit. Gold coins are points. Red hazards spend a life and leave your light and your place untouched.";
    this.side = "walk";
    this.score = 0;
    this.gameOver = false;
    this.lifeLost = false;
    this.won = false;
    this.lossReason = "";
    this.lightMax = LAMP_TUNING.lightMax;
    this.wispLight = LAMP_TUNING.wispLight;
    this.maze = [];
    this.cols = LAMP_PRESETS.medium.cols;
    this.rows = LAMP_PRESETS.medium.rows;
    this.player = { x: 1.5, y: 1.5 };
    this.exit = { x: 1.5, y: 1.5 };
    this.exitTile = { x: 1, y: 1 };
    this.coins = [];
    this.wisps = [];
    this.hazards = [];
    this.light = LAMP_TUNING.lightMax;
    this.wispsCollected = 0;
    this.mazesCleared = 0;
    this.lampHeld = false;
    this.fullRemaining = 0;
    this.fadeRemaining = 0;
    this.fadePending = false;
    this.revealRemaining = 0;
    this.pendingSettings = { preset: "medium", ...LAMP_PRESETS.medium };
    this.roundSettings = { ...this.pendingSettings };
  }

  get modes() { return LAMP_MODES; }
  get sides() { return LAMP_MODES.map((mode) => mode.value); }
  get settings() { return LAMP_SETTINGS; }

  sideLabel() { return this.modes.find((mode) => mode.value === this.side)?.label || LAMP_MODES[0].label; }
  setSide(side) { if (this.sides.includes(side)) this.side = side; }

  // The difficulty dropdown either names a whole bundle or hands the numbers
  // back. Validating here rather than in the view is what lets the shell grey
  // the number fields out and still show what the chosen preset actually set.
  validateSettings(values = {}) {
    const preset = String(values.preset ?? "medium");
    if (!PRESET_CHOICES.includes(preset)) return null;
    if (preset !== "custom") return { preset, ...LAMP_PRESETS[preset] };
    const read = (name) => {
      const descriptor = LAMP_SETTINGS[name];
      const value = Number(values[name]);
      if (!Number.isInteger(value) || value < descriptor.min || value > descriptor.max) return null;
      return value;
    };
    const cols = read("cols");
    const rows = read("rows");
    const coins = read("coins");
    const hazards = read("hazards");
    const wisps = read("wisps");
    if (cols === null || rows === null || coins === null || hazards === null || wisps === null) return null;
    if (cols % 2 === 0 || rows % 2 === 0) return null;
    return { preset, cols, rows, coins, hazards, wisps };
  }

  // Public API: validates exactly as validateSettings does and keeps the
  // previous value for anything invalid, so no caller can install a maze the
  // generator cannot walk.
  setSettings(settings = {}) {
    const validated = this.validateSettings({ ...this.pendingSettings, ...settings });
    if (!validated) return false;
    this.pendingSettings = validated;
    return true;
  }

  applyPendingSettings() {
    this.roundSettings = { ...this.pendingSettings };
    this.cols = this.roundSettings.cols;
    this.rows = this.roundSettings.rows;
  }

  reset() {
    this.applyPendingSettings();
    this.buildLevel();
    this.score = 0;
    this.wispsCollected = 0;
    this.mazesCleared = 0;
    this.light = LAMP_TUNING.lightMax;
    this.gameOver = false;
    this.lifeLost = false;
    this.won = false;
    this.lossReason = "";
    this.lampHeld = false;
    this.fullRemaining = 0;
    this.fadeRemaining = 0;
    this.fadePending = false;
    // One free look at the start of every life: it teaches the central rule
    // before it can cost anything, because the reveal itself is what stops you
    // walking.
    this.revealRemaining = LAMP_TUNING.startFlash;
  }

  // A life costs the counter and nothing else. The maze, the position, the
  // coins and the remaining light are exactly as they were left, so a death is
  // a pause with the run still intact rather than a walk from the beginning.
  restartAfterLife() {
    this.lifeLost = false;
    this.lossReason = "";
    this.lampHeld = false;
    this.fullRemaining = 0;
    this.fadeRemaining = 0;
    this.fadePending = false;
  }

  handleLifeLoss() {
    this.lifeLost = false;
    return { gameOver: false, message: "A hazard spent itself on you. Your lamp keeps its light and you keep your place. Starting again in 3…" };
  }

  // Where the maze sits on the board, in tiles. This lives in the model rather
  // than the view so that "do the four sizes actually look different" is a
  // question a test can ask, instead of a formula duplicated in two places that
  // could disagree.
  layout() {
    const width = BOARD_WIDTH - 48;
    const height = BOARD_HEIGHT - LAMP_TOP - LAMP_BOTTOM;
    const tile = Math.min(width / this.cols, height / this.rows);
    return {
      tile,
      width,
      height,
      originX: (BOARD_WIDTH - tile * this.cols) / 2,
      originY: LAMP_TOP + (height - tile * this.rows) / 2
    };
  }

  // ---------------------------------------------------------------------
  // Maze
  // ---------------------------------------------------------------------

  // Nothing is walkable until a maze exists, so an empty grid reads as solid
  // rather than throwing at a caller that stepped before reset().
  isSolid(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    const row = this.maze[y];
    return !row || row[x] === 1;
  }

  generateMaze() {
    const grid = [];
    for (let y = 0; y < this.rows; y += 1) grid.push(new Array(this.cols).fill(1));
    const stack = [{ x: 1, y: 1 }];
    grid[1][1] = 0;
    while (stack.length) {
      const current = stack[stack.length - 1];
      const options = [];
      for (const [dx, dy] of DIRECTIONS) {
        const nx = current.x + dx * 2;
        const ny = current.y + dy * 2;
        if (nx > 0 && nx < this.cols - 1 && ny > 0 && ny < this.rows - 1 && grid[ny][nx] === 1) {
          options.push({ x: nx, y: ny, dx, dy });
        }
      }
      if (!options.length) { stack.pop(); continue; }
      const pick = options[Math.floor(Math.random() * options.length)];
      grid[current.y + pick.dy][current.x + pick.dx] = 0;
      grid[pick.y][pick.x] = 0;
      stack.push({ x: pick.x, y: pick.y });
    }
    return grid;
  }

  openNeighbours(grid, x, y) {
    let open = 0;
    for (const [dx, dy] of DIRECTIONS) if (grid[y + dy][x + dx] === 0) open += 1;
    return open;
  }

  findDeadEnds(grid) {
    const ends = [];
    for (let y = 1; y < this.rows - 1; y += 1) {
      for (let x = 1; x < this.cols - 1; x += 1) {
        if (grid[y][x] !== 0) continue;
        if (this.openNeighbours(grid, x, y) === 1) ends.push({ x, y });
      }
    }
    return ends;
  }

  // Opens dead ends into loops so a wrong turn is a detour rather than a dead
  // round trip. Coin tiles stay dead ends: a coin you have to turn around for
  // is the point of them.
  braidMaze(grid, reserved) {
    for (const end of shuffle(this.findDeadEnds(grid).slice())) {
      if (reserved.has(key(end.x, end.y))) continue;
      if (Math.random() > LAMP_TUNING.braidChance) continue;
      for (const [dx, dy] of shuffle(DIRECTIONS.slice())) {
        const wallX = end.x + dx;
        const wallY = end.y + dy;
        const nextX = end.x + dx * 2;
        const nextY = end.y + dy * 2;
        if (nextX > 0 && nextX < this.cols - 1 && nextY > 0 && nextY < this.rows - 1 && grid[nextY][nextX] === 0 && grid[wallY][wallX] === 1) {
          grid[wallY][wallX] = 0;
          break;
        }
      }
    }
  }

  // The tiles of the shortest route between two floor tiles, treating
  // `blocked` as walls, or null when there is no such route.
  //
  // Null is the whole point of this function and it has to be distinguishable
  // from a route. An earlier version fell out of the reconstruction loop with
  // the goal alone in hand, so an unreachable goal came back as a one-tile route
  // rather than nothing -- and the solvability check that calls it tested
  // `length > 0`, which is true either way. It reported every maze as solvable
  // while never having checked one.
  routeBetween(grid, start, goal, blocked = new Set()) {
    const cameFrom = new Map();
    const seen = new Set([key(start.x, start.y)]);
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) {
      const cell = queue[head];
      if (cell.x === goal.x && cell.y === goal.y) break;
      for (const [dx, dy] of DIRECTIONS) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const next = key(nx, ny);
        if (grid[ny][nx] !== 0 || blocked.has(next) || seen.has(next)) continue;
        seen.add(next);
        cameFrom.set(next, cell);
        queue.push({ x: nx, y: ny });
      }
    }
    if (!cameFrom.has(key(goal.x, goal.y))) return null;
    const route = [];
    let current = goal;
    while (current && (current.x !== start.x || current.y !== start.y)) {
      route.push(key(current.x, current.y));
      current = cameFrom.get(key(current.x, current.y));
    }
    return route;
  }

  distancesFrom(grid, start) {
    const distances = Array.from({ length: this.rows }, () => new Array(this.cols).fill(-1));
    const queue = [start];
    distances[start.y][start.x] = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const cell = queue[head];
      for (const [dx, dy] of DIRECTIONS) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        if (grid[ny][nx] !== 0 || distances[ny][nx] !== -1) continue;
        distances[ny][nx] = distances[cell.y][cell.x] + 1;
        queue.push({ x: nx, y: ny });
      }
    }
    return distances;
  }

  // Order matters, and it matters for a reason that is easy to regress:
  //
  //   1. perfect maze
  //   2. reserve dead ends for coins
  //   3. braid everything else
  //   4. only NOW choose the exit, as the farthest reachable tile of the
  //      finished maze
  //   5. keep a clear bubble around it
  //
  // Choosing the exit before braiding used to pick a tile that braiding could
  // then open into a through-corridor, so the player could walk across the exit
  // on the way to a wisp and win by accident. Choosing it afterwards means it is
  // a real far tile of the maze that actually exists.
  buildLevel() {
    const grid = this.generateMaze();

    // Reserve the dead ends that could become coins so braiding leaves them as
    // dead ends. A coin you have to turn around for is worth more than one on
    // the way past, so they are placed before anything else takes the floor.
    const reservable = shuffle(this.findDeadEnds(grid).filter((tile) => !(tile.x === 1 && tile.y === 1)));
    const coinEnds = reservable.slice(0, Math.min(this.roundSettings.coins, reservable.length));
    this.braidMaze(grid, new Set(coinEnds.map((tile) => key(tile.x, tile.y))));

    const distances = this.distancesFrom(grid, { x: 1, y: 1 });
    let farthest = { x: 1, y: 1, d: -1 };
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (distances[y][x] > farthest.d) farthest = { x, y, d: distances[y][x] };
      }
    }
    this.exitTile = { x: farthest.x, y: farthest.y };
    this.exit = { x: farthest.x + 0.5, y: farthest.y + 0.5 };

    // Nothing is placed near the exit, and the trigger radius is deliberately
    // small so that reaching the exit means standing on it.
    const nearExit = (tile) => Math.abs(tile.x - farthest.x) + Math.abs(tile.y - farthest.y) <= LAMP_TUNING.exitClearRadius;

    this.maze = grid;
    this.player = { x: 1.5, y: 1.5 };

    const corridors = [];
    for (let y = 1; y < this.rows - 1; y += 1) {
      for (let x = 1; x < this.cols - 1; x += 1) {
        if (grid[y][x] !== 0) continue;
        if (x === 1 && y === 1) continue;
        if (nearExit({ x, y })) continue;
        if (this.openNeighbours(grid, x, y) >= 2) corridors.push({ x, y });
      }
    }
    const deadEnds = this.findDeadEnds(grid).filter((tile) => !(tile.x === 1 && tile.y === 1) && !nearExit(tile));

    const placed = new Set();
    const take = (list, limit) => {
      const chosen = [];
      for (const tile of list) {
        if (chosen.length >= limit) break;
        const tileKey = key(tile.x, tile.y);
        if (placed.has(tileKey)) continue;
        placed.add(tileKey);
        chosen.push(tile);
      }
      return chosen;
    };

    // Every hazard is checked before it is kept.
    //
    // Placing them at random meant a maze could wall off the only way to the
    // exit, and a run lost to a door it could not open is not a decision the
    // player made. Banning one nominated route instead would starve a small
    // maze of hazards entirely, so each candidate is placed provisionally and
    // dropped unless a route to the exit still avoids every hazard so far.
    //
    // The guarantee is only that a way through exists. The player still has to
    // find it, still has to walk it blind, and every other way is still lethal.
    const goal = { x: farthest.x, y: farthest.y };
    const hazardCandidates = [...shuffle(corridors.slice()), ...shuffle(deadEnds.slice())];
    const blocked = new Set();
    this.hazards = [];
    for (const tile of hazardCandidates) {
      if (this.hazards.length >= this.roundSettings.hazards) break;
      const tileKey = key(tile.x, tile.y);
      if (blocked.has(tileKey)) continue;
      blocked.add(tileKey);
      if (this.routeBetween(grid, { x: 1, y: 1 }, goal, blocked) === null) {
        blocked.delete(tileKey);
        continue;
      }
      // A wisp or a coin under a hazard would have to be walked into to be
      // reached, so hazards claim their tiles before the pickups place.
      placed.add(tileKey);
      this.hazards.push({ x: tile.x + 0.5, y: tile.y + 0.5 });
    }

    // Coins go where the walk is long. Ranking by distance from the start puts
    // them on the far half of the route the player is about to cover, so coins
    // are met while heading for the exit rather than stood on top of at the
    // start. The exit's own bubble stays clear, so the last few tiles are the
    // approach and not a gift.
    const coinCandidates = [...deadEnds, ...corridors]
      .sort((a, b) => (distances[b.y][b.x] ?? 0) - (distances[a.y][a.x] ?? 0));
    const coinTiles = [];
    for (const tile of coinCandidates) {
      if (coinTiles.length >= this.roundSettings.coins) break;
      if (placed.has(key(tile.x, tile.y))) continue;
      placed.add(key(tile.x, tile.y));
      coinTiles.push(tile);
    }
    // A small maze can run out of distinct tiles before it runs out of coins.
    // Rather than quietly place fewer than the player asked for, the remainder
    // shares a tile with a coin that is already there: one tile, two points,
    // and the chosen count is still the count that exists.
    const distinct = coinTiles.slice();
    for (let index = 0; index < distinct.length && coinTiles.length < this.roundSettings.coins; index += 1) {
      coinTiles.push(distinct[index]);
    }
    this.coins = coinTiles.map((tile) => ({ x: tile.x + 0.5, y: tile.y + 0.5, taken: false }));

    // Wisps go as far from the start as the finished maze allows, so the light
    // you need is never the light that happens to be close.
    const wispCandidates = [...deadEnds, ...corridors]
      .filter((tile) => !placed.has(key(tile.x, tile.y)))
      .filter((tile) => (distances[tile.y][tile.x] ?? 0) >= 3)
      .sort((a, b) => (distances[b.y][b.x] ?? 0) - (distances[a.y][a.x] ?? 0));
    this.wisps = take(wispCandidates, this.roundSettings.wisps)
      .map((tile) => ({ x: tile.x + 0.5, y: tile.y + 0.5, taken: false }));

  }

  // Opens the next maze without resetting anything the run has earned. The
  // opening reveal is not repeated either: a free look per maze would be a free
  // gift, and the whole point is that one lamp has to make it through all of
  // them. buildLevel() is the same function a new round uses, so the second
  // maze is built by exactly the rules the first one was.
  nextLevel() {
    this.mazesCleared += 1;
    this.buildLevel();
  }

  // ---------------------------------------------------------------------
  // Light
  // ---------------------------------------------------------------------

  // 1 while fully lit, ramping to 0 across the fade, 0 in the dark. The opening
  // reveal counts as fully lit, which is what makes it stop you walking.
  brightness() {
    if (this.revealRemaining > 0) return 1;
    if (this.fullRemaining > 0) return 1;
    if (this.fadeRemaining > 0) return clamp(this.fadeRemaining / LAMP_TUNING.fadeTime, 0, 1);
    return 0;
  }

  lit() { return this.brightness() > 0.01; }

  // Once the run is over there is nothing left to hide: the board shows the
  // whole maze, so the end of a run is also the one time the route you actually
  // walked can be looked at.
  revealed() { return this.won || this.gameOver; }

  stepLight(dt, { lampDown = false, lampTap = false } = {}) {
    const tuning = LAMP_TUNING;
    if (this.revealRemaining > 0) {
      // The opening look is free: no drain, and nothing you can do about it.
      this.revealRemaining = Math.max(0, this.revealRemaining - dt);
      return;
    }
    // Pressing and holding are two separate acts here, on purpose.
    //
    // A press banks one whole tap and asks for the fade tail. Sustaining keeps
    // re-banking it. They are separate because a mouse click is a press held
    // for as long as the hand happens to stay down, and folding the two together
    // made an ordinary click cost a tap *plus* however long the button was held
    // -- which is how a click quietly became a hold and drank the meter. The
    // controller decides what counts as a hold; the model only obeys.
    if (lampTap) {
      this.fadePending = true;
      this.fadeRemaining = 0;
      this.fullRemaining = Math.max(this.fullRemaining, tuning.tapDuration);
    }
    if (lampDown && this.light > 0) {
      this.lampHeld = true;
      this.fadePending = false;
      this.fadeRemaining = 0;
      this.fullRemaining = Math.max(this.fullRemaining, tuning.tapDuration);
    } else if (this.lampHeld) {
      this.lampHeld = false;
      this.fadePending = true;
    }
    if (this.fullRemaining > 0) {
      this.fullRemaining = Math.max(0, this.fullRemaining - dt);
      // The fade has to begin on the frame the full brightness ends. Left to
      // the next frame there is a single frame of darkness in the middle of
      // every pulse, and anything sampling brightness() sees a hole in it.
      if (this.fullRemaining === 0 && this.fadePending) {
        this.fadePending = false;
        this.fadeRemaining = tuning.fadeTime;
      }
    } else if (this.fadePending) {
      this.fadePending = false;
      this.fadeRemaining = tuning.fadeTime;
    } else if (this.fadeRemaining > 0) {
      this.fadeRemaining = Math.max(0, this.fadeRemaining - dt);
    }

    const brightness = this.brightness();
    if (brightness <= 0) return;
    // A fading lamp still costs, but less: the tail after a tap should not be
    // able to empty a full meter on its own.
    const rate = tuning.lightDrain * (brightness >= 1 ? 1 : tuning.fadeDrainScale);
    this.light = Math.max(0, this.light - rate * dt);
    if (this.light <= 0) {
      // An empty lamp is a state, not an ending. The pulse can no longer be
      // relit, so from here the run is walked entirely in the dark -- but the
      // exit is still standing there, and a wisp still refills the meter if you
      // happen to walk into one. Nothing about this costs a life.
      this.lampHeld = false;
      this.fullRemaining = 0;
      this.fadeRemaining = 0;
      this.fadePending = false;
    }
  }

  // ---------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------

  moveWithCollision(dx, dy) {
    const radius = LAMP_TUNING.bodyRadius;
    if (dx !== 0) {
      const nextX = this.player.x + dx;
      const edge = Math.floor(nextX + Math.sign(dx) * radius);
      const top = Math.floor(this.player.y - radius);
      const bottom = Math.floor(this.player.y + radius);
      if (!this.isSolid(edge, top) && !this.isSolid(edge, bottom)) this.player.x = nextX;
    }
    if (dy !== 0) {
      const nextY = this.player.y + dy;
      const edge = Math.floor(nextY + Math.sign(dy) * radius);
      const left = Math.floor(this.player.x - radius);
      const right = Math.floor(this.player.x + radius);
      if (!this.isSolid(left, edge) && !this.isSolid(right, edge)) this.player.y = nextY;
    }
  }

  walk(dt, move) {
    if (!move || (!move.x && !move.y)) return;
    const length = Math.hypot(move.x, move.y) || 1;
    const step = LAMP_TUNING.walkSpeed * dt;
    this.moveWithCollision((move.x / length) * step, 0);
    this.moveWithCollision(0, (move.y / length) * step);
  }

  // ---------------------------------------------------------------------
  // Outcomes
  // ---------------------------------------------------------------------

  resolveTouches() {
    const tuning = LAMP_TUNING;
    for (const coin of this.coins) {
      if (coin.taken) continue;
      if (Math.hypot(coin.x - this.player.x, coin.y - this.player.y) < tuning.coinRadius) {
        coin.taken = true;
        this.score += 1;
      }
    }
    for (const wisp of this.wisps) {
      if (wisp.taken) continue;
      if (Math.hypot(wisp.x - this.player.x, wisp.y - this.player.y) < tuning.wispRadius) {
        wisp.taken = true;
        this.wispsCollected += 1;
        this.light = Math.min(tuning.lightMax, this.light + tuning.wispLight);
      }
    }
    // A hazard is spent by the life it takes. It is the other half of keeping
    // the walk: a retry resumes the walker on the very tile that killed it, so
    // an unspent hazard there would claim every remaining life in a single row.
    for (let index = 0; index < this.hazards.length; index += 1) {
      const hazard = this.hazards[index];
      if (Math.hypot(hazard.x - this.player.x, hazard.y - this.player.y) < tuning.hazardRadius) {
        this.hazards.splice(index, 1);
        this.lifeLost = true;
        this.lossReason = "hazard";
        return;
      }
    }
    if (Math.hypot(this.exit.x - this.player.x, this.exit.y - this.player.y) < tuning.exitTriggerRadius) {
      // Chained never reports a win, so the host never stops the round. The run
      // ends the only other way it can: by spending every life.
      if (this.side === "continue") this.nextLevel();
      else this.won = true;
    }
  }

  update(dt, input = {}) {
    if (this.gameOver || this.won) return;
    this.stepLight(dt, { lampDown: input.lampDown === true, lampTap: input.lampTap === true });
    // The rule the whole game turns on: light means still. This is not a
    // limitation bolted on, it is the trade — a pulse buys a moment of sight
    // you cannot spend on walking.
    if (!this.lit()) this.walk(dt, input.move);
    this.resolveTouches();
  }

  winMessage() {
    return `You reached the exit carrying ${this.score} ${this.score === 1 ? "coin" : "coins"}.`;
  }

  statusText() {
    if (this.won) return `Escaped with ${this.score} ${this.score === 1 ? "coin" : "coins"}.`;
    if (this.gameOver) return "Out of lives — the run is over.";
    if (this.light <= 0) return "The lamp is out. You cannot light it again, but the exit is still there.";
    if (this.lit()) return "Lit. You are standing still and the maze is visible.";
    return `Dark. Walk blind — light ${Math.round(this.light)} of ${this.lightMax}.`;
  }

  publicState() {
    return {
      title: this.title,
      description: this.description,
      side: this.sideLabel(),
      status: this.statusText()
    };
  }
}