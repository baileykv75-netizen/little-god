const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const gridCell = {
  id: 1,
  isGridCell: true,
  x: 100,
  y: 100,
  green: 10,
  dry: 0,
  rootBiomass: 4,
  lastDisturbedYear: -Infinity,
};
const legacyCircularPatch = {
  id: 2,
  isGridCell: false,
  x: 100,
  y: 100,
  radius: 120,
  green: 50,
  dry: 0,
  rootBiomass: 20,
};
const grazer = {
  id: 3,
  type: "grazer",
  x: 100,
  y: 100,
  angle: 0,
  age: 2,
  lifespan: 12,
  energy: 10,
  stamina: 100,
  lastMealAge: 2,
  reproductionCooldown: 1,
  traits: { agility: 50, caution: 50 },
  derived: {
    walkSpeed: 0,
    burstSpeed: 0,
    maxEnergy: 100,
    baseDrain: 0,
    staminaMax: 100,
    staminaRecovery: 0,
    lifespan: 12,
    fertilityMultiplier: 1,
    senseRadius: 180,
    threatRadius: 40,
    mateRange: 220,
    combatBase: 50,
  },
};

const LittleGod = {
  WORLD: { width: 2048, height: 1280, maxAnimals: 180, missionYears: 8, trendWindowYears: 1 },
  GRID: { columns: 64, rows: 40, cellWidth: 32, cellHeight: 32 },
  SPECIES: {
    grazer: {
      walkSpeed: 0,
      sprintSpeed: 0,
      maxEnergy: 100,
      baseDrain: 0,
      staminaMax: 100,
      staminaRecovery: 0,
      lifespan: [10, 15],
      senseRadius: 180,
      threatRadius: 40,
      winterDrain: 1,
      staminaDrain: 0,
      sprintDrain: 0,
      eatRate: 10,
      greenEnergy: 1,
      dryEnergy: 0.5,
      elderAgeRatio: 0.8,
      minReproductionAge: 1,
      reproductionEnergy: 70,
      reproductionCost: 20,
      reproductionCooldown: 1,
      color: "#000",
    },
    hunter: {
      walkSpeed: 0,
      chaseSpeed: 0,
      maxEnergy: 100,
      baseDrain: 0,
      staminaMax: 100,
      staminaRecovery: 0,
      lifespan: [10, 15],
      senseRadius: 180,
      threatRadius: 40,
      winterDrain: 1,
      staminaDrain: 0,
      chaseDrain: 0,
      elderAgeRatio: 0.8,
      reproductionEnergy: 70,
      reproductionCost: 20,
      reproductionCooldown: 1,
      color: "#000",
    },
  },
  state: {
    patches: [legacyCircularPatch, gridCell],
    grazers: [grazer],
    hunters: [],
    carcasses: [],
    effects: [],
    rules: { fullSeasons: true, fertility: 1 },
    season: "spring",
    year: 2,
    ledger: {},
    lifetime: {},
    eventFlags: {},
  },
  getVegetationCellsInRadius() {
    return this.state.patches;
  },
  distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  },
  turnToward(current) { return current; },
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
  randomBetween(min, max) { return (min + max) / 2; },
  lifeStage() { return "adult"; },
  incrementMetric(key, amount = 1) {
    this.metrics[key] = (this.metrics[key] || 0) + amount;
  },
  metrics: {},
};

const context = {
  window: { LittleGod },
  console,
  Number,
  Math,
  Object,
  Set,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/simulation.js", "utf8"),
  context,
  { filename: "src/genesis/simulation.js" },
);

assert.equal(LittleGod.terrainFeedingModel.legacyCircularFeeding, false);
assert.equal(LittleGod.terrainFeedingModel.nativeGridFeeding, true);
assert.equal(LittleGod.terrainFeedingModel.binding, "simulation-native");

LittleGod.updateGrazers(0.1);

assert.equal(legacyCircularPatch.green, 50,
  "Legacy circular patches must not be selected or consumed");
assert.equal(gridCell.green, 9,
  "The nearby grid cell should be consumed by eatRate * dt");
assert.equal(grazer.energy, 11);
assert.equal(grazer.lastMealAge, 0);
assert.equal(LittleGod.metrics.greenConsumed, 1);

const simulationSource = fs.readFileSync("src/genesis/simulation.js", "utf8");
assert.equal(simulationSource.includes("patch.radius"), false,
  "Native grazer feeding must not use circular patch radius");
assert.equal(simulationSource.includes("chooseFoodPatch"), false,
  "Native grazer feeding must not call the legacy patch selector");

console.log("terrain-feeding-v2.test: PASS");
