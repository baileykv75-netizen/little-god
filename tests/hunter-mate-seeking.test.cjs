const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
let originalWanderCalls = 0;
let moved = [];

function hunter(id, sex, x, energy = 90) {
  return {
    id,
    type: "hunter",
    sex,
    x,
    y: 100,
    age: 3,
    energy,
    reproductionCooldown: 0,
    state: "wander",
    stateTimer: 0,
    angle: 0,
    derived: {
      maxEnergy: 100,
      walkSpeed: 50,
      senseRadius: 360,
      mateRange: 220,
    },
  };
}

function grazer(id, x) {
  return { id, type: "grazer", x, y: 120 };
}

const female = hunter(1, "female", 100);
const male = hunter(2, "male", 580);
const hungryFemale = hunter(3, "female", 250, 40);
const closeKinMale = hunter(4, "male", 650);

const state = {
  year: 4.25,
  hunters: [female, male, hungryFemale, closeKinMale],
  grazers: [
    grazer(10, 160),
    grazer(11, 210),
    grazer(12, 280),
    grazer(13, 500),
    grazer(14, 540),
    grazer(15, 600),
    grazer(16, 620),
  ],
};

const LittleGod = {
  state,
  SPECIES: { hunter: { maxEnergy: 100, walkSpeed: 50, senseRadius: 360 } },
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
  distanceSquared(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; },
  lifeStage() { return "adult"; },
  reproductionSeasonMultiplier() { return 1; },
  isCloseKin(a, b) { return (a.id === 1 && b.id === 4) || (a.id === 4 && b.id === 1); },
  moveAnimal(animal, angle, speed, dt) {
    moved.push({ id: animal.id, angle, speed, dt });
    animal.x += Math.cos(angle) * speed * dt;
    animal.y += Math.sin(angle) * speed * dt;
  },
  wander(animal, speed, dt) {
    originalWanderCalls += 1;
    animal.x += speed * dt * 0.1;
  },
  updateHunters(dt) {
    for (const animal of state.hunters) LittleGod.wander(animal, animal.derived.walkSpeed, dt);
  },
  getEcologySupervisionDiagnostics() {
    return {
      version: "base",
      reproductionDiagnostics: { hunter: { attempts: 2, successes: 1 } },
    };
  },
};

const window = {
  LittleGod,
  addEventListener(type, listener) {
    if (type === "load") loadListeners.push(listener);
  },
};
const context = { window, console, Object, Array, Number, String, Boolean, Map, Math };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/hunter-mate-seeking-v1.js", "utf8"),
  context,
  { filename: "src/genesis/hunter-mate-seeking-v1.js" },
);

assert.equal(LittleGod.hunterMateSeekingModel.version, "hunter-mate-seeking-v1");
assert.equal(LittleGod.hunterMateSeekingModel.localPerceptionOnly, true);
assert.equal(LittleGod.hunterMateSeekingModel.interruptsHunting, false);

const beforeDistance = Math.abs(male.x - female.x);
LittleGod.updateHunters(0.5);
const afterDistance = Math.abs(male.x - female.x);

assert.ok(afterDistance < beforeDistance,
  "Ready adult hunters inside local scent range should close distance instead of wandering apart");
assert.ok(moved.some((entry) => entry.id === female.id),
  "Ready female should receive directed mate-seeking movement");
assert.ok(moved.some((entry) => entry.id === male.id),
  "Ready male should receive directed mate-seeking movement");
assert.equal(hungryFemale.state, "wander",
  "Low-energy hunters must keep normal behavior instead of seeking mates");
assert.equal(hungryFemale.mateSeeking, undefined);
assert.equal(closeKinMale.mateSeeking, undefined,
  "A hunter must not seek a close relative when no other compatible female is locally available");
assert.equal(LittleGod.wander.name, "wander",
  "Temporary wander replacement must be restored after the hunter update");

const diagnostics = LittleGod.getHunterMateSeekingDiagnostics();
assert.equal(diagnostics.version, "hunter-mate-seeking-v1");
assert.equal(diagnostics.perceptionMode, "local-sense-radius-only");
assert.ok(diagnostics.searches >= 3);
assert.ok(diagnostics.directedMoves >= 2);
assert.ok(diagnostics.blockedByEnergy >= 1);
assert.ok(diagnostics.noCompatibleMate >= 1);
assert.ok(diagnostics.lastSeekers.some((entry) => entry.seekerId === 1 && entry.targetId === 2));
assert.ok(diagnostics.lastSeekers.every((entry) => entry.searchRadius <= 720));

const compact = LittleGod.getEcologySupervisionDiagnostics();
assert.equal(compact.reproductionDiagnostics.hunter.attempts, 2);
assert.equal(compact.reproductionDiagnostics.hunter.mateSeeking.version, "hunter-mate-seeking-v1");

window.LittleGodTelemetry = {
  getSnapshot() {
    return {
      version: "base",
      compactSummary: {
        reproductionDiagnostics: { hunter: { successes: 1 } },
      },
    };
  },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.hunterMateSeeking.version, "hunter-mate-seeking-v1");
assert.equal(
  snapshot.compactSummary.reproductionDiagnostics.hunter.mateSeeking.version,
  "hunter-mate-seeking-v1",
);

LittleGod.reproductionSeasonMultiplier = () => 0;
moved = [];
LittleGod.updateHunters(0.2);
assert.equal(moved.length, 0,
  "Mate seeking must remain closed outside the reproduction season");
assert.ok(LittleGod.getHunterMateSeekingDiagnostics().blockedBySeason >= 4);
assert.ok(originalWanderCalls > 0,
  "Normal hunter wandering must remain available when mate seeking does not apply");

console.log("hunter-mate-seeking.test: PASS");
