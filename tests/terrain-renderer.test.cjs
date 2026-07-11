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
      gridColumn: column,
      gridRow: row,
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

const calls = { drawImage: 0, putImageData: 0, ellipse: 0, toast: [] };
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

let heatmapButton = null;
const controls = {
  appended: [],
  append(node) { this.appended.push(node); },
};
function createButton() {
  const listeners = {};
  return {
    id: "",
    type: "",
    className: "",
    textContent: "",
    title: "",
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, callback) { listeners[type] = callback; },
    click() { listeners.click?.(); },
  };
}

const LittleGod = {
  state,
  WORLD: { width: 2048, height: 1280 },
  GRID,
  SPECIES: { flora: { color: "#4a975b" } },
  getTerrainCells: () => terrainCells,
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  lifeStage: () => "adult",
  showToast: (message) => calls.toast.push(message),
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
      if (selector === "#worldCanvas") return mainCanvas;
      if (selector === "#cameraControls") return controls;
      if (selector === "#activityHeatmapToggle") return heatmapButton;
      return null;
    },
    createElement(tag) {
      if (tag === "canvas") return rasterCanvas;
      if (tag === "button") {
        heatmapButton = createButton();
        return heatmapButton;
      }
      throw new Error(`Unexpected element: ${tag}`);
    },
  },
  requestAnimationFrame(callback) { queuedFrames.push(callback); },
  console,
  Math,
  Number,
  Array,
  Object,
  Float32Array,
  Uint8ClampedArray,
  Error,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/terrain-renderer-v2.js", "utf8"),
  context,
  { filename: "src/genesis/terrain-renderer-v2.js" },
);

assert.equal(LittleGod.terrainRendererModel.version, "continuous-raster-v2");
assert.equal(LittleGod.terrainRendererModel.source, "state.terrainCells");
assert.equal(LittleGod.terrainRendererModel.usesLegacyPatchShapes, false);
assert.equal(LittleGod.terrainRendererModel.smoothInterpolation, true);
assert.equal(LittleGod.terrainRendererModel.activityHeatmap, true);
assert.equal(LittleGod.terrainRendererModel.gridColumns, 64);
assert.equal(LittleGod.terrainRendererModel.gridRows, 40);
assert.equal(LittleGod.terrainRendererModel.rasterColumns, 128);
assert.equal(LittleGod.terrainRendererModel.rasterRows, 80);
assert.equal(typeof LittleGod.renderContinuousTerrainFrame, "function");
assert.equal(typeof LittleGod.getActivityHeatmapDiagnostics, "function");
assert.equal(queuedFrames.length, 1);
assert.equal(controls.appended.length, 1);
assert.equal(heatmapButton.id, "activityHeatmapToggle");
assert.equal(heatmapButton.attributes["aria-pressed"], "false");

LittleGod.renderContinuousTerrainFrame(1000);
const before = LittleGod.getActivityHeatmapDiagnostics();
assert.equal(before.enabled, false);
assert.ok(before.cellsWithActivity > 0, "Grazing pressure should create observable hotspots");
assert.ok(before.peakIntensity > 0);
assert.ok(Array.isArray(before.hotspots));

heatmapButton.click();
assert.equal(state.showActivityHeatmap, true);
assert.equal(heatmapButton.attributes["aria-pressed"], "true");
assert.equal(calls.toast.at(-1), "活动热区已开启");
LittleGod.renderContinuousTerrainFrame(1100);
const after = LittleGod.getActivityHeatmapDiagnostics();
assert.equal(after.enabled, true);
assert.ok(after.hotspots.length > 0);
assert.notStrictEqual(after.hotspots, before.hotspots);

assert.equal(legacyPatchReads, 0);
assert.equal(calls.putImageData, 2, "Terrain raster should rebuild when the heatmap toggles");
assert.equal(calls.drawImage, 2, "Continuous raster should remain the final terrain surface");
assert.equal(calls.ellipse, 0, "Terrain drawing must not use circular patch shapes");

console.log("terrain-renderer.test: PASS");
