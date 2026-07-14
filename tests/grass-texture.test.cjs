const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scriptSource = fs.readFileSync(path.join(root, "src/genesis/grass-texture-v1.js"), "utf8");
const grassPath = path.join(root, "art/terrain/grass-base.png");

assert.ok(html.includes('src/genesis/grass-texture-v1.js?v=20260714-1'),
  "index.html must load the grass texture integration after the terrain renderer");
assert.ok(fs.existsSync(grassPath), "Integrated grass texture asset must exist");

const png = fs.readFileSync(grassPath);
assert.equal(png.toString("ascii", 1, 4), "PNG", "Grass texture must be a PNG");
assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0,
  "Grass texture must have non-zero dimensions");
assert.equal(png[25], 2,
  "Current grass texture is expected to be RGB so rendering must not depend on source alpha");

function createHarness({ failImage = false } = {}) {
  const drawCalls = [];
  const loadListeners = [];
  const rafCallbacks = [];

  function createContext() {
    return {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      clearRect(...args) { drawCalls.push(["clearRect", ...args]); },
      drawImage(...args) { drawCalls.push(["drawImage", ...args]); },
      save() { drawCalls.push(["save"]); },
      restore() { drawCalls.push(["restore"]); },
      translate(...args) { drawCalls.push(["translate", ...args]); },
      createImageData(width, height) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
      },
      putImageData(...args) { drawCalls.push(["putImageData", ...args.slice(1)]); },
    };
  }

  class FakeElement {
    constructor(tag = "div") {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.style = {};
      this.width = tag === "canvas" ? 960 : 0;
      this.height = tag === "canvas" ? 600 : 0;
      this._context = tag === "canvas" ? createContext() : null;
    }
    append(child) { this.children.push(child); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getContext() { return this._context; }
  }

  class FakeImage {
    constructor() {
      this.naturalWidth = 1254;
      this.naturalHeight = 1254;
      this.width = 1254;
      this.height = 1254;
      this.onload = null;
      this.onerror = null;
    }
    set src(value) {
      this._src = value;
      if (failImage) this.onerror?.(new Error("simulated missing grass texture"));
      else this.onload?.();
    }
    get src() { return this._src; }
  }

  const baseCanvas = new FakeElement("canvas");
  const frame = new FakeElement("div");
  const cells = [
    { green: 12, rootBiomass: 8, dry: 0, grazingPressure: 0 },
    { green: 8, rootBiomass: 5, dry: 1, grazingPressure: 0.4 },
    { green: 0, rootBiomass: 0, dry: 8, grazingPressure: 4 },
    { green: 4, rootBiomass: 2, dry: 2, grazingPressure: 1 },
  ];
  const LittleGod = {
    WORLD: { width: 2048, height: 1280 },
    GRID: {
      columns: 2,
      rows: 2,
      cellWidth: 1024,
      cellHeight: 640,
      maxGreen: 12,
      maxDry: 10,
      maxRoots: 10,
    },
    state: {
      season: "spring",
      terrainCells: cells,
      patches: cells,
    },
    getTerrainCells() { return cells; },
    camera: {
      apply(context) { context.translate(12, 18); },
    },
  };

  const document = {
    readyState: "loading",
    querySelector(selector) {
      if (selector === "#worldCanvas") return baseCanvas;
      if (selector === ".world-frame") return frame;
      return null;
    },
    createElement(tag) { return new FakeElement(tag); },
  };
  const window = {
    LittleGod,
    addEventListener(type, listener) {
      if (type === "load") loadListeners.push(listener);
    },
    requestAnimationFrame(callback) {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    },
  };

  const sandbox = {
    window,
    document,
    Image: FakeImage,
    Uint8ClampedArray,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox, { filename: "src/genesis/grass-texture-v1.js" });

  for (const listener of loadListeners) listener();
  assert.equal(frame.children.length, 1, "Grass texture should mount one overlay canvas");
  assert.equal(frame.children[0].id, "grassTextureCanvas");
  assert.equal(frame.children[0].style.pointerEvents, "none",
    "Grass texture overlay must not intercept selection, drag or placement input");
  assert.equal(frame.children[0].style.zIndex, "1",
    "Grass texture should stay below animal sprite layers");
  assert.equal(typeof rafCallbacks[0], "function");
  rafCallbacks[0](1000);

  return { LittleGod, drawCalls };
}

const readyHarness = createHarness();
assert.equal(readyHarness.LittleGod.terrainArtModel.version, "terrain-art-v1");
assert.deepEqual([...readyHarness.LittleGod.terrainArtModel.integratedTiles], ["grass-base"]);
assert.equal(readyHarness.LittleGod.terrainArtModel.programTerrainFallback, true);
assert.equal(readyHarness.LittleGod.terrainArtModel.waterEnabled, false);
assert.equal(readyHarness.LittleGod.terrainArtModel.riverbanksEnabled, false);
const readyDiagnostics = readyHarness.LittleGod.getTerrainArtDiagnostics();
assert.equal(readyDiagnostics.asset.status, "ready");
assert.equal(readyDiagnostics.textureReady, true);
assert.ok(readyDiagnostics.texturedCells >= 1,
  "Green terrain cells should receive an ecology-driven grass texture mask");
assert.ok(readyDiagnostics.meanCoverage > 0);
assert.equal(readyDiagnostics.fallbackReason, null);
assert.ok(readyHarness.drawCalls.some((call) => call[0] === "putImageData"),
  "Grass coverage mask should be materialized before rendering");
assert.ok(readyHarness.drawCalls.some((call) => call[0] === "drawImage" && call.length === 6),
  "Prepared grass texture should be drawn at an explicit world-space size");

const failedHarness = createHarness({ failImage: true });
const failedDiagnostics = failedHarness.LittleGod.getTerrainArtDiagnostics();
assert.equal(failedDiagnostics.asset.status, "error");
assert.equal(failedDiagnostics.textureReady, false);
assert.equal(failedDiagnostics.fallbackReason, "asset-error",
  "Missing texture must leave the existing procedural terrain as fallback");

console.log("grass-texture.test: PASS (ecology mask, camera overlay and fallback verified)");
