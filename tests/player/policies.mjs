import { input } from "./harness.mjs";

const key = (name) => input({ keys: new Set(name ? [name] : []) });
const horizontal = (difference, tolerance = 12) => key(Math.abs(difference) <= tolerance ? null : difference > 0 ? "ArrowRight" : "ArrowLeft");
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const wrapped = (delta, size) => delta > size / 2 ? delta - size : delta < -size / 2 ? delta + size : delta;

// These are modest hand-authored input recipes, not production computer
// policies. Each is invoked at a bounded polling interval; its controls are
// held unchanged between polls. Phase varies by seed without consuming the
// world's random stream. Policies see only observe()'s visual snapshots.
export function humanPolicy(id, seed = 57) {
  const period = id === "snake" ? 0.10 : id === "splat" ? 0.12 : 0.20;
  let next = (seed % 7) / 60;
  let held = input();
  let polls = 0;
  let opportunities = 0;
  const agencyWindows = new Set();
  let actions = 0;
  let lastSignature = "";
  let pointerAngle = -Math.PI / 2;
  let seenMissiles = new Map();
  let releaseAt = Infinity;
  function decide(v) {
    if (id === "snake") {
      const head = v.snake[0];
      const directions = [[1, 0, "ArrowRight"], [0, 1, "ArrowDown"], [-1, 0, "ArrowLeft"], [0, -1, "ArrowUp"]];
      const legal = directions.filter(([dx, dy]) => {
        const x = head.x + dx, y = head.y + dy;
        return !(dx === -v.direction.x && dy === -v.direction.y) && x >= 0 && x < v.cols && y >= 0 && y < v.rows && !v.snake.slice(0, -1).some((part) => part.x === x && part.y === y);
      });
      // One-cell safety check and Manhattan apple chasing; no route search,
      // flood fill, Hamiltonian cycle, future spawns, or AI route scorer.
      legal.sort((a, b) => Math.abs(head.x + a[0] - v.apple.x) + Math.abs(head.y + a[1] - v.apple.y) - Math.abs(head.x + b[0] - v.apple.x) - Math.abs(head.y + b[1] - v.apple.y));
      const chosen = legal[0];
      return { controls: input({ pressed: new Set(chosen ? [chosen[2]] : []) }), meaningful: legal.length >= 2 };
    }
    if (id === "breakout") {
      const incoming = v.balls.filter((b) => b.vy > 0 && b.y < v.paddle.y).sort((a, b) => b.y - a.y)[0];
      // A human's basic bank-shot estimate: extend visible motion to the
      // paddle (at most 1.5s), then mirror an overshoot about one side wall.
      // No brick simulation, repeated-bounce solver or production AI helper.
      let target = incoming ? incoming.x + incoming.vx * Math.min(1.5, (v.paddle.y - incoming.radius - incoming.y) / incoming.vy) : v.balls[0]?.x ?? 400;
      if (target < 8) target = 16 - target;
      else if (target > 792) target = 1584 - target;
      // Aim a modest off-centre return toward the middle instead of repeatedly
      // sending the ball into the same outer brick lane. This is an ordinary
      // human paddle choice, not a simulated search through brick collisions.
      target += target > 400 ? 24 : -24;
      target = clamp(target, 8, 792);
      const difference = target - (v.paddle.x + v.paddle.width / 2);
      // Time an arrow-key pulse from the last observation rather than moving
      // a full 92px for every tiny correction. Release is pre-scheduled: no
      // extra perception or per-frame target corrections between 5Hz polls.
      const controls = horizontal(difference, 10);
      return { controls, pulse: Math.min(period, Math.max(0.05, Math.abs(difference) / 460)), meaningful: Boolean(incoming && Math.abs(difference) > 10) };
    }
    if (id === "splat") {
      const column = v.columns[0];
      const difference = column ? column.gapY + column.gapHeight / 2 - v.player.y : 0;
      // Hold a vertical arrow (rather than synthesising repeated bounce taps).
      return { controls: key(Math.abs(difference) < 16 ? null : difference < 0 ? "ArrowUp" : "ArrowDown"), meaningful: Boolean(column && Math.abs(difference) >= 16) };
    }
    if (id === "asteroids") {
      const targets = v.rocks.map((rock) => ({ dx: wrapped(rock.x - v.ship.x, 800), dy: wrapped(rock.y - v.ship.y, 560), radius: rock.radius })).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
      const nearest = targets[0];
      if (!nearest) return { controls: input(), meaningful: false };
      const distance = Math.hypot(nearest.dx, nearest.dy);
      // Aim at current visible centre; no intercept solution. Start a coarse
      // right-angle sidestep within 160px, choosing the shorter turn. A late
      // 180-degree reversal would take >1s at this bounded cursor turn rate.
      const retreat = distance < 160;
      const bearing = Math.atan2(nearest.dy, nearest.dx);
      const sidesteps = [bearing - Math.PI / 2, bearing + Math.PI / 2];
      const desired = retreat ? sidesteps.sort((a, b) => Math.abs(angleDifference(a, pointerAngle)) - Math.abs(angleDifference(b, pointerAngle)))[0] : bearing;
      pointerAngle += clamp(angleDifference(desired, pointerAngle), -2.8 * period, 2.8 * period);
      const cursor = { x: (v.ship.x + Math.cos(pointerAngle) * 140 + 800) % 800, y: (v.ship.y + Math.sin(pointerAngle) * 140 + 560) % 560, moved: true, down: retreat, clicked: !retreat && Math.abs(angleDifference(desired, pointerAngle)) < 0.3 };
      return { controls: input({ mode: "mouse", pointer: cursor }), meaningful: distance < 330 };
    }
    if (id === "missile") {
      const movement = new Map(v.enemies.map((enemy) => {
        const last = seenMissiles.get(enemy.id);
        return [enemy.id, last ? { vx: (enemy.x - last.x) / period, vy: (enemy.y - last.y) / period } : { vx: 0, vy: 0 }];
      }));
      seenMissiles = new Map(v.enemies.map((enemy) => [enemy.id, { x: enemy.x, y: enemy.y }]));
      // A bomber keeps dropping missiles: deal with it early unless a ground
      // threat has already fallen below 250px. Ignoring all aircraft would be
      // an artificially incompetent defender, not a useful human baseline.
      const urgency = (enemy) => enemy.aircraft ? 250 : enemy.y;
      const target = v.enemies.filter((e) => e.y < 460).sort((a, b) => urgency(b) - urgency(a))[0];
      const available = v.bases.map((b, index) => ({ ...b, index })).filter((b) => b.alive && b.missiles > 0);
      if (!target || !available.length) return { controls: input(), meaningful: false };
      const battery = available.sort((a, b) => Math.hypot(target.x - a.x, target.y - a.y) / (a.index === 1 ? 470 : 270) - Math.hypot(target.x - b.x, target.y - b.y) / (b.index === 1 ? 470 : 270))[0];
      if (v.selected !== battery.index) return { controls: input({ pressed: new Set(["ArrowRight"]) }), meaningful: true };
      // A rough visual lead using current range/travel time; one estimate, not
      // an iterative interception solver. Wait until a threat is low enough
      // to make a single shot useful; fired edges occur <= 5 times/second.
      const travel = Math.hypot(target.x - battery.x, target.y - 490) / (battery.index === 1 ? 470 : 270);
      const motion = movement.get(target.id);
      const x = target.x + motion.vx * travel * 0.8;
      const y = target.y + motion.vy * travel * 0.8;
      return { controls: input({ pointer: { x: clamp(x, 0, 800), y: clamp(y, 28, 500), moved: true, clicked: target.aircraft || target.y > 240, down: false } }), meaningful: true };
    }
    const danger = v.stars.filter((s) => s.y > 290 && s.y < 525 && Math.abs(s.x - v.runner.x) < 65).sort((a, b) => b.y - a.y)[0];
    const gem = v.gems.filter((g) => g.y > 300 && g.y < 510 && Math.abs(g.x - v.runner.x) / 240 < (526 - g.y) / g.vy).sort((a, b) => b.y - a.y)[0];
    let target = gem ? gem.x : v.runner.x;
    if (danger) target = v.runner.x + (danger.x <= v.runner.x ? 100 : -100);
    return { controls: horizontal(clamp(target, 20, 780) - v.runner.x), meaningful: Boolean(danger || gem) };
  }
  return {
    period,
    get metrics() { return { polls, opportunities, agencyWindows: agencyWindows.size, actions }; },
    controls(visible, time) {
      // pressed/clicked are edge events, consumed once, not held every frame.
      held = { ...held, pressed: new Set(), pointer: { ...held.pointer, clicked: false } };
      if (time + 1e-9 >= releaseAt) held = { ...held, keys: new Set() };
      if (time + 1e-9 < next) return held;
      next = time + period;
      polls += 1;
      const decision = decide(visible);
      if (decision.meaningful) { opportunities += 1; agencyWindows.add(Math.floor(time)); }
      held = decision.controls;
      releaseAt = decision.pulse === undefined ? Infinity : time + decision.pulse;
      const signature = [...held.keys, ...held.pressed].join(",") + (held.pointer.clicked ? "click" : "") + (held.pointer.down ? "hold" : "");
      if (signature && (signature !== lastSignature || held.pointer.clicked || held.pressed.size)) actions += 1;
      lastSignature = signature;
      return held;
    }
  };
}
