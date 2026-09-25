import { circleHitsCircle, clamp } from "../../engine.js";

const BATTERY_X = [130, 400, 670];
const CITY_X = [70, 200, 300, 500, 600, 730];
const BATTERY_MISSILES = 10;
const BASE_Y = 510;
const INTERCEPTOR_RADIUS = 8;
const ENEMY_RADIUS = 11;
const FIREBALL_RADIUS = 46;
const FIREBALL_LIFE = 4;

export class MissileModel {
  constructor() {
    this.id = "missile";
    this.title = "Missile Command";
    this.description = "Move the crosshair, choose a battery with Left/Right, then click to launch an interceptor. Protect six cities as the levels intensify.";
    this.side = "defender";
    this.score = 0;
  }
  sideLabel() { return this.side === "defender" ? "You defend the cities" : "You attack the batteries"; }
  setSide(side) { this.side = side; }
  reset(keepScore = false) {
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
    this.enemyResolved = 0;
    this.launchClock = 0.6;
    this.interceptorClock = 0;
    this.levelComplete = false;
    this.levelTransition = 0;
    this.lifeLost = false;
    this.gameOver = false;
    this.winner = null;
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
      this.enemyMissiles.push({ x: Math.random() < 0.5 ? 24 : 776, y: 70 + Math.random() * 80, targetX: Math.random() < 0.5 ? 820 : -20, targetY: 70 + Math.random() * 80, speed: 70 + this.level * 8, color: "#f472b6", kind: Math.random() < 0.5 ? "bomber" : "satellite", aircraft: true, dropClock: 1.4, isSplit: false, dead: false });
      return;
    }
    const smart = this.level > 1 && Math.random() < 0.18;
    const splitCount = this.level > 2 && Math.random() < 0.32 ? 1 : 0;
    const startX = 40 + Math.random() * 720;
    this.enemyMissiles.push({ x: startX, y: 20, targetX: destination.target.x, targetY: destination.target.y, speed: 78 + this.level * 8 + this.score * 0.15, color: smart ? "#fbbf24" : "#fb7185", kind: destination.kind, targetObject: destination.target, smart, splitCount, isSplit: false, dead: false, freeFlight: Boolean(options.freeFlight), vx: options.vx || 0, vy: options.vy || 0 });
  }
  launchPlayerEnemy(pointer) {
    if (!pointer) return;
    const dragged = pointer.dragDistance > 0 && (pointer.released || pointer.down);
    if (dragged) {
      const dx = pointer.dragDeltaX || pointer.x - pointer.dragStartX;
      const dy = pointer.dragDeltaY || pointer.y - pointer.dragStartY;
      const angle = Math.atan2(dy, dx);
      const speed = 180;
      this.launchEnemy(null, { freeFlight: true, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
      return;
    }
    const interactive = "clicked" in pointer || "released" in pointer || "down" in pointer || "dragDistance" in pointer;
    if (pointer.clicked || pointer.released || pointer.down || (pointer.x !== undefined && pointer.y !== undefined)) this.launchEnemy(interactive ? this.closestTarget(pointer.x) : this.closestBattery(pointer.x));
  }
  launchMachineInterceptor() {
    const base = this.bases.find((candidate) => candidate.alive);
    const target = this.enemyMissiles[0];
    if (!base || !target) return;
    const dx = target.targetX - target.x;
    const dy = target.targetY - target.y;
    const distance = Math.hypot(dx, dy);
    const flightTime = Math.hypot(target.x - base.x, target.y - base.y) / 245;
    this.interceptors.push({ x: base.x, y: base.y - 20, targetX: target.x + (distance ? dx / distance * target.speed * flightTime : 0) + (Math.random() - 0.5) * 120, targetY: target.y + (distance ? dy / distance * target.speed * flightTime : 0) + (Math.random() - 0.5) * 90, speed: 245, color: "#22d3ee", machine: true });
  }
  update(dt, input) {
    if (this.side === "defender") this.updateDefender(dt, input);
    else this.updateAttacker(dt, input);
  }
  updateDefender(dt, input) {
    if (input.aim) this.target = { x: input.aim.x, y: clamp(input.aim.y, 28, 500) };
    this.selectBattery(input.batteryDirection || 0);
    if (input.launch && this.launchInterceptor()) this.interceptorClock = 0.12;
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
    this.launchClock -= dt;
    if (this.launchClock <= 0) {
      this.launchEnemy(this.closestBattery(40 + Math.random() * 720));
      this.launchClock = Math.max(0.65, 2.1 - this.score * 0.012);
    }
    this.interceptorClock -= dt;
    if (this.interceptorClock <= 0) {
      if (Math.random() < 0.55) this.launchMachineInterceptor();
      this.interceptorClock = 0.55 + Math.random() * 0.35;
    }
    for (const missile of this.enemyMissiles) this.moveEnemy(missile, dt);
    for (const missile of this.interceptors) if (this.moveInterceptor(missile, dt)) missile.dead = true;
    for (const interceptor of this.interceptors) for (const enemy of this.enemyMissiles) if (circleHitsCircle(interceptor.x, interceptor.y, 4, enemy.x, enemy.y, 5)) { interceptor.dead = true; enemy.dead = true; this.score += 15; }
    for (const enemy of this.enemyMissiles) if (enemy.targetObject?.alive && enemy.y >= enemy.targetY - enemy.targetObject.radius - 8) { enemy.targetObject.alive = false; enemy.dead = true; }
    this.enemyMissiles = this.enemyMissiles.filter((missile) => !missile.dead && missile.y < 560);
    this.interceptors = this.interceptors.filter((missile) => !missile.dead);
    if (this.bases.every((base) => !base.alive)) this.lifeLost = true;
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
        if (!enemy.dead && circleHitsCircle(fireball.x, fireball.y, fireball.radius, enemy.x, enemy.y, ENEMY_RADIUS + 4)) {
          enemy.dead = true;
          this.score += enemy.smart ? 35 : 15;
          if (enemy.splitCount > 0) this.splitEnemy(enemy);
        }
      }
    }
    for (const enemy of this.enemyMissiles) this.moveEnemy(enemy, dt);
    for (const enemy of this.enemyMissiles) {
      if (enemy.dead || enemy.aircraft) continue;
      if (enemy.y >= enemy.targetY - (enemy.targetObject?.radius || 0) - 8) this.impactEnemy(enemy);
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
    if (enemy.freeFlight) {
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.x < -30 || enemy.x > 830 || enemy.y < -30 || enemy.y > 590) enemy.dead = true;
      return;
    }
    if (enemy.aircraft) {
      enemy.x += Math.sign(enemy.targetX - enemy.x) * enemy.speed * dt;
      enemy.dropClock -= dt;
      if (enemy.dropClock <= 0) {
        enemy.dropClock = 1.6;
        const destination = this.cities.find((city) => city.alive) || this.bases.find((base) => base.alive);
        if (destination) this.enemyMissiles.push({ x: enemy.x, y: enemy.y, targetX: destination.x, targetY: destination.y, speed: enemy.speed, color: "#fb7185", kind: "city", targetObject: destination, smart: false, splitCount: 0, isSplit: true, dead: false });
      }
      if (enemy.x < -30 || enemy.x > 830) enemy.dead = true;
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
    enemy.dead = true;
    const target = enemy.targetObject || enemy.targetBase;
    if (target) target.alive = false;
    if (!enemy.isSplit) this.enemyResolved += 1;
  }
  splitEnemy(enemy) {
    const childTargets = [...this.cities.filter((city) => city.alive), ...this.bases.filter((base) => base.alive)];
    for (let index = 0; index < 2; index += 1) {
      const destination = childTargets[Math.floor(Math.random() * childTargets.length)];
      if (!destination) continue;
      this.enemyMissiles.push({ x: enemy.x, y: enemy.y, targetX: destination.x, targetY: destination.y, speed: enemy.speed * 0.9, color: enemy.color, kind: destination === this.cities[0] || destination.y === BASE_Y && destination.radius === 12 ? "city" : "battery", targetObject: destination, smart: enemy.smart, splitCount: 0, isSplit: true, dead: false });
    }
  }
  completeLevel() {
    this.levelComplete = true;
    this.levelTransition = 2.2;
    const remainingMissiles = this.bases.reduce((total, base) => total + (base.alive ? base.missiles : 0), 0);
    const remainingCities = this.cities.filter((city) => city.alive).length;
    this.score += (remainingMissiles + remainingCities) * 25 * this.multiplier;
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
    this.enemyResolved = 0;
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
  checkGameOver() {
    if (this.cities.every((city) => !city.alive) && this.reserveCities === 0) this.gameOver = true;
  }
  handleLifeLoss() { return this.gameOver ? { gameOver: true, message: "The End" } : null; }
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
  publicState() { return { title: this.title, description: this.description, side: this.sideLabel(), status: `Level ${this.level} · ${this.multiplier}x · choose a battery with Left/Right and click to launch` }; }
}
