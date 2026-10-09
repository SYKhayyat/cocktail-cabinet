// Value-only semantic adapter. No canvas inspection, alternate collision rules,
// auto-wins, or privileged AI state: actions use the models' public game rules.
const n = (value) => Math.round(value || 0);
const position = (entity) => `x ${n(entity.x)}, y ${n(entity.y)}`;
const motion = (entity) => `velocity x ${n(entity.vx)}, y ${n(entity.vy)}`;
const entry = (id, label, entity, detail = "") => ({ id, label, x: entity.x, y: entity.y, text: `${label}: ${position(entity)}${detail ? `; ${detail}` : ""}.` });
const action = (id, label, edit = false) => ({ id, label, edit });

export function semanticState(game, engine) {
  const m = game.model;
  const result = engine.lifecycle.resultState();
  const life = engine.lifecycle.lifeState();
  const lifeLabel = ["apples", "rocks", "stars"].includes(game.side) ? "Computer lives" : game.side === "builder" ? "Puzzle retries" : "Lives";
  const lifeSummary = life.owner === "none" ? "No life budget in this mode" : life.players ? `Your lives ${life.players.human}; computer lives ${life.players.computer}` : `${lifeLabel} ${life.owner === "game" ? life.remaining : engine.lives} of ${engine.maxLives}`;
  const snapshot = {
    mode: `${game.title}: ${game.sideLabel()}`,
    objective: "", players: [], hazards: [], targets: [], actions: [],
    outcome: `${result.ended ? result.heading : engine.ready ? "Ready — choose New game" : engine.paused ? "Paused — choose Continue" : "Round in progress"}. Score ${game.score}. ${lifeSummary}. ${engine.assistanceOutcome || ""}`,
    coordinates: "Coordinates are pixels: x 0–800 from left to right; y 0–560 from top to bottom. Velocity is pixels per second. Time advances only after an action when assistance is enabled."
  };
  const wait = action("wait", "Advance without input");
  if (game.id === "snake") {
    snapshot.coordinates = `Coordinates are cells: column x 1–${m.cols}; row y 1–${m.rows}, from the top left. One action advances one snake move. ${m.wrap ? "Walls wrap." : "Walls are solid."}`;
    const cell = (entity) => ({ x: entity.x + 1, y: entity.y + 1 });
    snapshot.objective = m.side === "snake" ? "Eat apples, grow, and fill the board. Avoid your body and solid walls; reversing direction is forbidden." : "Place an apple on an unoccupied cell to challenge the computer snake. The computer uses the same walls and body collisions; its collision spends a life.";
    snapshot.players = [entry("head", `${m.side === "snake" ? "Your" : "Computer"} snake head`, cell(m.snake[0]), `length ${m.snake.length}; heading x ${m.direction.x}, y ${m.direction.y}`)];
    snapshot.hazards = m.snake.slice(1).map((part, i) => entry(`body-${i}`, `Body segment ${i + 1}`, cell(part)));
    snapshot.targets = m.apple ? [entry("apple", "Apple", cell(m.apple))] : [];
    snapshot.actions = m.side === "snake" ? [action("up", "Move up"), action("down", "Move down"), action("left", "Move left"), action("right", "Move right"), wait] : [action("apple", "Place apple at coordinates"), wait];
  } else if (game.id === "breakout") {
    snapshot.objective = m.side === "versus" ? "Deflect balls into central bricks. Highest score after clearing them wins; losing all lives loses the duel." : m.side === "blocks" ? "Arrange and change bricks for the computer paddle, then test the layout. Clear all bricks to finish; missed balls or active danger bricks spend lives." : "Keep balls above the bottom exit and clear every brick. Active special bricks change lives, paddle size, speed, or ball count; danger spends a life.";
    snapshot.players = [entry("paddle", m.side === "blocks" ? "Computer paddle" : "Your paddle", m.side === "blocks" ? m.computer : m.human, `width ${(m.side === "blocks" ? m.computer : m.human).width}`)];
    if (m.side === "versus") snapshot.players.push(entry("computer", "Computer paddle", m.computer, `width ${m.computer.width}; score ${m.scores.computer}`));
    snapshot.hazards = m.balls.map((ball, i) => entry(`ball-${i}`, `Ball ${i + 1}${ball.owner ? ` (${ball.owner})` : ""}`, ball, `${motion(ball)}; radius ${ball.radius}`));
    snapshot.targets = m.bricks.map((brick, i) => entry(`brick-${i}`, `Brick ${i + 1}`, brick, `${brick.type}; ${brick.hits ? "intact" : "cleared"}; ${brick.active ? "effect active" : "effect inactive"}; size ${brick.width} by ${brick.height}`));
    snapshot.actions = m.side === "blocks" ? [action("brick-move", "Move selected brick to coordinates", true), action("brick-cycle", "Cycle selected brick type", true), wait] : [action("left", "Move paddle left"), action("right", "Move paddle right"), wait];
  } else if (game.id === "splat") {
    snapshot.objective = m.side === "builder" ? "Design reachable column gaps for the computer and test the route. Computer finishing solves it; exhausting its lives leaves it unsolved." : m.side === "race" ? "Race the computer through column gaps. First ball to finish wins. Column collisions spend that ball's lives." : "Bounce and drift through column gaps to the far right. Column collisions spend a life.";
    snapshot.players = [entry("player", m.side === "builder" ? "Computer ball" : "Your ball", m.player, `vertical velocity ${n(m.player.vy)}; radius ${m.player.radius}; columns passed ${m.player.columnsPassed || 0}`)];
    if (m.computerPlayer && m.side === "race") snapshot.players.push(entry("computer", "Computer ball", m.computerPlayer, `vertical velocity ${n(m.computerPlayer.vy)}`));
    snapshot.targets = m.columns.map((column) => entry(`column-${column.id}`, `Column ${column.id}${m.side === "builder" && column.id === m.selectedColumnId ? " (selected for keyboard editing)" : ""}`, column, `solid except gap y ${n(column.gapY)}–${n(column.gapY + column.gapHeight)}; width ${column.width}; ${column.passed ? "passed" : "ahead"}`));
    snapshot.hazards = [...snapshot.targets];
    snapshot.actions = m.side === "builder" ? [action("column-left", "Move selected column left 10", true), action("column-right", "Move selected column right 10", true), action("gap-up", "Move selected gap up 10", true), action("gap-down", "Move selected gap down 10", true), action("gap-smaller", "Shrink selected gap 10", true), action("gap-larger", "Widen selected gap 10", true), action("column-add", "Add column after selected column", true), action("column-remove", "Remove selected column", true), wait] : [action("up", "Bounce and drift up"), action("down", "Bounce and drift down"), wait];
    snapshot.coordinates = "World coordinates in pixels, not camera coordinates. Gaps use top and bottom y positions; x increases along the route. Editing does not advance time.";
  } else if (game.id === "asteroids") {
    snapshot.objective = m.side === "versus" ? "Shoot the computer ship and protect your own. Rocks threaten both ships; losing all lives loses the duel." : m.side === "rocks" ? "Send up to eight asteroids to challenge the computer ship. A rock collision spends the ship's life; the computer can shoot and split rocks." : "Shoot asteroids for points while avoiding collisions. Large rocks split into two; the board wraps at every edge.";
    snapshot.players = [entry("ship", m.side === "rocks" ? "Computer ship" : "Your ship", m.ship, `heading ${n(m.ship.angle * 180 / Math.PI)} degrees; speed ${n(m.ship.speed)}; collision grace ${m.invulnerable.toFixed(2)} seconds`)];
    snapshot.targets = m.asteroids.map((rock) => entry(`rock-${rock.id}`, `Asteroid ${rock.id}`, rock, `${motion(rock)}; radius ${n(rock.radius)}; generation ${rock.generation || 0}`));
    if (m.computerShip) snapshot.targets.push(entry("opponent", "Computer ship", m.computerShip, `speed ${n(m.computerShip.speed)}`));
    snapshot.hazards = [...snapshot.targets, ...m.bullets.map((bullet, i) => entry(`bullet-${i}`, `Bullet ${i + 1} (${bullet.owner})`, bullet, motion(bullet)))];
    snapshot.actions = m.side === "rocks" ? [action("rock", "Send asteroid from coordinates toward computer"), wait] : [action("aim-fire", "Aim and fire at selected target or coordinates"), action("aim-thrust", "Aim and thrust toward selected target or coordinates"), action("left", "Turn left"), action("right", "Turn right"), action("thrust", "Thrust forward"), action("fire", "Fire forward"), wait];
    snapshot.coordinates += " The board wraps; aiming takes the shortest wrapped direction. Shots obey cooldown and travel normally; aiming is not an instant hit.";
  } else if (game.id === "missile") {
    snapshot.objective = m.side === "attacker" ? "Destroy all six cities to win. Destroying every battery while cities remain loses: preserve the means to attack the cities." : "Protect six cities by choosing a live battery with ammunition and aiming interceptors. All cities destroyed ends the game; clearing a wave earns bonuses and advances the level.";
    snapshot.players = m.bases.map((base, i) => entry(`battery-${i}`, `Battery ${base.label}`, base, `${base.alive ? "alive" : "destroyed"}; ammunition ${base.missiles}; ${m.selectedBattery === i ? "selected" : "not selected"}`));
    snapshot.hazards = m.enemyMissiles.map((enemy) => entry(`enemy-${enemy.id}`, `${enemy.aircraft ? enemy.kind : "Enemy missile"} ${enemy.id}`, enemy, `destination x ${n(enemy.targetX)}, y ${n(enemy.targetY)}; speed ${n(enemy.speed)}${enemy.smart ? "; smart" : ""}${enemy.splitCount ? "; splits" : ""}`));
    snapshot.targets = m.side === "attacker" ? [...m.cities.map((city, i) => entry(`city-${i}`, `City ${city.label}`, city, city.alive ? "alive" : "destroyed")), ...snapshot.players] : [...snapshot.hazards];
    snapshot.players.push(...m.cities.map((city, i) => entry(`city-${i}`, `City ${city.label}`, city, city.alive ? "alive" : "destroyed")));
    snapshot.hazards.push(...m.interceptors.map((item, i) => entry(`interceptor-${i}`, `Interceptor ${i + 1}`, item, `destination x ${n(item.targetX)}, y ${n(item.targetY)}`)), ...m.fireballs.map((item, i) => entry(`fireball-${i}`, `Fireball ${i + 1}`, item, `radius ${item.radius}; remaining ${item.life.toFixed(2)} seconds`)));
    snapshot.actions = m.side === "attacker" ? [action("attack", "Launch missile at selected city or battery"), wait] : [action("battery-left", "Select previous battery", true), action("battery-right", "Select next battery", true), action("intercept", "Launch interceptor at selected target or coordinates"), wait];
    snapshot.outcome += ` Level ${m.level}; multiplier ${m.multiplier}; wave ${m.enemySpawned}/${m.enemyTotal}; reserve cities ${m.reserveCities}.`;
  } else if (game.id === "starfall") {
    snapshot.objective = m.side === "stars" ? "Challenge the computer runner by sending stars; send gems as lures. A star collision spends a life; collecting a gem earns 50 points. Up to twelve of each can be present." : "Move horizontally to collect blue gems for 50 points and avoid red stars. Star collisions spend lives.";
    snapshot.players = [entry("runner", m.side === "stars" ? "Computer runner" : "Your runner", m.runner, `radius ${m.runner.radius}`)];
    snapshot.hazards = m.stars.map((star) => entry(`star-${star.id}`, `Star ${star.id}`, star, `${motion(star)}; radius ${star.radius}`));
    snapshot.targets = m.gems.filter((gem) => !gem.collected).map((gem) => entry(`gem-${gem.id}`, `Gem ${gem.id}`, gem, motion(gem)));
    snapshot.actions = m.side === "stars" ? [action("star", "Send star at x coordinate"), action("gem", "Send gem at x coordinate"), wait] : [action("left", "Move runner left"), action("right", "Move runner right"), wait];
  } else if (game.id === "lamp") {
    const tile = (entity) => ({ x: entity.x + 1, y: entity.y + 1 });
    snapshot.coordinates = `Coordinates are maze tiles: column x 1–${m.cols}; row y 1–${m.rows}, counted from the top left. The maze is black until the lamp is lit, and you cannot walk while it is lit, so a walk action does nothing until the lamp has faded.`;
    snapshot.objective = "Reach the green exit to win. Pulse the lamp to stand still and reveal the maze: you cannot walk while it is lit, so a pulse is spent looking rather than moving, and you can only walk once it has faded. A gold coin is a point and a cyan wisp refills light. A red hazard spends one life and leaves your light, your coins and your place unchanged; running the light out ends the run.";
    snapshot.players = [entry("walker", "Your walker", tile(m.player), `light ${Math.round(m.light)} of ${m.lightMax}; coins collected ${m.score}; wisps collected ${m.wispsCollected}; collision grace ${m.invulnerable.toFixed(2)} seconds`)];
    snapshot.targets = [
      entry("exit", "Exit", tile(m.exit), "reaching it ends the run as a win"),
      ...m.coins.filter((coin) => !coin.taken).map((coin, index) => entry(`coin-${index}`, `Coin ${index + 1}`, tile(coin), "uncollected")),
      ...m.wisps.filter((wisp) => !wisp.taken).map((wisp, index) => entry(`wisp-${index}`, `Light wisp ${index + 1}`, tile(wisp), `uncollected; restores ${m.wispLight} light`))
    ];
    snapshot.hazards = m.hazards.map((hazard, index) => entry(`hazard-${index}`, `Hazard ${index + 1}`, tile(hazard), "lethal on touch, and it cannot be seen while the lamp is out"));
    snapshot.actions = [
      action("up", "Walk up"), action("down", "Walk down"),
      action("left", "Walk left"), action("right", "Walk right"),
      action("pulse", "Pulse the lamp and stand still"),
      wait
    ];
    snapshot.outcome += ` Light ${Math.round(m.light)} of ${m.lightMax}. ${m.lit() ? "The lamp is lit, so you are standing still and the maze is visible." : "The lamp is out, so you are walking blind."}`;
  } else if (game.id === "imitation") {
    const state = game.publicState();
    snapshot.objective = ({ ai: "Chat with the local AI using the Message field and Send button. Load the model first.", human: "Connect a separate browser, then exchange messages using Message and Send.", guess: "Send a prompt, then decide whether the mystery reply is AI or Human using the guess buttons. Restart round begins another mystery.", provide: "Connect to a guesser in another browser and provide human replies using Message and Send.", write: "Load the AI model, then submit text with Message and Send for AI, Human, or Unclear classification. Read the result in Chat messages." })[m.side] || game.description;
    snapshot.players = [{ id: "chat", text: "Chat messages, connection controls, model download, and guesses are native keyboard-operable controls above this panel." }];
    snapshot.outcome = `${state.status}. ${state.phase ? `Phase ${state.phase}.` : ""} ${state.guessStats ? `Right ${state.guessStats.right}; wrong ${state.guessStats.wrong}.` : ""}`;
    snapshot.coordinates = "No spatial board. Use the labeled chat, model, connection, and guessing controls; Refresh state reads current connection and round status.";
  }
  return snapshot;
}

// Returns an explicit result; never silently accepts a stale named target.
export function performSemanticAction(engine, command) {
  const game = engine.game;
  const m = game.model;
  const state = semanticState(game, engine);
  const selected = state.actions.find((item) => item.id === command.action);
  if (!engine.assistance || !selected) return "Enable step-by-step assistance and choose an available action.";
  const target = command.target ? state.targets.find((item) => item.id === command.target) : null;
  if (command.target && !target) return "That target no longer exists. Refresh state and choose another.";
  const x = target?.x ?? Number(command.x);
  const y = target?.y ?? Number(command.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "Enter finite x and y coordinates.";
  const seconds = game.id === "snake" ? m.moveInterval() * (m.side === "apples" ? m.aiTuning.moveIntervalScale : 1) + 1e-9 : Number(command.seconds);
  if (!selected.edit && (engine.ready || engine.paused || engine.stopped)) return "Choose New game to start, or Continue if paused. Editing remains available while ready or paused.";
  const id = selected.id;
  if (id.startsWith("brick-")) {
    if (!target?.id.startsWith("brick-")) return "Choose a named brick to edit.";
    // Coordinates, unlike aiming, must come from the edit fields.
    const ok = m.editBrick(Number(target.id.slice(6)), { x: Number(command.x), y: Number(command.y), cycle: id === "brick-cycle" });
    return ok ? `${target.label} updated; layout saved.` : "Enter finite edit coordinates.";
  }
  if (game.id === "splat" && selected.edit) {
    if (!target?.id.startsWith("column-")) return "Choose a named column to edit.";
    m.selectedColumnId = Number(target.id.slice(7));
    const commands = { "column-left": { move: -10 }, "column-right": { move: 10 }, "gap-up": { gapMove: -10 }, "gap-down": { gapMove: 10 }, "gap-smaller": { gapResize: -10 }, "gap-larger": { gapResize: 10 }, "column-add": { add: true }, "column-remove": { remove: true } };
    m.updateBuilderKeyboard(commands[id]);
    return m.routeLimitReached ? "Route limit reached. Remove a column before adding." : "Route updated using the Builder bounds; time did not advance.";
  }
  if (id.startsWith("battery-")) {
    m.selectBattery(id === "battery-left" ? -1 : 1);
    return `Battery ${m.bases[m.selectedBattery].label} selected.`;
  }
  if (id === "apple" && (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || x > m.cols || y < 1 || y > m.rows)) return "Enter a cell within the board bounds.";
  if (id === "apple" && m.isOccupiedCell(x - 1, y - 1)) return "That cell is occupied by the snake; choose a free cell.";
  if (id === "attack" && (!target || !/^(city|battery)-/.test(target.id))) return "Choose a named city or battery to attack.";
  if (id === "attack" && !(target.id.startsWith("city-") ? m.cities[Number(target.id.slice(5))] : m.bases[Number(target.id.slice(8))]).alive) return "That target is already destroyed. Choose a live target.";
  const directions = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const countsBefore = {
    rocks: m.asteroids?.length, stars: m.stars?.length, gems: m.gems?.length,
    ammo: m.bases?.[m.selectedBattery]?.missiles, batteryAlive: m.bases?.[m.selectedBattery]?.alive,
    shotClock: m.shotClock, gemCooldown: m.gemSpawnCooldown,
    lampLit: m.lit?.()
  };
  const stepped = engine.assistanceStep(seconds, (dt, first) => {
    let input = {};
    if (game.id === "snake") input = { direction: directions[id], placeApple: first && id === "apple" ? m.cellCenter({ x: x - 1, y: y - 1 }) : null };
    if (game.id === "breakout") input = { mode: "keyboard", keyDirection: id === "left" ? -1 : id === "right" ? 1 : 0, pointer: { down: false, moved: false } };
    if (game.id === "splat") input = { drift: id === "up" ? -1 : id === "down" ? 1 : 0, bounce: first ? id === "up" ? -1 : id === "down" ? 1 : 0 : 0 };
    if (game.id === "asteroids") input = { turn: id === "left" ? -1 : id === "right" ? 1 : 0, thrust: ["thrust", "aim-thrust"].includes(id) ? 1 : 0, fire: first && ["fire", "aim-fire"].includes(id), pointer: id.startsWith("aim-") ? { x, y, down: id === "aim-thrust" } : null, spawnAsteroid: first && id === "rock" ? { x, y } : null };
    if (game.id === "missile") input = { aim: id === "intercept" ? { x, y } : null, launch: first && id === "intercept", attack: first && id === "attack" ? { x, y, clicked: true } : null };
    if (game.id === "starfall") input = { mode: "keyboard", keyDirection: id === "left" ? -1 : id === "right" ? 1 : 0, spawnStar: first && id === "star" ? { x: Math.max(20, Math.min(780, x)) } : null, spawnGem: first && id === "gem" ? { x } : null };
    // One rising/falling edge on a single flag is all the lamp needs, so the
    // pulse and the walks drive the model exactly as a key does.
    if (game.id === "lamp") input = { move: directions[id] ?? null, lampDown: id === "pulse" };
    m.update(dt, input);
  });
  if (!stepped) return "No step performed. Choose a duration between 0 and 1 second.";
  // Silence would read as a broken control, so say the rule that stopped it.
  if (game.id === "lamp" && countsBefore.lampLit && directions[id]) {
    return "That walk did not move: the lamp was lit, and you cannot walk while it is lit. Time advanced and the pulse burned light; wait for it to fade, or read the updated light and hazard list first.";
  }
  if (id === "rock" && countsBefore.rocks >= 8) return "Asteroid limit reached; time advanced without sending another.";
  if (id === "star" && countsBefore.stars >= 12) return "Star limit reached; time advanced without sending another.";
  if (id === "gem" && countsBefore.gems >= 12) return "Gem limit reached; time advanced without sending another.";
  if (id === "gem" && countsBefore.gemCooldown > seconds / Math.ceil(seconds * 60)) return "Gem cooldown active; time advanced without sending another.";
  if (["fire", "aim-fire"].includes(id) && countsBefore.shotClock > seconds / Math.ceil(seconds * 60)) return "Firing cooldown active; time advanced without firing.";
  if (id === "intercept" && (!countsBefore.ammo || !countsBefore.batteryAlive)) return "Battery unavailable or empty; time advanced without launch.";
  return `${selected.label} performed. ${game.id === "snake" ? "One snake move" : `Up to ${seconds} seconds`} advanced; read the updated state for collisions and outcomes.`;
}
