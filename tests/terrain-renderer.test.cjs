const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const GRID = {
  columns: 64,
  rows: 40,
  cellWidth: 32,
  cellHeight: 32,
  maxGreen: 12,
  maxDry: 10,
  maxRoots: 10,
};

const terrainCells = [];
for (let row = 0; row < GRID.rows; row += 1) {
  for (let column = 0; column < GRID.columns; column += 1) {
    terrainCells.push({
      isGridCell: true,
      x: (column + 0.5) * GRID.cellWidth,
      y: (row + 0.5) * GRID.cellHeight,
      green: column < 24 ? 8 : 0,
      dry: column >= 24 && column < 34 ? 4 : 0,
      rootBiomass: column < 28 ? 5 : 0,
      fertility: 0.8,
      grazingPressure: row === 12 ? 3 : 0,
    });
  }
}

let legacyPatchReads = 0;
const state = {
  terrainCells,
  season: "spring",
  decor: [],
  effects: [],
  carcasses: [],
  grazers: [],
  hunters: [],
  selectedIndividualId: null,
  selectedSpecies: "flora",
  pointer: { inside: false },
};
Object.defineProperty(state, "patches", {
  get() {
    legacyPatchReads += 1;
    throw new Error("Continuous renderer must not read legacy circular patches");
  },
});

const calls = { drawImage: 0, putImageData: 0, ellipse: 0 };
function makeContext(offscreen = false) {
  return {
    createImageData(width, height) {
      assert.ok(offscreen);
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() { calls.putImageData += 1; },
    drawImage() { calls.drawImage += 1; },
    ellipse() { calls.ellipse += 1; },
    clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {},
    moveTo() {}, lineTo() {}, closePath() {}, arc() {}, setLineDash() {},
  };
}

const mainContext = makeContext(false);
const rasterContext = makeContext(true);
const mainCanvas = { width: 960, height: 600, getContext: () => mainContext };
const rasterCanvas = { width: 0, height: 0, getContext: () => rasterContext };

const LittleGod = {
  state,
  WORLD: { width: 2048, height: 1280 },
  GRID,
  SPECIES: { flora: { color: "#4a975b" } },
  getTerrainCells: () => terrainCells,
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  lifeStage: () => "adult",
  camera: {
    zoom: 1,
    apply() {},
    isVisible: () => true,
  },
};

const queuedFrames = [];
const context = {
  window: { LittleGod },
  document: {
    querySelector(selector) {
      assert.equal(selector, "#worldCanvas");
      return mainCanvas;
    },
    createElement(tag) {
      assert.equal(tag, "canvas");
      return rasterCanvas;
    },
  },
  requestAnimationFrame(callback) { queuedFrames.push(callback); },
  console,
  Math,
  Number,
  Array,
  Object,
  Uint8ClampedArray,
  Error,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/terrain-renderer-v2.js", "utf8"),
  context,
  { filename: "src/genesis/terrain-renderer-v2.js" },
);

assert.equal(LittleGod.terrainRendererModel.version, "continuous-raster-v1");
assert.equal(LittleGod.terrainRendererModel.source, "state.terrainCells");
assert.equal(LittleGod.terrainRendererModel.usesLegacyPatchShapes, false);
assert.equal(LittleGod.terrainRendererModel.smoothInterpolation, true);
assert.equal(LittleGod.terrainRendererModel.gridColumns, 64);
assert.equal(LittleGod.terrainRendererModel.gridRows, 40);
assert.equal(LittleGod.terrainRendererModel.rasterColumns, 128);
assert.equal(LittleGod.terrainRendererModel.rasterRows, 80);
assert.equal(typeof LittleGod.renderContinuousTerrainFrame, "function");
assert.equal(queuedFrames.length, 1);

LittleGod.renderContinuousTerrainFrame(1000);

assert.equal(legacyPatchReads, 0);
assert.equal(calls.putImageData, 1, "Terrain raster should be rebuilt from canonical cells");
assert.equal(calls.drawImage, 1, "Continuous raster should be drawn as one smoothed surface");
assert.equal(calls.ellipse, 0, "Terrain drawing must not use circular patch shapes");

console.log("terrain-renderer.test: PASS");
