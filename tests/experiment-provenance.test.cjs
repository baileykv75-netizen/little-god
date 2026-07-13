const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

let nextId = 1;
const state = {
  year: 0,
  season: "spring",
  grazers: [],
  hunters: [],
  carcasses: [],
  patches: [],
  rules: { growth: 1, fertility: 1, fullSeasons: true },
  vegetationMetrics: { seedGerminated: 0, rootGained: 0 },
};

const LittleGod = {
  state,
  getResourceTotals() {
    return state.patches.reduce((totals, patch) => {
      totals.green += patch.green;
      totals.dry += patch.dry;
      totals.seeds += patch.seeds;
      totals.roots += patch.rootBiomass;
      return totals;
    }, { green: 0, dry: 0, seeds: 0, roots: 0 });
  },
  createAnimal(type, x, y) {
    const animal = { id: nextId++, type, x, y };
    state[type === "grazer" ? "grazers" : "hunters"].push(animal);
    return animal;
  },
  seedPatchAt(x, y) {
    const patch = { x, y, green: 10, dry: 2, seeds: 3, rootBiomass: 4 };
    state.patches.push(patch);
    return patch;
  },
  seedWorld() {
    state.year = 0;
    state.season = "spring";
    state.grazers = [];
    state.hunters = [];
    state.carcasses = [];
    state.patches = [];
    state.vegetationMetrics = { seedGerminated: 0, rootGained: 0 };
    LittleGod.createAnimal("grazer", 10, 10, { initial: true });
    LittleGod.createAnimal("hunter", 20, 20, { initial: true });
    LittleGod.seedPatchAt(30, 30);
    return true;
  },
  updateWorld(dt) {
    state.year += dt;
    state.vegetationMetrics.seedGerminated += 1.25;
    state.vegetationMetrics.rootGained += 2.5;
    state.patches[0].green += 0.5;
    state.patches[0].seeds -= 1.25;
  },
  getEcologySupervisionDiagnostics() {
    return {
      version: "base",
      springDiagnostics: [{ year: 0, seedGerminated: 0 }],
    };
  },
};

const window = { LittleGod, addEventListener() {} };
const context = {
  window,
  console,
  Object,
  Array,
  Number,
  String,
  Boolean,
  Map,
  Set,
  Math,
  structuredClone,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/experiment-provenance-v1.js", "utf8"),
  context,
  { filename: "src/genesis/experiment-provenance-v1.js" },
);

LittleGod.seedWorld();
LittleGod.createAnimal("grazer", 40, 40, { spread: 34 });
LittleGod.createAnimal("grazer", 42, 40, { spread: 34 });
LittleGod.seedPatchAt(50, 50);
LittleGod.updateWorld(0.1);
LittleGod.createAnimal("hunter", 60, 60, { playerIntervention: true });
LittleGod.updateWorld(0.1);

const diagnostics = LittleGod.getExperimentProvenanceDiagnostics();
assert.equal(diagnostics.version, "experiment-provenance-v1");
assert.equal(diagnostics.defaultInitialState.populations.grazers, 1);
assert.equal(diagnostics.defaultInitialState.populations.hunters, 1);
assert.equal(diagnostics.populationAtFirstStart.populations.grazers, 3);
assert.equal(diagnostics.populationAtFirstStart.populations.hunters, 1);
assert.equal(diagnostics.preStartInterventions.count, 3);
assert.equal(diagnostics.preStartInterventions.animalsAdded, 2);
assert.equal(diagnostics.preStartInterventions.floraPlacements, 1);
assert.equal(diagnostics.postStartInterventions.count, 1);
assert.equal(diagnostics.postStartInterventions.animalsAdded, 1);
assert.equal(diagnostics.springDiagnostics.length, 1);
assert.equal(diagnostics.springDiagnostics[0].seedGerminated, 2.5);
assert.equal(diagnostics.springDiagnostics[0].rootRecovery, 5);
assert.equal(diagnostics.springConsistency.globalSeedGerminated, 2.5);
assert.equal(diagnostics.springConsistency.measuredSpringGermination, 2.5);
assert.equal(diagnostics.springConsistency.difference, 0);

const compact = LittleGod.getEcologySupervisionDiagnostics();
assert.equal(compact.version, "base");
assert.equal(compact.initialConditions.defaultInitialState.populations.grazers, 1);
assert.equal(compact.initialConditions.populationAtFirstStart.populations.grazers, 3);
assert.equal(compact.springDiagnostics[0].seedGerminated, 2.5);
assert.equal(compact.springConsistency.difference, 0);
assert.equal(LittleGod.experimentProvenanceModel.changesSimulationRules, false);

console.log("experiment-provenance.test: PASS");
