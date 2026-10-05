import test from "node:test";
import assert from "node:assert/strict";
import { SnakeModel, SNAKE_AI_DEFAULTS } from "../../src/games/snake/model.js";
import { BreakoutModel, BREAKOUT_AI_DEFAULTS } from "../../src/games/breakout/model.js";
import { AsteroidsModel, ASTEROIDS_AI_DEFAULTS } from "../../src/games/asteroids/model.js";
import { MissileModel, MISSILE_AI_DEFAULTS } from "../../src/games/missile/model.js";
import { SplatModel, SPLAT_AI_DEFAULTS } from "../../src/games/splat/model.js";
import { StarfallModel, STARFALL_AI_DEFAULTS } from "../../src/games/starfall/model.js";
import { measureSnake } from "./snake.mjs";
import { measureBreakout } from "./breakout.mjs";
import { measureAsteroids } from "./asteroids.mjs";
import { measureMissile } from "./missile.mjs";
import { measureSplat } from "./splat.mjs";
import { measureStarfall } from "./starfall.mjs";

// No random-error switches: a fixed draw isolates a policy factor from jitter.
function withDraw(draw, run) {
  const original = Math.random;
  Math.random = () => draw;
  try { return run(); } finally { Math.random = original; }
}
function model(Model, side, aiTuning = {}) {
  const game = new Model({ aiTuning });
  game.setSide(side);
  game.reset();
  return game;
}
const models = [
  [SnakeModel, SNAKE_AI_DEFAULTS, "apples"],
  [BreakoutModel, BREAKOUT_AI_DEFAULTS, "blocks"],
  [AsteroidsModel, ASTEROIDS_AI_DEFAULTS, "rocks"],
  [MissileModel, MISSILE_AI_DEFAULTS, "attacker"],
  [SplatModel, SPLAT_AI_DEFAULTS, "builder"],
  [StarfallModel, STARFALL_AI_DEFAULTS, "stars"]
];
for (const [Model, defaults, side] of models) {
  test(`${Model.name}: defaults and partial tuning are isolated and survive round/life reset`, () => withDraw(0.5, () => {
    const ordinary = model(Model, side);
    assert.deepEqual(ordinary.aiTuning, defaults);
    const key = Object.keys(defaults)[0];
    const supplied = { [key]: defaults[key] / 2 };
    const custom = model(Model, side, supplied);
    assert.equal(custom.aiTuning[key], supplied[key]);
    custom.aiTuning[key] /= 2;
    assert.equal(supplied[key], defaults[key] / 2, "caller configuration is not mutated");
    assert.equal(ordinary.aiTuning[key], defaults[key], "another model is not retuned");
    const tuning = custom.aiTuning;
    custom.reset();
    if (custom.resetAfterLife) custom.resetAfterLife();
    assert.equal(custom.aiTuning, tuning, "reset clears state, not configuration");
    assert.equal(custom.aiTuning[key], defaults[key] / 4);
  }));
}

test("Snake: perception, movement commitment and speed change actual turns", () => withDraw(0.5, () => {
  const perception = (aiTuning) => {
    const game = model(SnakeModel, "apples", aiTuning);
    game.refreshPerception(0);
    game.apple = { x: 10, y: 10 };
    game.refreshPerception(0.05);
    return game.aiPerceivedApple;
  };
  assert.notDeepEqual(perception({}), perception({ perceptionInterval: 0 }));
  assert.deepEqual(perception({ perceptionInterval: 0 }), { x: 10, y: 10 });
  const turn = (aiTuning) => {
    const game = model(SnakeModel, "apples", aiTuning);
    const head = game.snake[0];
    game.aiPerceivedApple = { x: head.x, y: head.y - 5 };
    game.chooseDirection();
    game.direction = game.nextDirection;
    game.aiPerceivedApple = { x: head.x + 5, y: head.y };
    game.chooseDirection();
    return game.nextDirection;
  };
  assert.deepEqual(turn({}), { x: 0, y: -1 });
  assert.deepEqual(turn({ commitMoves: 0 }), { x: 1, y: 0 });
  const moved = (aiTuning) => {
    const game = model(SnakeModel, "apples", aiTuning);
    const before = { ...game.snake[0] };
    game.update(0.1, {});
    return JSON.stringify(before) !== JSON.stringify(game.snake[0]);
  };
  assert.equal(moved({}), false);
  assert.equal(moved({ moveIntervalScale: 0.25 }), true);
  const legacy = model(SnakeModel, "apples");
  legacy.aiPerceptionInterval = 0;
  legacy.aiCommitMoves = 0;
  legacy.reset();
  assert.equal(legacy.aiTuning.perceptionInterval, 0);
  assert.equal(legacy.aiTuning.commitMoves, 0);
  legacy.aiTuning.commitMoves = 4;
  assert.equal(legacy.aiCommitMoves, 4);
}));

const paddleInput = { mode: "keyboard", keyDirection: 0, pointer: { x: 400, moved: false } };
function breakout(aiTuning = {}, side = "blocks") {
  const game = model(BreakoutModel, side, aiTuning);
  game.balls = [game.newBall(700, side === "versus" ? 300 : 400, 0, side === "versus" ? -100 : 100)];
  return game;
}
test("Breakout: initial reaction, sampled reaction and dwell gate replanning", () => withDraw(0.5, () => {
  const waiting = breakout();
  waiting.moveHuman(0, paddleInput);
  assert.equal(waiting.lastDecision, null);
  const ready = breakout({ initialReaction: 0 });
  ready.moveHuman(0, paddleInput);
  assert.equal(ready.lastDecision.intent, 1);
  for (const [key, value, baseline] of [["reactionMin", 0.16, 0.14], ["reactionMax", 1, 0.14], ["dwellMin", 0.3, 0.28], ["dwellMax", 1, 0.28]]) {
    const game = breakout({ initialReaction: 0, [key]: value });
    game.moveHuman(0, paddleInput);
    const timer = key.startsWith("reaction") ? game.computerReaction : game.computerDwell;
    assert.ok(timer > baseline, `${key} changes the next decision deadline`);
  }
  const intentAfterBallMoves = (aiTuning) => {
    const game = breakout({ initialReaction: 0, ...aiTuning });
    game.moveHuman(0, paddleInput);
    game.balls[0].x = 100;
    game.moveHuman(0.05, paddleInput);
    return game.computerIntent;
  };
  assert.equal(intentAfterBallMoves({ dwellMin: 0, dwellMax: 0 }), 1, "reaction holds the read");
  assert.equal(intentAfterBallMoves({ reactionMin: 0, reactionMax: 0 }), 1, "dwell holds the decision");
  assert.equal(intentAfterBallMoves({ reactionMin: 0, reactionMax: 0, dwellMin: 0, dwellMax: 0 }), -1);
}));
test("Breakout: lookahead, arrival, idle policy and speed change paddle movement", () => withDraw(0.5, () => {
  const predictedIntent = (lookaheadBounces) => {
    const game = breakout({ initialReaction: 0, lookaheadBounces });
    game.balls = [game.newBall(400, 200, 1000, 100)];
    game.moveHuman(0, paddleInput);
    return game.computerIntent;
  };
  assert.equal(predictedIntent(1), 1);
  assert.equal(predictedIntent(Infinity), -1);
  const tolerant = breakout({ initialReaction: 0, arriveTolerance: 500 });
  tolerant.moveHuman(0.1, paddleInput);
  assert.equal(tolerant.computer.x, 350);
  for (const [speed, expected] of [[600, 410], [100, 360]]) {
    const game = breakout({ initialReaction: 0, speed });
    game.moveHuman(0.1, paddleInput);
    assert.equal(game.computer.x, expected);
  }
  const idle = (aiTuning) => {
    const game = breakout(aiTuning);
    game.balls[0].vy = -100;
    game.moveHuman(0.1, paddleInput);
    return game.computerIntent;
  };
  assert.equal(idle({}), 0);
  assert.equal(idle({ idleTolerance: 0 }), -1);
  assert.equal(idle({ idleCenterX: 600 }), 1);
}));
test("Breakout versus: separate reaction bounds and speed govern the upper paddle", () => withDraw(0.5, () => {
  for (const [key, value] of [["versusReactionMin", 0.22], ["versusReactionMax", 1]]) {
    const game = breakout({ [key]: value }, "versus");
    game.moveHuman(0, paddleInput);
    assert.ok(game.computerVersusReaction > 0.2);
    game.moveHuman(0.2, paddleInput);
    assert.equal(game.lastDecision, null, `${key} delays the new incoming ball`);
  }
  for (const [versusSpeed, expected] of [[360, 386], [100, 360]]) {
    const game = breakout({ versusReactionMin: 0, versusReactionMax: 0, versusSpeed }, "versus");
    game.moveHuman(0.1, paddleInput);
    assert.equal(game.computer.x, expected);
  }
}));

function asteroid(aiTuning = {}, side = "rocks") {
  const game = model(AsteroidsModel, side, aiTuning);
  game.asteroids = [{ id: 1, x: 600, y: 280, vx: 0, vy: 0, radius: 20, rotation: 0, spin: 0 }];
  return game;
}
test("Asteroids: reaction holds old aim while turn rate and speeds bound motion", () => withDraw(0.5, () => {
  for (const [key, value] of [["reactionMin", 0.3], ["reactionMax", 1]]) {
    const game = asteroid({ [key]: value });
    game.aiShip(0);
    assert.ok(game.ship.aiReaction > 0.28);
  }
  const aim = (aiTuning) => {
    const game = asteroid(aiTuning);
    game.ship.angle = 0;
    game.aiShip(0);
    game.asteroids[0].y = 400;
    game.aiShip(0.1);
    return game.lastDecision.desiredAngle;
  };
  assert.equal(aim({}), 0);
  assert.ok(aim({ reactionMin: 0, reactionMax: 0 }) > 0.5);
  const turn = (turnRate) => {
    const game = asteroid({ turnRate });
    game.ship.angle = 1;
    game.aiShip(0.1);
    return game.ship.angle;
  };
  assert.ok(turn(10) < turn(3.6));
  for (const [side, key, defaultSpeed] of [["rocks", "speed", 165], ["versus", "versusSpeed", 105]]) {
    for (const speed of [defaultSpeed, 50]) {
      const game = asteroid({ [key]: speed }, side);
      const ship = side === "versus" ? game.computerShip : game.ship;
      const before = { x: ship.x, y: ship.y };
      game.aiShip(0.1, ship);
      assert.equal(ship.speed, speed);
      assert.ok(Math.abs(Math.hypot(ship.x - before.x, ship.y - before.y) - speed * 0.1) < 1e-10);
    }
  }
}));
test("Asteroids: dodge range, escape granularity and commitment change swerves", () => withDraw(0.5, () => {
  const dodge = (aiTuning) => {
    const game = asteroid(aiTuning);
    game.asteroids[0].x = 480;
    game.asteroids[0].y = 300;
    game.aiShip(0);
    return game;
  };
  assert.equal(dodge({}).lastDecision.dodging, true);
  assert.equal(dodge({ dodgeRange: 50 }).lastDecision.dodging, false);
  assert.notEqual(dodge({ escapeChoices: 8 }).ship.aiEscape, dodge({ escapeChoices: 16 }).ship.aiEscape);
  for (const [key, value] of [["dodgeCommitMin", 0.25], ["dodgeCommitMax", 1]]) assert.ok(dodge({ [key]: value }).ship.aiDodgeCommit > 0.22);
  for (const [aiTuning, replanned] of [[{}, false], [{ dodgeCommitMin: 0, dodgeCommitMax: 0 }, true]]) {
    const game = dodge(aiTuning);
    game.asteroids[0].y = 260;
    game.aiShip(0.01);
    assert.equal(game.lastDecision.replanned, replanned);
  }
}));
test("Asteroids: shot delays, per-mode cadence and jitter control real firing", () => withDraw(0.5, () => {
  const early = asteroid({ initialShotDelay: 0 });
  early.update(0, {});
  assert.equal(early.bullets.length, 1);
  const normal = asteroid();
  normal.update(0, {});
  assert.equal(normal.bullets.length, 0);
  for (const [side, key] of [["rocks", "shotInterval"], ["versus", "versusShotInterval"]]) {
    const game = asteroid({ initialShotDelay: 0, [key]: 2 }, side);
    game.update(0, {});
    assert.equal(game.computerShotClock, 2.15);
  }
  const jitter = asteroid({ initialShotDelay: 0, shotJitter: 1 });
  jitter.update(0, {});
  assert.equal(jitter.computerShotClock, 1.8);
  const empty = asteroid({ initialShotDelay: 0, noTargetShotDelay: 2 });
  empty.asteroids = [];
  empty.update(0, {});
  assert.equal(empty.computerShotClock, 2);
  assert.equal(empty.bullets.length, 0);
}));

function missile(aiTuning = {}) {
  const game = model(MissileModel, "attacker", aiTuning);
  game.enemyMissiles = [{ x: 300, y: 100, targetX: 400, targetY: 510, speed: 80 }];
  return game;
}
test("Missile: lead and interceptor speed change aim and actual projectile motion", () => withDraw(0.5, () => {
  const ordinary = missile();
  ordinary.launchMachineInterceptor();
  const noLead = missile({ lead: 0 });
  noLead.launchMachineInterceptor();
  assert.equal(noLead.interceptors[0].targetX, 300);
  assert.ok(ordinary.interceptors[0].targetX > 300);
  const fast = missile({ interceptorSpeed: 490 });
  fast.launchMachineInterceptor();
  assert.ok(fast.interceptors[0].targetX < ordinary.interceptors[0].targetX, "faster shot needs less lead");
  for (const game of [ordinary, fast]) {
    const shot = game.interceptors[0];
    const before = { x: shot.x, y: shot.y };
    game.moveInterceptor(shot, 0.1);
    assert.ok(Math.abs(Math.hypot(shot.x - before.x, shot.y - before.y) - shot.speed * 0.1) < 1e-10);
  }
  const human = model(MissileModel, "defender", { interceptorSpeed: 1, lead: 0 });
  human.launchInterceptor();
  assert.equal(human.interceptors[0].speed, 470, "human physics is not retuned");
}));
test("Missile: each reload bound changes the next battery firing opportunity", () => withDraw(0.5, () => {
  for (const [key, value] of [["reloadMin", 0.8], ["reloadMax", 2]]) {
    const game = missile({ [key]: value });
    game.updateAttacker(0, {});
    assert.ok(game.interceptorClock > 0.8);
    game.updateAttacker(0.75, {});
    assert.equal(game.decisionLog.length, 1);
  }
  const ordinary = missile();
  ordinary.updateAttacker(0, {});
  ordinary.updateAttacker(0.75, {});
  assert.equal(ordinary.decisionLog.length, 2);
}));

function splat(aiTuning = {}) {
  const game = model(SplatModel, "builder", aiTuning);
  game.columns = [{ x: 190, gapY: 100, gapHeight: 100, passed: false }];
  return game;
}
test("Splat: lookahead and target tolerance control when a new gap is chosen", () => withDraw(0.5, () => {
  const ordinary = splat();
  ordinary.moveComputer(ordinary.player, 0);
  assert.equal(ordinary.lastDecision.targetY, 150);
  const shortSight = splat({ lookahead: 50 });
  shortSight.moveComputer(shortSight.player, 0);
  assert.equal(shortSight.lastDecision, null);
  const changedGap = (targetTolerance) => {
    const game = splat({ targetTolerance, commitMin: 0, commitMax: 0 });
    game.moveComputer(game.player, 0);
    game.columns[0].gapY += 20;
    game.moveComputer(game.player, 0.01);
    return game.player.aiTargetY;
  };
  assert.equal(changedGap(24), 150);
  assert.equal(changedGap(0), 170);
}));
test("Splat: reaction and commitment independently hold a stale steering target", () => withDraw(0.5, () => {
  for (const [key, value, baseline] of [["reactionMin", 0.25, 0.21], ["reactionMax", 1, 0.21], ["commitMin", 0.3, 0.3], ["commitMax", 1, 0.3]]) {
    const game = splat({ [key]: value });
    game.moveComputer(game.player, 0);
    assert.ok((key.startsWith("reaction") ? game.player.aiReaction : game.player.aiCommit) > baseline);
  }
  const reactionDirection = (aiTuning) => {
    const game = splat({ commitMin: 0, commitMax: 0, ...aiTuning });
    game.moveComputer(game.player, 0);
    game.columns[0].gapY += 20;
    game.player.y = 160;
    game.moveComputer(game.player, 0.01);
    return Math.sign(game.player.vy);
  };
  assert.equal(reactionDirection({}), -1);
  assert.equal(reactionDirection({ reactionMin: 0, reactionMax: 0 }), 1);
  const committedTarget = (aiTuning) => {
    const game = splat(aiTuning);
    game.moveComputer(game.player, 0);
    game.columns[0].gapY += 200;
    game.moveComputer(game.player, 0.01);
    return game.player.aiTargetY;
  };
  assert.equal(committedTarget({}), 150);
  assert.equal(committedTarget({ commitMin: 0, commitMax: 0 }), 350);
}));
test("Splat: acceleration, velocity cap/gain and horizontal speed bound the ball", () => withDraw(0.5, () => {
  const velocity = (aiTuning, dt) => {
    const game = splat(aiTuning);
    game.moveComputer(game.player, dt);
    return game.player.vy;
  };
  assert.equal(velocity({}, 0.1), -62);
  assert.equal(velocity({ thrust: 100 }, 0.1), -10);
  assert.equal(velocity({}, 1), -360);
  assert.equal(velocity({ maxFall: 30 }, 1), -30);
  assert.equal(velocity({ velocityGain: 1 }, 1), -130);
  const game = model(SplatModel, "race", { horizontalSpeed: 60 });
  game.updateRace(0.1, {});
  assert.equal(game.computerPlayer.x, 76);
  assert.equal(game.player.x, 82, "human speed is unchanged");
  const builder = splat({ horizontalSpeed: 60 });
  builder.updateBuilder(0.1, {});
  assert.equal(builder.player.x, 76);
}));

function starfall(aiTuning = {}) {
  const game = model(StarfallModel, "stars", aiTuning);
  game.gems = [{ x: 440, y: 400 }];
  return game;
}
test("Starfall: vision and each perception bound change what the runner knows", () => withDraw(0.5, () => {
  const visible = (visionHeight) => {
    const game = starfall({ visionHeight });
    game.stars = [{ x: 400, y: 200 }];
    game.aiRunner(0);
    return game.aiSeenStars.length;
  };
  assert.equal(visible(300), 0);
  assert.equal(visible(100), 1);
  for (const [key, value] of [["perceptionMin", 0.2], ["perceptionMax", 1]]) {
    const game = starfall({ [key]: value });
    game.aiRunner(0);
    assert.ok(game.aiPerceptionClock > 0.17);
  }
  const seenX = (aiTuning) => {
    const game = starfall(aiTuning);
    game.stars = [{ x: 400, y: 350 }];
    game.aiRunner(0);
    game.stars[0].x = 720;
    game.aiRunner(0.05);
    return game.aiSeenStars[0].x;
  };
  assert.equal(seenX({}), 400);
  assert.equal(seenX({ perceptionMin: 0, perceptionMax: 0 }), 720);
}));
test("Starfall: lane commitment, corridor clearance and candidates change dodges", () => withDraw(0.5, () => {
  for (const [key, value] of [["laneCommitMin", 0.9], ["laneCommitMax", 2]]) {
    const game = starfall({ [key]: value });
    game.aiRunner(0);
    assert.ok(game.aiLaneCommit > 0.75);
  }
  const heldLane = (aiTuning) => {
    const game = starfall({ perceptionMin: 0, perceptionMax: 0, ...aiTuning });
    game.aiRunner(0);
    game.stars = [{ x: 440, y: 350 }];
    game.aiRunner(0.1);
    return game.aiTargetX;
  };
  assert.equal(heldLane({}), 440);
  assert.notEqual(heldLane({ laneCommitMin: 0, laneCommitMax: 0 }), 440);
  const corridorLane = (laneWidth) => {
    const game = starfall({ laneWidth });
    game.stars = [{ x: 480, y: 350 }];
    game.aiRunner(0);
    return game.aiTargetX;
  };
  assert.equal(corridorLane(45), 300);
  assert.equal(corridorLane(20), 440);
  const supplied = [100, 700];
  const custom = starfall({ lanes: supplied });
  custom.aiRunner(0);
  assert.equal(custom.aiTargetX, 700);
  custom.aiTuning.lanes[0] = 200;
  assert.deepEqual(supplied, [100, 700]);
  assert.deepEqual(starfall().aiTuning.lanes, [20, 160, 300, 440, 580, 720, 780]);
  const ordinary = starfall();
  const altered = starfall({ laneWidth: 300, laneCommitMax: 10 });
  const distant = { x: 400, y: 350, vy: 130, radius: 10 };
  assert.equal(ordinary.threatensRunner(distant), false);
  assert.equal(altered.threatensRunner(distant), false, "policy tuning cannot reclassify accounting exposure");
}));
test("Starfall: speed and arrival tolerance change runner motion", () => withDraw(0.5, () => {
  for (const [speed, x] of [[220, 422], [100, 410]]) {
    const game = starfall({ speed });
    game.aiRunner(0.1);
    assert.equal(game.runner.x, x);
  }
  for (const [arriveTolerance, x] of [[4, 440], [0, 437]]) {
    const game = starfall({ arriveTolerance });
    game.runner.x = 437;
    game.aiRunner(0);
    assert.equal(game.runner.x, x);
  }
}));
test("Starfall: gem visibility margin and vertical weighting change target choice", () => withDraw(0.5, () => {
  const past = (gemPastMargin) => {
    const game = starfall({ gemPastMargin });
    game.gems[0].y = 540;
    game.aiRunner(0);
    return game.aiTargetGem;
  };
  assert.ok(past(50));
  assert.equal(past(20), null);
  const choice = (gemVerticalWeight) => {
    const game = starfall({ gemVerticalWeight });
    game.gems = [{ x: 440, y: 0 }, { x: 500, y: 500 }];
    game.aiRunner(0);
    return game.aiTargetGem.x;
  };
  assert.equal(choice(0.15), 500);
  assert.equal(choice(0), 440);
}));
test("Starfall: target lock and switching advantage change gem reconsideration", () => withDraw(0, () => {
  const locked = (targetLock) => {
    const game = starfall({ targetLock });
    game.aiRunner(0);
    game.gems[0].x = 700;
    game.gems.push({ x: 300, y: 400 });
    game.aiRunner(0.05);
    return game.aiTargetGem.x;
  };
  assert.equal(locked(0.45), 700);
  assert.equal(locked(0), 300);
  const advantage = (gemSwitchAdvantage) => {
    const game = starfall({ targetLock: 0, gemSwitchAdvantage });
    game.gems[0].x = 500;
    game.aiRunner(0);
    game.gems.push({ x: 480, y: 400 });
    game.aiRunner(0);
    return game.aiTargetGem.x;
  };
  assert.equal(advantage(25), 500);
  assert.equal(advantage(0), 480);
}));
test("Starfall: all three gem preference thresholds are independently injectable", () => {
  const choice = (draw, aiTuning) => withDraw(draw, () => {
    const game = starfall({ targetLock: 0, ...aiTuning });
    game.gems[0].x = 780;
    game.aiRunner(0);
    game.gems.push({ x: 400, y: 400 }, { x: 440, y: 400 }, { x: 500, y: 400 });
    game.aiRunner(0);
    return game.aiTargetGem.x;
  });
  assert.equal(choice(0.25, {}), 400);
  assert.equal(choice(0.25, { gemSwitchFirstChance: 0 }), 440);
  assert.equal(choice(0.7, {}), 440);
  assert.equal(choice(0.7, { gemSwitchSecondChance: 0 }), 500);
  assert.equal(choice(0.85, {}), 500);
  assert.equal(choice(0.85, { gemSwitchThirdChance: 0 }), 780);
});

for (const [measure, defaults] of [
  [measureSnake, SNAKE_AI_DEFAULTS], [measureBreakout, BREAKOUT_AI_DEFAULTS],
  [measureAsteroids, ASTEROIDS_AI_DEFAULTS], [measureMissile, MISSILE_AI_DEFAULTS],
  [measureSplat, SPLAT_AI_DEFAULTS], [measureStarfall, STARFALL_AI_DEFAULTS]
]) {
  test(`${measure.name}: explicit defaults retain identical seeded outcomes`, () => {
    const options = { runs: 4, steps: 600 };
    assert.deepEqual(measure({ ...options, aiTuning: { ...defaults } }), measure(options));
  });
}
test("Every Monte Carlo fixture accepts effective policy overrides", () => {
  const experiments = [
    [measureSnake, { settings: { cols: 12, rows: 9, startingLength: 7 } }, { perceptionInterval: 0, commitMoves: 0 }],
    [measureBreakout, {}, { speed: 0 }],
    [measureAsteroids, {}, { dodgeRange: 0 }],
    [measureMissile, {}, { lead: 0 }],
    [measureSplat, {}, { thrust: 0 }],
    [measureStarfall, {}, { speed: 0 }]
  ];
  for (const [measure, extra, aiTuning] of experiments) {
    const options = { runs: 4, steps: 1200, ...extra };
    assert.notDeepEqual(measure({ ...options, aiTuning }), measure(options), `${measure.name} uses injected tuning`);
  }
});
