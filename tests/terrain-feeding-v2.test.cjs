const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const cell = {
  isGridCell: true,
  x: 100,
  y: 100,
  radius: 80,
  green: 10,
  dry: 0,
  rootBiomass: 4,
  lastDisturbedYear: -Infinity,
};
const grazer = {
  x: 100,
  y: 100,
  energy: 10,
  lastMealAge: 2,
  derived: { maxEnergy: 100, threatRadius: 40 },
};

const LittleGod = {
  state: {
    patches: [cell],
    grazers: [grazer],
    hunters: [],
    year: 2,
  },
  SPECIES: {
    grazer: {
      eatRate: 10,
      greenEnergy: 1,
      dryEnergy: 0.5,
      maxEnergy: 100,
      threatRadius: 40,
    },
  },
  updateGrazers(dt) {
    const legacyPatch = this.state.patches[0];
    const reach = legacyPatch.radius * 0.72 + 9;
    if ((legacyPatch.x - grazer.x) ** 2 + (legacyPatch.y - grazer.y) ** 2 < reach * reach) {
      legacyPatch.green -= 5;
    }
  },
  getVegetationCellsInRadius() {
    return this.state.patches;
  },
  incrementMetric(key, amount) {
    this.metrics[key] = (this.metrics[key] || 0) + amount;
  },
  metrics: {},
  findNearest() { return null; },
};

const context = {
  window: { LittleGod },
  console,
  Number,
  Math,
  Object,
  Proxy,
  Reflect,
  WeakMap,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/terrain-feeding-v2.js", "utf8"),
  context,
  { filename: "src/genesis/terrain-feeding-v2.js" },
);

assert.equal(LittleGod.terrainFeedingModel.legacyCircularFeeding, false);
assert.equal(typeof LittleGod.consumeTerrainFoodAt, "function");
assert.equal(typeof LittleGod.getTerrainFeedingCell, "function");

LittleGod.updateGrazers(0.1);

assert.equal(cell.green, 9, "Only grid-local consumption should reduce the cell by eatRate * dt");
assert.equal(grazer.energy, 11);
assert.equal(grazer.lastMealAge, 0);
assert.equal(LittleGod.metrics.greenConsumed, 1);
assert.equal(LittleGod.state.patches[0], cell, "The real terrain grid must be restored after the legacy loop");

console.log("terrain-feeding-v2.test: PASS");
