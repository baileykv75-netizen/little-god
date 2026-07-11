const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const GRID = { columns: 64, rows: 40, cellWidth: 32, cellHeight: 32 };

function buildTerrainCells() {
  const cells = [];
  for (let row = 0; row < GRID.rows; row += 1) {
    for (let column = 0; column < GRID.columns; column += 1) {
      cells.push({
        id: row * GRID.columns + column + 1,
        isGridCell: true,
        gridColumn: column,
        gridRow: row,
        x: (column + 0.5) * GRID.cellWidth,
        y: (row + 0.5) * GRID.cellHeight,
        radius: 64,
        green: 0,
        dry: 0,
        seeds: 0,
        rootBiomass: 0,
        fertility: 0.8,
        moisture: 0.6,
        grazingPressure: 0,
        phase: 0,
        barrenAge: 0,
      });
    }
  }
  return cells;
}

const terrainCells = buildTerrainCells();
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

const LittleGod = {
  WORLD: { width: 2048, height: 1280 },
  GRID,
  state: {
    patches: terrainCells,
    terrainCells: [],
  },
  initializeVegetationGrid() {
    this.state.patches = buildTerrainCells();
    return this.state.patches;
  },
  createPatch() { return null; },
  seedPatchAt() { return null; },
  findPatchNear() { return null; },
  getResourceTotals() {
    return this.state.patches.reduce((totals, cell) => {
      totals.green += cell.green || 0;
      totals.dry += cell.dry || 0;
      totals.seeds += cell.seeds || 0;
      totals.roots += cell.rootBiomass || 0;
      totals.fertility += cell.fertility || 0;
      return totals;
    }, { green: 0, dry: 0, seeds: 0, roots: 0, fertility: 0 });
  },
  hasDormantPlantLife() { return true; },
  updateVegetationGrid() {},
  getVegetationDiagnostics() { return { columns: 64, rows: 40, cellCount: 2560, hotspots: [] }; },
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
};

const context = {
  window: { LittleGod },
  console,
  Number,
  Math,
  Object,
  Array,
  Error,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/terrain-store-v2.js", "utf8"),
  context,
  { filename: "src/genesis/terrain-store-v2.js" },
);

assert.equal(LittleGod.terrainStoreModel.version, "terrain-store-v4");
assert.equal(LittleGod.terrainStoreModel.legacyPatchCollectionFeedsAnimals, false);
assert.equal(LittleGod.terrainStoreModel.renderViewsOwnFood, false);
assert.equal(LittleGod.terrainStoreModel.externalLegacyReplacementInvalidatesTerrain, true);
assert.equal(LittleGod.state.terrainCells.length, 2560);
assert.equal(Object.prototype.hasOwnProperty.call(feedingCell, "radius"), false,
  "Canonical terrain cells must not retain circular radius");

const renderView = LittleGod.state.patches[3 * GRID.columns + 3];
assert.equal(renderView.isTerrainRenderCell, true);
assert.equal(renderView.drivesFeeding, false);
assert.notEqual(renderView, feedingCell,
  "Circular render snapshots must not share identity with feeding cells");
assert.equal(renderView.green, 10);

renderView.green = 99;
assert.equal(feedingCell.green, 10,
  "Changing a circular render snapshot must not alter feeding terrain");

function consumeNearby(animal, dt) {
  const cell = LittleGod.getVegetationCellsInRadius(animal.x, animal.y, 40)
    .find((candidate) => candidate.green > 0);
  if (!cell) return 0;
  const eaten = Math.min(cell.green, 10 * dt);
  cell.green -= eaten;
  animal.energy += eaten;
  return eaten;
}

const grazer = { x: feedingCell.x, y: feedingCell.y, energy: 10 };
assert.equal(consumeNearby(grazer, 0.1), 1);
assert.equal(feedingCell.green, 9);
assert.equal(grazer.energy, 11);
assert.equal(renderView.green, 99,
  "Feeding must not mutate the detached circular snapshot");

LittleGod.state.patches = [legacyCircularPatch];
assert.equal(LittleGod.state.terrainCells.length, 0,
  "Replacing the legacy patch collection must invalidate hidden terrain food");
assert.deepEqual(LittleGod.getVegetationCellsInRadius(grazer.x, grazer.y, 40), []);

const energyBeforeLegacyAttempt = grazer.energy;
assert.equal(consumeNearby(grazer, 0.1), 0);
assert.equal(grazer.energy, energyBeforeLegacyAttempt);
assert.equal(legacyCircularPatch.green, 50,
  "Legacy circular patches must never be consumed");

console.log("terrain-feeding-v2.test: PASS");
