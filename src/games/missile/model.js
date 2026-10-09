import { circleHitsCircle, clamp } from "../../geometry.js";
import { recordDecision } from "../../decisions.js";
import { installEvents } from "../../events.js";
const BATTERY_X = [130, 400, 670];
const CITY_X = [70, 200, 300, 500, 600, 730];
const BATTERY_MISSILES = 10;
const BASE_Y = 510;
// Collision geometry, named once. These previously lived as a mix of constants
// and bare literals, so the attacker path used radii that silently disagreed
// with the defender path and with the radii the shapes are drawn at.
const INTERCEPTOR_RADIUS = 4;
const ENEMY_RADIUS = 5;
const FIREBALL_RADIUS = 46;
// A fireball is an explosion, so it catches a slightly wider target than a
// direct interceptor hit.
const FIREBALL_ENEMY_BONUS = 4;
const IMPACT_MARGIN = 8;
const FIREBALL_LIFE = 4;
const ATTACKER_CITY_SCORE = 100;
const ATTACKER_BATTERY_SCORE = 50;

export const MISSILE_MODES = [
  { value: "defender", label: "You vs computer — defend cities" },
  { value: "attacker", label: "Computer vs you — attack cities" }
];

// Battery factors. The battery does not roll for misses: it estimates the
// intercept imperfectly, and it has a finite number of rounds between reloads.
// Speed is px/s; lead is a fraction of estimated flight time; reload is seconds.
// These govern the computer battery, not the human's interceptor physics.
// See tests/ai/TUNING.md.
export const MISSILE_AI_DEFAULTS = Object.freeze({ interceptorSpeed: 245, lead: 0.62, reloadMin: 0.5, reloadMax: 0.85 });

export class MissileModel {
  constructor({ aiTuning = {} } = {}) {
    installEvents(this);
    this.aiTuning = { ...MISSILE_AI_DEFAULTS, ...aiTuning };
    this.id = "missile";
    this.title = "Missile Command";
    this.description = "Defend: aim the crosshair, choose a battery with Left/Right, then press Space or click to launch. Attack: click or drag to fire a red missile at a city. Both modes are about the six cities.";
    this.side = "defender";
    this.score = 0;
    // The engine treats lifeLost and gameOver as edge triggers, so they must
    // start as definite booleans rather than depending on the caller to clear
    // them.
    this.lifeLost = false;
    this.gameOver = false;
    this.eventLog = [];
    this.nextEntityId = 1;
  }
  get modes() { return MISSILE_MODES; }
  get sides() { return MISSILE_MODES.map((mode) => mode.value); }
  sideLabel() { return this.modes.find((mode) => mode.value === this.side)?.label || MISSILE_MODES[0].label; }
  setSide(side) { if (this.sides.includes(side)) this.side = side; }
  reset(keepScore = false) {
    this.clearEvents();
    if (!keepScore) this.score = 0;
    this.level = 1;
    this.multiplier = 1;
    this.selectedBattery = 1;
    this.bases = BATTERY_X.map((x, index) => ({ x, y: BASE_Y, radius: 18, label: ["A", "B", "C"][index], alive: true, missiles: BATTERY_MISSILES }));
    this.cities = CITY_X.map((x, index) => ({ x, y: BASE_Y, radius: 12, label: String(index + 1), alive: true }));
    this.reserveCities = 0;
    this.nextCityBonus = 1000;
    this.enemyMissiles = [];
    this.lastEnemyTarget = null;
    this.interceptors = [];
    this.fireballs = [];
    this.target = { x: 400, y: 250 };
    this.enemyTotal = 12;
    this.enemySpawned = 0;
    this.launchClock = 0.6;
    this.interceptorClock = 0;
    this.decisionLog = [];
    this.lastDecision = null;
    this.eventLog = [];
    this.nextEntityId = 1;
    this.levelComplete = false;
    this.levelTransition = 0;
    this.lifeLost = false;
    this.gameOver = false;
    this.won = false;
    this.winner = null;
  }
  recordEvent(type, details = {}) {
    this.eventLog.push({ type, ...details });
    if (this.eventLog.length > 4096) this.eventLog.splice(0, 1024);
  }
  recordEnemyOutcome(enemy, type, details = {}) {
    if (enemy.outcome) return false;
    enemy.outcome = type;
    this.recordEvent(type, { enemyId: enemy.id ?? null, ...details });
    return true;
  }
  selectBattery(direction) {
    if (!direction) return;
    this.selectedBattery = (this.selectedBattery + direction + this.bases.length) % this.bases.length;
  }
  launchInterceptor() {
    const base = this.bases[this.selectedBattery];
    if (!base || !base.alive || base.missiles <= 0) return false;
    base.missiles -= 1;
    const speed = this.selectedBattery === 1 ? 470 : 270;
    const travelAngle = Math.atan2(this.target.y - (base.y - 20), this.target.x - base.x);
    this.interceptors.push({ x: base.x, y: base.y - 20, targetX: this.target.x, targetY: this.target.y, speed, color: "#22d3ee", battery: base, travelAngle });
    this.recordEvent("interceptor-fired", { machine: false });
    return true;
  }
  launchEnemy(target = null, options = {}) {
    const targets = [
      ...this.cities.filter((city) => city.alive).map((city) => ({ target: city, kind: "city" })),
      ...this.bases.filter((base) => base.alive).map((base) => ({ target: base, kind: "battery" })),
    ];
    const availableTargets = target ? [target] : targets.filter((candidate) => candidate.target !== this.lastEnemyTarget);
    const destination = availableTargets[Math.floor(Math.random() * (availableTargets.length || targets.length))] || targets[0] || { target: this.cities[0], kind: "city" };
    this.lastEnemyTarget = destination.target;
    const aircraft = !options.freeFlight && this.side === "defender" && Math.random() < 0.12;
    if (aircraft) {
      this.enemyMissiles.push({ id: this.nextEntityId++, x: Math.random() < 0.5 ? 24 : 776, y: 70 + Math.random() * 80, targetX: Math.random() < 0.5 ? 820 : -20, targetY: 70 + Math.random() * 80, speed: 70 + this.level * 8, color: "#f472b6", kind: Math.random() < 0.5 ? "bomber" : "satellite", aircraft: true, dropClock: 1.4, isSplit: false, dead: false, outcome: null });
      return;
    }
    const smart = this.level > 1 && Math.random() < 0.18;
    const splitCount = this.level > 2 && Math.random() < 0.32 ? 1 : 0;
    const startX = options.startX ?? 40 + Math.random() * 720;
    const startY = options.startY ?? 20;
    this.enemyMissiles.push({ id: this.nextEntityId++, x: startX, y: startY, targetX: destination.target.x, targetY: destination.target.y, speed: 78 + this.level * 8 + this.score * 0.15, color: smart ? "#fbbf24" : "#fb7185", kind: destination.kind, targetObject: destination.target, smart, splitCount, isSplit: false, dead: false, outcome: null, freeFlight: Boolean(options.freeFlight), vx: options.vx || 0, vy: options.vy || 0 });
  }
  launchPlayerEnemy(pointer) {
    if (!pointer) return;
    const startX = pointer.dragStartX ?? pointer.x;
    const startY = pointer.dragStartY ?? pointer.y;
    const dragLength = Math.hypot(pointer.x - startX, pointer.y - startY);
    const dragged = dragLength > 4 && pointer.released;
    if (dragged) {
      const dx = pointer.dragDeltaX || pointer.x - startX;
      const dy = pointer.dragDeltaY || pointer.y - startY;
      const angle = Math.atan2(dy, dx);
      const speed = 180;
      this.launchEnemy(null, { freeFlight: true, startX, startY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
      return;
    }
    const interactive = "clicked" in pointer || "released" in pointer || "down" in pointer || "dragDistance" in pointer;
    if (pointer.clicked || pointer.released || pointer.down || pointer.x !== undefined) this.launchEnemy(interactive ? this.closestTarget(pointer.x) : this.closestBattery(pointer.x));
  }
  // The most urgent missile: the one nearest to whatever it is going to hit.
  // The battery used to shoot enemyMissiles[0], which is the oldest missile on
  // screen -- often one that was already lost -- while a fast missile behind it
  // walked past unopposed. Prioritising is something a player does; rolling for
  // it is not.
  mostUrgentEnemy() {
    let best = null;
    let bestRemaining = Infinity;
    for (const enemy of this.enemyMissiles) {
      if (enemy.dead || enemy.freeFlight) continue;
      const remaining = Math.hypot(enemy.targetX - enemy.x, enemy.targetY - enemy.y);
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        best = enemy;
      }
    }
    return best;
  }
  launchMachineInterceptor() {
    const base = this.bases.find((candidate) => candidate.alive);
    const target = this.mostUrgentEnemy();
    if (!base || !target) return;
    const dx = target.targetX - target.x;
    const dy = target.targetY - target.y;
    const distance = Math.hypot(dx, dy);
    const flightTime = Math.hypot(target.x - base.x, target.y - base.y) / this.aiTuning.interceptorSpeed;
    // The battery leads the target by its own estimate of the intercept, and
    // that estimate is short. It used to add a random offset instead, which is
    // the same idea with a dice on the end: a correct lead always connects here,
    // because a missile flies a straight line to its target, so something has to
    // be wrong with the estimate. Under-estimating costs accuracy in proportion
    // to how fast and how far away the target is.
    const lead = this.aiTuning.lead * flightTime;
    const aimX = target.x + (distance ? dx / distance * target.speed * lead : 0);
    const aimY = target.y + (distance ? dy / distance * target.speed * lead : 0);
    this.interceptors.push({ x: base.x, y: base.y - 20, targetX: aimX, targetY: aimY, speed: this.aiTuning.interceptorSpeed, color: "#22d3ee", machine: true });
    this.recordEvent("interceptor-fired", { machine: true });
    recordDecision(this, {
      mode: "attacker",
      targetX: Math.round(target.x),
      targetY: Math.round(target.y),
      aimX: Math.round(aimX),
      aimY: Math.round(aimY),
      idealX: Math.round(target.x + (distance ? dx / distance * target.speed * flightTime : 0))
    });
  }
  update(dt, input) {
    if (this.side === "defender") this.updateDefender(dt, input);
    else this.updateAttacker(dt, input);
  }
  updateDefender(dt, input) {
    if (input.aim) this.target = { x: input.aim.x, y: clamp(input.aim.y, 28, 500) };
    this.selectBattery(input.batteryDirection || 0);
    if (input.launch && this.launchInterceptor()) { this.interceptorClock = 0.12; this.emit("launch"); }
    this.launchClock -= dt;
    if (!this.levelComplete && this.enemySpawned < this.enemyTotal && this.launchClock <= 0) {
      this.launchEnemy();
      this.enemySpawned += 1;
      this.launchClock = Math.max(0.28, 1.5 - this.level * 0.08);
    }
    this.updateEntities(dt);
    if (!this.levelComplete && this.enemySpawned >= this.enemyTotal && this.enemyMissiles.length === 0) this.completeLevel();
    if (this.levelComplete && !this.gameOver) {
      this.levelTransition -= dt;
      if (this.levelTransition <= 0) this.startNextLevel();
    }
    this.deployReserveCities();
    this.checkGameOver();
  }
  updateAttacker(dt, input) {
    if (input.attack) this.launchPlayerEnemy(input.attack);
    this.interceptorClock -= dt;
    if (this.interceptorClock <= 0) {
      // Fires whenever it is loaded. The 30% chance of not firing is gone: the
      // reload interval is the limit, not a roll.
      this.launchMachineInterceptor();
      this.interceptorClock = this.aiTuning.reloadMin + Math.random() * (this.aiTuning.reloadMax - this.aiTuning.reloadMin);
    }
    for (const missile of this.enemyMissiles) this.moveEnemy(missile, dt);
    for (const missile of this.interceptors) if (this.moveInterceptor(missile, dt)) missile.dead = true;
    // Both sides are checked for dead before scoring. Marking an entity dead is
    // not enough on its own: the nested loop kept iterating over an already
    // resolved enemy, so two interceptors overlapping one missile each awarded
    // a kill. The defender's fireball pass already guarded this way.
    for (const interceptor of this.interceptors) {
      if (interceptor.dead) continue;
      for (const enemy of this.enemyMissiles) {
        if (enemy.dead) continue;
        if (!circleHitsCircle(interceptor.x, interceptor.y, INTERCEPTOR_RADIUS, enemy.x, enemy.y, ENEMY_RADIUS)) continue;
        this.emit("intercept");
        interceptor.dead = true;
        enemy.dead = true;
        this.recordEnemyOutcome(enemy, "intercepted", { mode: "attacker" });
        break;
      }
    }
    for (const enemy of this.enemyMissiles) {
      if (!enemy.dead && enemy.freeFlight) {
        // A dragged missile flies where the player sent it, not toward the
        // randomly selected launch metadata. Only the target it touches counts.
        const target = [...this.cities, ...this.bases].find((candidate) => candidate.alive && circleHitsCircle(enemy.x, enemy.y, ENEMY_RADIUS, candidate.x, candidate.y, candidate.radius + IMPACT_MARGIN));
        if (target) {
          enemy.targetObject = target;
          enemy.kind = this.cities.includes(target) ? "city" : "battery";
          this.impactEnemy(enemy);
        }
      } else if (!enemy.dead && enemy.targetObject && enemy.y >= enemy.targetY - enemy.targetObject.radius - IMPACT_MARGIN) this.impactEnemy(enemy);
      if (!enemy.dead && enemy.y >= 560) {
        enemy.dead = true;
        this.recordEnemyOutcome(enemy, "offscreen-expiry");
      }
    }
    this.enemyMissiles = this.enemyMissiles.filter((missile) => !missile.dead && missile.y < 560);
    this.interceptors = this.interceptors.filter((missile) => !missile.dead);
    // The attacker's objective is the cities, so losing all batteries is losing
    // the means to that end: a loss, not a generic life loss. Raising the
    // engine's lifeLost flag here would restart the round with fresh cities and
    // fresh batteries, which is not a defeat at all.
    if (this.batteriesRemaining() === 0 && this.citiesRemaining() > 0) {
      this.gameOver = true;
      this.won = false;
      this.winner = "computer";
      this.emit("lose");
    }
    this.checkGameOver();
  }
  updateEntities(dt) {
    for (const interceptor of this.interceptors) {
      if (this.moveInterceptor(interceptor, dt)) {
        const caught = this.enemyMissiles.some((enemy) => !enemy.dead && circleHitsCircle(interceptor.targetX, interceptor.targetY, FIREBALL_RADIUS, enemy.x, enemy.y, ENEMY_RADIUS));
        if (caught) {
          interceptor.dead = true;
          this.fireballs.push({ x: interceptor.targetX, y: interceptor.targetY, radius: FIREBALL_RADIUS, life: FIREBALL_LIFE });
        } else {
          interceptor.missed = true;
          interceptor.life = 3;
          interceptor.vx = Math.cos(interceptor.travelAngle || 0) * interceptor.speed;
          interceptor.vy = Math.sin(interceptor.travelAngle || 0) * interceptor.speed;
        }
      }
    }
    for (const fireball of this.fireballs) {
      fireball.life -= dt;
      for (const enemy of this.enemyMissiles) {
        if (!enemy.dead && circleHitsCircle(fireball.x, fireball.y, fireball.radius, enemy.x, enemy.y, ENEMY_RADIUS + FIREBALL_ENEMY_BONUS)) {
          enemy.dead = true;
          this.emit("intercept");
          this.recordEnemyOutcome(enemy, "intercepted", { mode: "defender" });
          this.score += enemy.smart ? 35 : 15;
          if (enemy.splitCount > 0) this.splitEnemy(enemy);
        }
      }
    }
    for (const enemy of this.enemyMissiles) this.moveEnemy(enemy, dt);
    for (const enemy of this.enemyMissiles) {
      if (enemy.dead || enemy.aircraft) continue;
      if (enemy.y >= enemy.targetY - (enemy.targetObject?.radius || 0) - IMPACT_MARGIN) this.impactEnemy(enemy);
    }
    this.fireballs = this.fireballs.filter((fireball) => fireball.life > 0);
    this.enemyMissiles = this.enemyMissiles.filter((missile) => !missile.dead);
    this.interceptors = this.interceptors.filter((missile) => !missile.dead);
  }
  moveInterceptor(interceptor, dt) {
    if (interceptor.missed) {
      interceptor.x += interceptor.vx * dt;
      interceptor.y += interceptor.vy * dt;
      interceptor.life -= dt;
      return interceptor.life <= 0;
    }
    const dx = interceptor.targetX - interceptor.x;
    const dy = interceptor.targetY - interceptor.y;
    const length = Math.hypot(dx, dy);
    if (length < 6) return true;
    interceptor.x += dx / length * interceptor.speed * dt;
    interceptor.y += dy / length * interceptor.speed * dt;
    return false;
  }
  moveEnemy(enemy, dt) {
    if (enemy.dead) return;
    if (enemy.freeFlight) {
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.x < -30 || enemy.x > 830 || enemy.y < -30 || enemy.y > 590) {
        enemy.dead = true;
        this.recordEnemyOutcome(enemy, "offscreen-expiry");
      }
      return;
    }
    if (enemy.aircraft) {
      enemy.x += Math.sign(enemy.targetX - enemy.x) * enemy.speed * dt;
      enemy.dropClock -= dt;
      if (enemy.dropClock <= 0) {
        enemy.dropClock = 1.6;
        const destination = this.cities.find((city) => city.alive) || this.bases.find((base) => base.alive);
        if (destination) this.enemyMissiles.push({ id: this.nextEntityId++, x: enemy.x, y: enemy.y, targetX: destination.x, targetY: destination.y, speed: enemy.speed, color: "#fb7185", kind: "city", targetObject: destination, smart: false, splitCount: 0, isSplit: true, dead: false, outcome: null });
      }
      if (enemy.x < -30 || enemy.x > 830) {
        enemy.dead = true;
        this.recordEnemyOutcome(enemy, "offscreen-expiry");
      }
      return;
    }
    const dx = enemy.targetX - enemy.x;
    const dy = enemy.targetY - enemy.y;
    const length = Math.hypot(dx, dy);
    if (length < 5) return;
    enemy.x += dx / length * enemy.speed * dt;
    enemy.y += dy / length * enemy.speed * dt;
  }
  impactEnemy(enemy) {
    if (enemy.dead || enemy.outcome) return;
    enemy.dead = true;
    const target = enemy.targetObject || enemy.targetBase;
    const destroyed = target?.alive === true;
    if (target) target.alive = false;
    const targetKind = enemy.kind || (target?.radius === 12 ? "city" : "battery");
    if (destroyed && targetKind === "city") this.emit("city");
    const reward = this.side === "attacker" && destroyed ? (targetKind === "city" ? ATTACKER_CITY_SCORE : ATTACKER_BATTERY_SCORE) : 0;
    this.score += reward;
    this.recordEnemyOutcome(enemy, "target-impact", { target: targetKind, score: reward });
  }
  splitEnemy(enemy) {
    const childTargets = [...this.cities.filter((city) => city.alive), ...this.bases.filter((base) => base.alive)];
    for (let index = 0; index < 2; index += 1) {
      const destination = childTargets[Math.floor(Math.random() * childTargets.length)];
      if (!destination) continue;
      this.enemyMissiles.push({ id: this.nextEntityId++, x: enemy.x, y: enemy.y, targetX: destination.x, targetY: destination.y, speed: enemy.speed * 0.9, color: enemy.color, kind: destination === this.cities[0] || destination.y === BASE_Y && destination.radius === 12 ? "city" : "battery", targetObject: destination, smart: enemy.smart, splitCount: 0, isSplit: true, dead: false, outcome: null });
    }
  }
  completeLevel() {
    this.levelComplete = true;
    this.levelTransition = 2.2;
    const remainingMissiles = this.bases.reduce((total, base) => total + (base.alive ? base.missiles : 0), 0);
    const remainingCities = this.cities.filter((city) => city.alive).length;
    this.score += (remainingMissiles + remainingCities) * 25 * this.multiplier;
    this.emit("wave");
    if (this.score >= this.nextCityBonus) {
      this.reserveCities += 1;
      this.nextCityBonus += 1500 * this.multiplier;
    }
  }
  startNextLevel() {
    this.level += 1;
    this.multiplier = Math.min(6, 1 + Math.floor((this.level - 1) / 2));
    this.enemyTotal = 12 + this.level * 4;
    this.enemySpawned = 0;
    this.launchClock = 0.5;
    this.levelComplete = false;
    this.levelTransition = 0;
  }
  deployReserveCities() {
    if (!this.reserveCities) return;
    const destroyed = this.cities.find((city) => !city.alive);
    if (!destroyed) return;
    destroyed.alive = true;
    this.reserveCities -= 1;
  }
  // The objective in both modes is the six cities: Defender protects them, and
// Attacker destroys them. Batteries are the means to that end -- interceptors
// for the defender, and for the attacker the batteries that shoot back. That is
// the reading the mode selector, the mode name, and this existing
// city-based check all pointed at; the copy elsewhere disagreed with them.
//
// So the terminal states are mirrored:
//   Defender: all cities lost -> game over ("The End").
//   Attacker: all cities lost -> the attacker wins.
//   Attacker: all batteries lost -> the attacker is out of options, a loss.
  citiesRemaining() { return this.cities.filter((city) => city.alive).length; }
  batteriesRemaining() { return this.bases.filter((base) => base.alive).length; }
  checkGameOver() {
    if (this.side === "attacker") {
      if (this.citiesRemaining() === 0) {
        this.gameOver = true;
        this.won = true;
        this.winner = "human";
        this.emit("win");
      }
      return;
    }
    if (this.citiesRemaining() === 0 && this.reserveCities === 0) { this.gameOver = true; this.emit("lose"); }
  }
  handleLifeLoss() {
    if (this.side === "attacker") {
      if (this.winner === "computer") return { gameOver: true, message: "The batteries are gone — the cities hold." };
      if (this.gameOver) return { gameOver: true, message: "Every city is down — you win." };
      return null;
    }
    return this.gameOver ? { gameOver: true, message: "The End" } : null;
  }
  closestTarget(x) {
    const targets = [
      ...this.cities.filter((city) => city.alive).map((city) => ({ target: city, kind: "city" })),
      ...this.bases.filter((base) => base.alive).map((base) => ({ target: base, kind: "battery" })),
    ];
    return targets.reduce((closest, candidate) => !closest || Math.abs(candidate.target.x - x) < Math.abs(closest.target.x - x) ? candidate : closest, targets[0]);
  }
  closestBattery(x) {
    const target = this.bases.reduce((closest, base) => Math.abs(base.x - x) < Math.abs(closest.x - x) ? base : closest, this.bases[0]);
    return { target, kind: "battery" };
  }
  publicState() {
    const status = this.side === "defender"
      ? `Level ${this.level} · ${this.multiplier}x · choose a battery with Left/Right and press Space or click to launch`
      : `Cities ${this.citiesRemaining()}/6 · Batteries ${this.batteriesRemaining()}/3 · destroy the cities`;
    return { title: this.title, description: this.description, side: this.sideLabel(), status };
  }
}
