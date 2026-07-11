const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const LG = {
  WORLD: { width: 960, height: 600, maxAnimals: 180, fixedStepMs: 50, yearsPerStep: 0.000625 },
  SPECIES: {
    grazer: { minReproductionAge: 1, maxEnergy: 108, staminaMax: 100, lifespan: [10, 15] },
    hunter: { minReproductionAge: 1.8, maxEnergy: 132, staminaMax: 110, lifespan: [14, 20] },
  },
  state: {
    patches: [], grazers: [], hunters: [], carcasses: [], effects: [], events: [], decor: [],
    rules: { growth: 1, fertility: 1, fullSeasons: true },
    season: "spring", year: 0, nextEntityId: 1,
  },
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  randomBetween: (min, max) => (min + max) / 2,
  freshLedger: (year = 0) => ({ year, springRecoveries: 0 }),
  incrementMetric(key, amount = 1) {
    this.state.ledger[key] = (this.state.ledger[key] || 0) + amount;
    this.state.lifetime[key] = (this.state.lifetime[key] || 0) + amount;
  },
  addEvent(message) { this.state.events.unshift({ message }); },
  getPresence() {
    return {
      flora: this.hasDormantPlantLife(),
      grazer: this.state.grazers.length > 0,
      hunter: this.state.hunters.length > 0,
    };
  },
  buildTrendSnapshot() { return {}; },
};

LG.state.ledger = LG.freshLedger(0);
LG.state.lifetime = LG.freshLedger(0);
LG.state.eventFlags = { firstSpringRecovery: false };

const context = {
  window: { LittleGod: LG },
  document: {
    readyState: "complete",
    querySelector() { return null; },
    addEventListener() {},
  },
  console,
  Math,
  Float32Array,
  Object,
  Number,
};

vm.createContext(context);
for (const scriptPath of [
  "src/genesis/world-v2.js",
  "src/genesis/terrain-diagnostics-contract.js",
]) {
  vm.runInContext(
    fs.readFileSync(scriptPath, "utf8"),
    context,
    { filename: scriptPath },
  );
}

LG.seedWorld();
assert.equal(LG.GRID.columns, 64);
assert.equal(LG.GRID.rows, 40);
assert.equal(LG.state.patches.length, 2560);
assert.ok(LG.state.patches.every((cell) => cell.isGridCell));
assert.equal(new Set(LG.state.patches.map((cell) => cell.id)).size, 2560);

const totalsBefore = LG.getResourceTotals();
assert.ok(totalsBefore.green > 0);
assert.ok(totalsBefore.roots > 0);
assert.ok(totalsBefore.seeds > 0);

const lengthBeforeSeed = LG.state.patches.length;
LG.seedPatchAt(1024, 640);
assert.equal(LG.state.patches.length, lengthBeforeSeed);
assert.ok(LG.getResourceTotals().green >= totalsBefore.green);

const center = LG.getVegetationCellAt(1024, 640);
const greenBeforeGrazing = center.green;
center.green = Math.max(0, center.green - 1.5);
assert.ok(center.grazingPressure > 0);
assert.ok(LG.state.vegetationMetrics.grazingRemoved > 0);
assert.ok(center.green < greenBeforeGrazing);
assert.ok(LG.localPlantFood({ x: 1024, y: 640 }, 180) > 0);

LG.state.season = "winter";
const winterGreenBefore = LG.getResourceTotals().green;
const winterDryBefore = LG.getResourceTotals().dry;
LG.updatePatches(0.08);
const winterTotals = LG.getResourceTotals();
assert.ok(winterTotals.green < winterGreenBefore);
assert.ok(winterTotals.dry > winterDryBefore);

LG.telemetrySnapshot = () => ({ version: "base", resources: { patchCount: 0 } });
const snapshot = LG.telemetrySnapshot();
assert.equal(snapshot.version, "0.4.2-grid.1");
assert.equal(snapshot.vegetationGrid.columns, 64);
assert.equal(snapshot.vegetationGrid.rows, 40);
assert.equal(snapshot.vegetationGrid.cellCount, 2560);
assert.ok(Array.isArray(snapshot.vegetationGrid.hotspots));

assert.equal(
  typeof LG.getTerrainDiagnostics,
  "function",
  "Checkpoint 2 contract missing: expose LittleGod.getTerrainDiagnostics() for automated acceptance",
);
const terrain = LG.getTerrainDiagnostics();
assert.equal(terrain.columns, 64);
assert.equal(terrain.rows, 40);
assert.equal(terrain.cellCount, 2560);
assert.equal(terrain.grid.columns, 64);
assert.equal(terrain.grid.rows, 40);
assert.ok(Number.isFinite(terrain.coverage.vegetated));
assert.ok(Number.isFinite(terrain.coverage.rooted));
assert.ok(Number.isFinite(terrain.coverage.bare));
assert.ok(Number.isFinite(terrain.resources.greenBiomass));
assert.ok(Number.isFinite(terrain.resources.rootBiomass));
assert.ok(Array.isArray(terrain.hotspots));

console.log("vegetation-grid.test: PASS");
