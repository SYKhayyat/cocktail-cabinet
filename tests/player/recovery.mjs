import { cabinet, DT, input, seeded } from "./harness.mjs";

export const DELAYS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.6, 2];

// Controlled visible near-miss scenes, NOT natural-play distribution samples.
// Each has a lethal no-input control and an input-mediated escape; the policy
// gets no invulnerability, teleports, AI steering or state edits after setup.
export function recoveryProbe(id, progressed, delay = Infinity) {
  return seeded(57, () => {
    const host = cabinet(id, { progressed, lives: 1 });
    const m = host.model;
    let controls;
    let horizon;
    if (id === "snake") {
      m.snake = Array.from({ length: progressed ? 15 : 3 }, (_, i) => ({ x: m.cols - 2 - i, y: 14 }));
      m.rebuildOccupied();
      m.apple = { x: 4, y: 4 };
      controls = input({ pressed: new Set(["ArrowUp"]) });
      horizon = 1;
    }
    if (id === "breakout") {
      m.balls = [m.newBall(600, 340, 0, 210)];
      controls = input({ keys: new Set(["ArrowRight"]) });
      horizon = 1.3;
    }
    if (id === "splat") {
      const c = m.nextColumn;
      m.player.x = c.x - 120;
      m.player.y = c.gapY + c.gapHeight + 80;
      m.player.vy = 0;
      controls = input({ keys: new Set(["ArrowUp"]) });
      horizon = 1.15;
    }
    if (id === "asteroids") {
      m.ship.x = 400; m.ship.y = 280; m.ship.angle = -Math.PI / 2;
      m.invulnerable = 0;
      m.asteroids = [];
      m.spawnClock = 10;
      m.spawnAsteroidAt(535, 280, m.ship, { vx: -(progressed ? 110 : 80), vy: 0 });
      controls = input({ keys: new Set(["ArrowUp"]) });
      horizon = 1.4;
    }
    if (id === "missile") {
      m.launchClock = 10;
      const city = m.cities[3];
      // One city-threatening missile makes the failure a city loss, not a
      // fabricated game-over or destruction of all six cities.
      m.enemyMissiles = [{ id: 999, x: 400, y: 330, targetX: city.x, targetY: city.y, speed: progressed ? 150 : 100, targetObject: city, kind: "city", dead: false }];
      controls = input({ pointer: { x: 435, y: 390, moved: true, clicked: true, down: false } });
      horizon = 2.1;
    }
    if (id === "starfall") {
      m.gems = [];
      m.spawnClock = 10;
      m.stars = [{ id: 999, x: 400, y: 340, vy: progressed ? 430 : 130, radius: 10 }];
      controls = input({ keys: new Set(["ArrowRight"]) });
      horizon = 1.8;
    }
    let acted = false;
    while (!host.ended && host.active + 1e-9 < horizon) {
      let frame = input();
      if (host.active + 1e-9 >= delay) {
        // Snake and Missile require just one pressed/click edge, whereas the
        // remaining probes hold an arrow. Breakout stops after reaching target.
        frame = controls;
        if (acted && ["snake", "missile"].includes(id)) frame = input();
        if (id === "breakout" && m.human.x > 565) frame = input();
        if (id === "splat" && m.player.y < m.nextColumn?.gapY + m.nextColumn?.gapHeight / 2) frame = input();
        acted = true;
      }
      host.step(frame, DT);
    }
    const safe = id === "missile" ? m.cities[3].alive : host.losses === 0;
    return { safe, survival: host.lossTimes[0] ?? host.active, score: m.score, active: host.active };
  });
}

export function recoveryWindow(id, progressed) {
  const outcomes = DELAYS.map((delay) => ({ delay, ...recoveryProbe(id, progressed, delay) }));
  return { outcomes, maxSafeDelay: Math.max(...outcomes.filter((r) => r.safe).map((r) => r.delay)), idle: recoveryProbe(id, progressed) };
}
