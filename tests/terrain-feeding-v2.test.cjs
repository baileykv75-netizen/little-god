const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const GRID = { columns: 64, rows: 40, cellWidth: 32, cellHeight: 32 };
const terrainCells = [];
for (let row = 0; row < GRID.rows; row += 1) {
  for (let column = 0; column < GRID.columns; column += 1) {
    terrainCells.push({
      id: row * GRID.columns + column + 1,
      isGridCell: true,
      gridColumn: column,
      gridRow: row,
      x: (column + 0.5) * GRID.cellWidth,
      y: (row + 0.5) * GRID.cellHeight,
      green: 0,
      dry: 0,
      rootBiomass: 0,
      lastDisturbedYear: -Infinity,
    });
  }
}

const feedingCell = terrainCells[3 * GRID.columns + 3];
feedingCell.green = 10;
feedingCell.rootBiomass = 4;

const legacyCircularPatch = {
  id: 9001,
  isGridCell: false,
  x: feedingCell.x,
  y: feedingCell.y,
  radius: 120,
  green: 50,
  dry: 0,
  rootBiomass: 20,
};

const grazer = {
  id: 9002,
  type: "grazer",
  x: feedingCell.x,
  y: feedingCell.y,
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
  GRID,
  SPECIES: {
    grazer: {
      walkSpeed: 0, sprintSpeed: 0, maxEnergy: 100, baseDrain: 0,
      staminaMax: 100, staminaRecovery: 0, lifespan: [10, 15],
      senseRadius: 180, threatRadius: 40, winterDrain: 1,
      staminaDrain: 0, sprintDrain: 0, eatRate: 10,
      greenEnergy: 1, dryEnergy: 0.5, elderAgeRatio: 0.8,
      minReproductionAge: 1, reproductionEnergy: 70,
      reproductionCost: 20, reproductionCooldown: 1, color: "#000",
    },
    hunter: {
      walkSpeed: 0, chaseSpeed: 0, maxEnergy: 100, baseDrain: 0,
      staminaMax: 100, staminaRecovery: 0, lifespan: [10, 15],
      senseRadius: 180, threatRadius: 40, winterDrain: 1,
      staminaDrain: 0, chaseDrain: 0, elderAgeRatio: 0.8,
      reproductionEnergy: 70, reproductionCost: 20,
      reproductionCooldown: 1, color: "#000",
    },
  },
  state: {
    patches: [legacyCircularPatch],
    terrainCells,
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
  initializeVegetationGrid() { return this.state.terrainCells; },
  distanceSquared(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; },
  turnToward(current) { return current; },
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
  randomBetween(min, max) { return (min + max) / 2; },
  lifeStage() { return "adult"; },
  incrementMetric(key, amount = 1) {
    this.metrics[key] = (this.metrics[key] || 0) + amount;
  },
  metrics: {},
};

const context = { window: { LittleGod }, console, Number, Math, Object, Set, Array, Error };
vm.createContext(context);
for (const file of ["src/genesis/terrain-store-v2.js", "src/genesis/simulation.js"]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

assert.equal(LittleGod.terrainStoreModel.legacyPatchCollectionFeedsAnimals, false);
assert.equal(LittleGod.terrainStoreModel.source, "state.terrainCells");
assert.equal(LittleGod.terrainFeedingModel.nativeGridFeeding, true);
assert.equal(LittleGod.getVegetationCellsInRadius(grazer.x, grazer.y, 40).includes(legacyCircularPatch), false);

LittleGod.updateGrazers(0.1);

assert.equal(legacyCircularPatch.green, 50,
  "Legacy circular patches must not be selected or consumed");
assert.equal(feedingCell.green, 9,
  "The canonical terrain cell should be consumed by eatRate * dt");
assert.equal(grazer.energy, 11);
assert.equal(grazer.lastMealAge, 0);
assert.equal(LittleGod.metrics.greenConsumed, 1);

const simulationSource = fs.readFileSync("src/genesis/simulation.js", "utf8");
assert.equal(simulationSource.includes("patch.radius"), false);
assert.equal(simulationSource.includes("chooseFoodPatch"), false);

console.log("terrain-feeding-v2.test: PASS");
