const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
let nextId = 100;
let step = 0;
const resources = { green: 100, dry: 40, seeds: 20, roots: 60 };

function ledger() {
  return {
    hunterBirths: 0,
    inheritedBirths: 0,
    springRecoveries: 0,
    germinatedBiomass: 0,
    seedDispersals: 0,
  };
}

const state = {
  year: 0,
  season: "spring",
  grazers: [],
  hunters: [],
  effects: [],
  rules: { fertility: 1 },
  ledger: ledger(),
  lifetime: ledger(),
  vegetationMetrics: {
    greenGrowth: 0,
    seedGerminated: 0,
    seedProduced: 0,
  },
  eventFlags: {
    firstHunterBirth: false,
    firstSpringRecovery: false,
  },
  springRecoveryYear: -1,
  longestCoexistence: 0,
};

function hunter(id, sex) {
  return {
    id,
    type: "hunter",
    sex,
    x: id * 2,
    y: 20,
    age: 4,
    lifespan: 18,
    energy: 112,
    reproductionCooldown: 0,
    lastMealAge: 1,
    offspringCount: 0,
    lineageId: "hunter-test",
    derived: {
      maxEnergy: 132,
      senseRadius: 335,
      mateRange: 250,
      fertilityMultiplier: 1,
    },
    traits: { mateSelectivity: 50 },
  };
}

const LittleGod = {
  state,
  WORLD: { maxAnimals: 180 },
  SPECIES: {
    hunter: {
      reproductionEnergy: 75,
      reproductionCost: 20,
      reproductionCooldown: 0.8,
      maxEnergy: 132,
      senseRadius: 335,
      color: "#8065ad",
    },
  },
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
  distanceSquared(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; },
  lifeStage(animal) {
    if (animal.age < 1.8) return "juvenile";
    if (animal.age >= animal.lifespan * 0.88) return "elder";
    return "adult";
  },
  reproductionSeasonMultiplier() { return state.season === "spring" ? 1.3 : 0.95; },
  chooseLocalMate(observer, candidates) { return candidates[0] || null; },
  createAnimal(type, x, y, options = {}) {
    const child = hunter(nextId++, options.sex || "female");
    child.x = x;
    child.y = y;
    child.age = options.age || 0;
    child.energy = options.energy;
    child.reproductionCooldown = options.reproductionCooldown;
    child.parents = options.parents.map((parent) => parent.id);
    state.hunters.push(child);
    return child;
  },
  incrementMetric(key, amount = 1) {
    state.ledger[key] = (state.ledger[key] || 0) + amount;
    state.lifetime[key] = (state.lifetime[key] || 0) + amount;
  },
  addEvent() {},
  getResourceTotals() { return { ...resources, fertility: 0 }; },
  calculateBalance() { return { score: 62, label: "脆弱但完整", advice: "test" }; },
  missionCriteria() { return { hunterBirths: state.lifetime.hunterBirths >= 1, spring: state.lifetime.springRecoveries >= 1 }; },
  getExperimentDiagnostics() { return { seed: "stability-test" }; },
  updateHunters() {},
  updateWorld(dt) {
    state.year += dt;
    step += 1;
    if (step <= 2) {
      resources.green += 15;
      resources.roots -= 0.8;
      resources.seeds -= 0.2;
      state.vegetationMetrics.greenGrowth += 15;
      state.vegetationMetrics.seedGerminated += 0.2;
      state.vegetationMetrics.seedProduced += 0.1;
    } else {
      state.season = "summer";
    }
  },
  seedWorld() {
    state.year = 0;
    return true;
  },
};

state.grazers = Array.from({ length: 12 }, (_, index) => ({ id: 200 + index, x: 20, y: 20 }));
state.hunters = [
  hunter(1, "female"),
  hunter(2, "male"),
  hunter(3, "female"),
  hunter(4, "male"),
];

const window = {
  LittleGod,
  addEventListener(type, listener) {
    if (type === "load") loadListeners.push(listener);
  },
};
const context = { window, console, Object, Array, Number, Map, Set, Math };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/ecology-stability-v1.js", "utf8"),
  context,
  { filename: "src/genesis/ecology-stability-v1.js" },
);

assert.equal(LittleGod.ecologyStabilityModel.hunterPopulationHardBanRemoved, true);
assert.equal(LittleGod.ecologyStabilityModel.springRecoveryMode, "whole-spring-cumulative");

LittleGod.updateHunters(1);
assert.equal(state.lifetime.hunterBirths, 1,
  "Four or more hunters must no longer be hard-blocked from reproduction");
assert.equal(state.hunters.length, 5);
assert.equal(state.lifetime.inheritedBirths, 1);

LittleGod.updateWorld(0.1);
assert.equal(state.lifetime.springRecoveries, 0,
  "A single frame below the cumulative threshold should not trigger recovery");
LittleGod.updateWorld(0.1);
assert.equal(state.lifetime.springRecoveries, 1,
  "Whole-spring cumulative recovery should trigger after multiple smaller gains");
assert.ok(state.lifetime.germinatedBiomass > 0,
  "Continuous-grid germination must feed the public germinatedBiomass metric");
assert.ok(state.lifetime.seedDispersals > 0,
  "Continuous-grid seed production must feed the public seedDispersals metric");
LittleGod.updateWorld(0.8);

const compact = LittleGod.getEcologySupervisionDiagnostics();
assert.equal(compact.meta.version, "ecology-supervision-v1");
assert.equal(compact.meta.seed, "stability-test");
assert.equal(compact.milestones.firstHunterBirthYear, 0);
assert.notEqual(compact.milestones.firstSpringRecoveryYear, null);
assert.equal(compact.populationSummary.initial.hunters, 4);
assert.equal(compact.populationSummary.maximum.hunters, 5);
assert.equal(compact.populationSummary.final.hunters, 5);
assert.equal(compact.reproductionDiagnostics.hunter.successes, 1);
assert.ok(compact.reproductionDiagnostics.hunter.adultFemales >= 1);
assert.equal(compact.springDiagnostics.length, 1);
assert.equal(compact.springDiagnostics[0].triggeredSpringRecovery, true);
assert.ok(compact.springDiagnostics[0].greenGain >= 24);
assert.ok(compact.springDiagnostics[0].seedGerminated > 0);
assert.deepEqual(Object.keys(compact.yearlyTimeline[0] || {}).sort(),
  ["dry", "grazers", "green", "hunterBirths", "hunters", "roots", "seeds", "springRecoveries", "year"].sort());

window.LittleGodTelemetry = {
  getSnapshot() { return { version: "base" }; },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.compactSummary.meta.version, "ecology-supervision-v1");
assert.equal(snapshot.compactSummary.reproductionDiagnostics.hunter.successes, 1);

console.log("ecology-stability.test: PASS");
