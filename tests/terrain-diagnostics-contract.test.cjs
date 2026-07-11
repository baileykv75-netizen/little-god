const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const LittleGod = {
  GRID: {
    columns: 64,
    rows: 40,
    cellWidth: 32,
    cellHeight: 32,
  },
  getVegetationDiagnostics() {
    return {
      columns: 64,
      rows: 40,
      cellCount: 2560,
      vegetatedCoverage: 0.42,
      rootCoverage: 0.37,
      bareCoverage: 0.31,
      hotspots: [{ column: 12, row: 8, pressure: 2.4 }],
      budget: { greenGrowth: 18, grazingRemoved: 5 },
    };
  },
  getResourceTotals() {
    return {
      green: 4059,
      dry: 1045,
      seeds: 3051,
      roots: 610,
      fertility: 2304,
    };
  },
};

const context = {
  window: { LittleGod },
  console,
  Object,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/terrain-diagnostics-contract.js", "utf8"),
  context,
  { filename: "src/genesis/terrain-diagnostics-contract.js" },
);

assert.equal(typeof LittleGod.getTerrainDiagnostics, "function",
  "Checkpoint 2 contract missing: expose LittleGod.getTerrainDiagnostics() for automated acceptance");

const diagnostics = LittleGod.getTerrainDiagnostics();
assert.equal(diagnostics.version, "terrain-grid-diagnostics-v1");
assert.equal(diagnostics.columns, 64);
assert.equal(diagnostics.rows, 40);
assert.equal(diagnostics.cellCount, 2560);
assert.deepEqual(diagnostics.grid, {
  columns: 64,
  rows: 40,
  cellCount: 2560,
  cellWidth: 32,
  cellHeight: 32,
});
assert.deepEqual(diagnostics.coverage, {
  vegetated: 0.42,
  rooted: 0.37,
  bare: 0.31,
});
assert.equal(diagnostics.resources.greenBiomass, 4059);
assert.equal(diagnostics.resources.rootBiomass, 610);
assert.equal(diagnostics.resources.averageFertility, 0.9);
assert.equal(diagnostics.hotspots.length, 1);
assert.equal(diagnostics.resourceBudget.grazingRemoved, 5);

console.log("terrain-diagnostics-contract.test: PASS");
