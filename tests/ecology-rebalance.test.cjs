const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
let nextId = 100;
const events = [];

function ledger() {
  return {
    grazerBirths: 0,
    hunterBirths: 2,
    inheritedBirths: 2,
    springRecoveries: 3,
  };
}

function grazer(id, sex, x, energy = 90) {
  return {
    id,
    type: "grazer",
    sex,
    x,
    y: 100,
    age: 3,
    energy,
    reproductionCooldown: 0,
    offspringCount: 0,
    lineageId: "grazer-test",
    derived: {
      maxEnergy: 100,
      senseRadius: 270,
      mateRange: 220,
      fertilityMultiplier: 1,
    },
  };
}

function hunter(id, sex, x) {
  return {
    id,
    type: "hunter",
    sex,
    x,
    y: 300,
    age: 4,
    energy: 110,
    reproductionCooldown: 0,
    derived: { maxEnergy: 130, senseRadius: 340, mateRange: 260, fertilityMultiplier: 1 },
  };
}

const cells = [
  { isGridCell: true, seeds: 2, green: 1, rootBiomass: 1.2, fertility: 0.9, moisture: 0.75 },
  { isGridCell: true, seeds: 1, green: 8, rootBiomass: 1, fertility: 0.9, moisture: 0.75 },
];

const state = {
  year: 5,
  season: "spring",
  grazers: [grazer(1, "female", 100), grazer(2, "male", 390)],
  hunters: [
    hunter(10, "female", 500),
    hunter(11, "male", 520),
    hunter(12, "female", 540),
    hunter(13, "male", 560),
    hunter(14, "female", 580),
    hunter(15, "male", 600),
    hunter(16, "female", 620),
  ],
  effects: [],
  rules: { fertility: 1 },
  ledger: ledger(),
  lifetime: ledger(),
  vegetationMetrics: { seedGerminated: 0, greenGrowth: 0, rootGained: 0 },
  eventFlags: {},
  historicalMissionComplete: true,
};

const LittleGod = {
  state,
  GRID: { maxGreen: 12, maxRoots: 10 },
  WORLD: { maxAnimals: 180 },
  SPECIES: {
    grazer: {
      reproductionEnergy: 70,
      reproductionCost: 18,
      reproductionCooldown: 0.8,
      maxEnergy: 100,
      color: "#d99a38",
    },
    hunter: {
      reproductionEnergy: 80,
      reproductionCost: 22,
      reproductionCooldown: 1,
      maxEnergy: 130,
      color: "#8065ad",
    },
  },
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
  distanceSquared(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; },
  lifeStage() { return "adult"; },
  reproductionSeasonMultiplier() { return state.season === "spring" ? 1.3 : 0; },
  localPlantFood() { return 60; },
  chooseLocalMate(observer, candidates) { return candidates[0] || null; },
  createAnimal(type, x, y, options = {}) {
    const child = type === "grazer"
      ? grazer(nextId++, options.sex || "female", x, options.energy)
      : hunter(nextId++, options.sex || "female", x);
    child.y = y;
    child.age = options.age || 0;
    child.reproductionCooldown = options.reproductionCooldown;
    child.parents = options.parents?.map((parent) => parent.id) || [];
    state[type === "grazer" ? "grazers" : "hunters"].push(child);
    return child;
  },
  incrementMetric(key, amount = 1) {
    state.ledger[key] = (state.ledger[key] || 0) + amount;
    state.lifetime[key] = (state.lifetime[key] || 0) + amount;
  },
  addEvent(message) { events.push(message); },
  getTerrainCells() { return cells; },
  updateGrazers() {},
  updateHunters() {
    LittleGod.createAnimal("hunter", 550, 300, {
      parents: [state.hunters[0], state.hunters[1]],
      sex: "female",
    });
  },
  updateWorld(dt) {
    state.year += dt;
    LittleGod.addEvent("连续地表第一次依靠根系与局部种子完成明显春季恢复。 ");
  },
  seedWorld() { state.year = 0; return true; },
  missionCriteria() {
    return {
      time: false,
      minimums: false,
      allPresent: false,
      hunterBirths: true,
      spring: true,
    };
  },
  calculateBalance() { return { label: "食物网崩解", score: 18, advice: "test" }; },
  getEcologySupervisionDiagnostics() {
    return {
      meta: { version: "ecology-supervision-v1" },
      verdict: { label: "食物网崩解", score: 18 },
      reproductionDiagnostics: { hunter: { attempts: 4, successes: 2 } },
      springDiagnostics: [],
      yearlyTimeline: [],
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
  fs.readFileSync("src/genesis/ecology-rebalance-v1.js", "utf8"),
  context,
  { filename: "src/genesis/ecology-rebalance-v1.js" },
);

assert.equal(LittleGod.ecologyRebalanceModel.version, "ecology-rebalance-v1");
assert.equal(LittleGod.ecologyRebalanceModel.missionCompletionMode, "historical-and-current-separated");

LittleGod.updateGrazers(1);
assert.equal(state.lifetime.grazerBirths, 1,
  "A low grazer population with food and a compatible mate should receive a recovery birth");
assert.equal(state.lifetime.inheritedBirths, 3,
  "Recovery births must preserve inherited birth accounting");

const huntersBefore = state.hunters.length;
LittleGod.updateHunters(0.1);
assert.equal(state.hunters.length, huntersBefore,
  "Predator births must be braked when prey per hunter is below the dynamic requirement");
assert.equal(state.lifetime.hunterBirths, 2,
  "The population brake must not erase existing hunter birth metrics");

LittleGod.updateWorld(0.5);
assert.ok(state.vegetationMetrics.seedGerminated > 0,
  "Spring seed banks in open cells must produce measurable germination");
assert.ok(cells[0].seeds < 2);
assert.ok(cells[0].green > 1);
assert.equal(cells[1].seeds, 1,
  "Dense green cells should not receive supplemental germination");
assert.ok(events.some((message) => message.includes("根系储备")));
assert.ok(events.every((message) => !message.includes("根系与局部种子完成")),
  "Recovery wording must not claim seed germination unless it is measured");

const compact = LittleGod.getEcologySupervisionDiagnostics();
assert.equal(compact.reproductionDiagnostics.grazer.adultFemales, 1);
assert.equal(compact.reproductionDiagnostics.grazer.adultMales, 1);
assert.equal(compact.reproductionDiagnostics.grazer.successes, 1);
assert.equal(compact.reproductionDiagnostics.grazer.recoveryBirths, 1);
assert.deepEqual(
  Object.keys(compact.reproductionDiagnostics.grazer.failureReasons).sort(),
  [
    "seasonClosed",
    "noAdultFemale",
    "noAdultMale",
    "energyInsufficient",
    "cooldownActive",
    "mateOutOfRange",
    "localFoodInsufficient",
    "populationPressure",
    "readinessBuilding",
    "worldCapacity",
    "createFailed",
  ].sort(),
);
assert.ok(compact.populationControl.hunterBirthBrakes >= 1);
assert.ok(compact.seedGerminationDiagnostics.publicSeedGerminated > 0);
assert.equal(compact.verdict.historicalMilestone, true);
assert.equal(compact.verdict.currentlyStable, false);
assert.equal(compact.missionStatus.historicalMilestone, true);
assert.equal(compact.missionStatus.currentlyStable, false);
assert.ok(compact.verdict.statusLabel.includes("当前生态已不稳定"));

window.LittleGodTelemetry = {
  getSnapshot() { return { version: "base" }; },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.compactSummary.reproductionDiagnostics.grazer.successes, 1);
assert.equal(snapshot.compactSummary.missionStatus.currentlyStable, false);

console.log("ecology-rebalance.test: PASS");
