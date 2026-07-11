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
  Number,
  Math,
  Array,
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
assert.equal(diagnostics.cellSize, 32);
assert.equal(diagnostics.grid.columns, 64);
assert.equal(diagnostics.grid.rows, 40);
assert.equal(diagnostics.grid.cellCount, 2560);
assert.equal(diagnostics.grid.cellWidth, 32);
assert.equal(diagnostics.grid.cellHeight, 32);
assert.equal(diagnostics.grid.cellSize, 32);
assert.equal(diagnostics.coverage.green, 0.42);
assert.equal(diagnostics.coverage.root, 0.37);
assert.equal(diagnostics.coverage.roots, 0.37);
assert.equal(diagnostics.coverage.bare, 0.31);
assert.equal(diagnostics.coverage.barren, 0.31);
assert.equal(diagnostics.coverage.vegetated, 0.42);
assert.equal(diagnostics.coverage.rooted, 0.37);
assert.equal(diagnostics.resources.greenBiomass, 4059);
assert.equal(diagnostics.resources.rootBiomass, 610);
assert.equal(diagnostics.resources.averageFertility, 0.9);
assert.ok(Array.isArray(diagnostics.hotspots));
assert.ok(Array.isArray(diagnostics.grazingHotspots));
assert.equal(diagnostics.grazingHotspots.length, 1);
assert.equal(diagnostics.grazingHotspots[0].column, 12);
assert.equal(diagnostics.grazingHotspots[0].row, 8);
assert.equal(diagnostics.grazingHotspots[0].pressure, 2.4);
assert.notStrictEqual(diagnostics.grazingHotspots, LittleGod.getVegetationDiagnostics().hotspots);
assert.equal(diagnostics.resourceBudget.grazingRemoved, 5);

for (const key of ["green", "root", "roots", "bare", "barren"]) {
  assert.equal(typeof diagnostics.coverage[key], "number");
  assert.ok(diagnostics.coverage[key] >= 0 && diagnostics.coverage[key] <= 1);
}

console.log("terrain-diagnostics-contract.test: PASS");
