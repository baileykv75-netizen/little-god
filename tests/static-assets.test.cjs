const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const iconMatch = html.match(/<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i);
assert.ok(iconMatch, "index.html must declare a favicon so browsers do not request missing /favicon.ico");
assert.ok(iconMatch[1].startsWith("data:image/svg+xml,"),
  "favicon must be embedded to avoid an extra network request and 404");

const references = [];
for (const match of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi)) {
  const reference = match[1];
  if (reference.startsWith("data:") || reference.startsWith("http://") || reference.startsWith("https://")) continue;
  references.push(reference.split(/[?#]/, 1)[0]);
}

assert.ok(references.length > 0, "index.html should load local game assets");
for (const reference of references) {
  const assetPath = path.join(root, reference);
  assert.ok(fs.existsSync(assetPath), `Missing browser asset: ${reference}`);
  assert.ok(fs.statSync(assetPath).isFile(), `Browser asset is not a file: ${reference}`);
}

for (const spritePath of ["art/animals/wolf-adult.png", "art/animals/wolf-pup.png"]) {
  const absolute = path.join(root, spritePath);
  assert.ok(fs.existsSync(absolute), `Missing integrated wolf sprite: ${spritePath}`);
  assert.ok(fs.statSync(absolute).size > 0, `Wolf sprite must not be empty: ${spritePath}`);
}

const drawCalls = [];
function spritePixels() {
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (let index = 0; index < 16; index += 1) {
    const offset = index * 4;
    pixels[offset] = 248;
    pixels[offset + 1] = 247;
    pixels[offset + 2] = 242;
    pixels[offset + 3] = 255;
  }
  for (const index of [5, 6, 9, 10]) {
    const offset = index * 4;
    pixels[offset] = 72;
    pixels[offset + 1] = 82;
    pixels[offset + 2] = 94;
  }
  return pixels;
}

function createContext() {
  return {
    clearRect(...args) { drawCalls.push(["clearRect", ...args]); },
    save() { drawCalls.push(["save"]); },
    restore() { drawCalls.push(["restore"]); },
    translate(...args) { drawCalls.push(["translate", ...args]); },
    rotate(...args) { drawCalls.push(["rotate", ...args]); },
    drawImage(...args) { drawCalls.push(["drawImage", ...args]); },
    getImageData() { return { data: spritePixels() }; },
    putImageData(...args) { drawCalls.push(["putImageData", ...args]); },
    beginPath() { drawCalls.push(["beginPath"]); },
    arc(...args) { drawCalls.push(["arc", ...args]); },
    stroke() { drawCalls.push(["stroke"]); },
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
  }
  append(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getContext() { return createContext(); }
}

class FakeImage {
  constructor() {
    this.naturalWidth = 4;
    this.naturalHeight = 4;
    this.width = 4;
    this.height = 4;
    this.onload = null;
    this.onerror = null;
  }
  set src(value) {
    this._src = value;
    if (value.includes("wolf-pup")) this.onerror?.(new Error("simulated missing juvenile sprite"));
    else this.onload?.();
  }
  get src() { return this._src; }
}

const baseCanvas = new FakeElement("canvas");
const frame = new FakeElement("div");
const loadListeners = [];
let rafCallback = null;
const LittleGod = {
  state: {
    selectedIndividualId: 10,
    hunters: [
      { id: 10, age: 3, x: 100, y: 120, angle: 0.2, bobPhase: 0.4 },
      { id: 11, age: 0.2, x: 180, y: 150, angle: 0.7, bobPhase: 0.9 },
    ],
  },
  lifeStage(animal) { return animal.age < 1 ? "juvenile" : "adult"; },
  camera: {
    zoom: 1,
    apply(context) { context.translate(0, 0); },
    isVisible() { return true; },
  },
};

const document = {
  getElementById() { return null; },
  querySelector(selector) {
    if (selector === "#worldCanvas") return baseCanvas;
    if (selector === ".world-frame") return frame;
    return null;
  },
  createElement(tag) { return new FakeElement(tag); },
};
const window = {
  LittleGod,
  addEventListener(type, listener) { if (type === "load") loadListeners.push(listener); },
  requestAnimationFrame(callback) { rafCallback = callback; return 1; },
};
const sandbox = {
  window,
  document,
  Image: FakeImage,
  console,
  Object,
  Array,
  Map,
  Set,
  Number,
  String,
  Boolean,
  Math,
  Uint8Array,
  Uint8ClampedArray,
  Int32Array,
};

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, "src/genesis/art-preview-v1.js"), "utf8"),
  sandbox,
  { filename: "src/genesis/art-preview-v1.js" },
);

assert.equal(LittleGod.animalSpriteModel.version, "animal-sprites-v1");
assert.equal(LittleGod.animalSpriteModel.programDrawingFallback, true);
assert.equal(LittleGod.animalSpriteModel.terrainSpritesEnabled, false);
assert.deepEqual([...LittleGod.animalSpriteModel.integratedSpecies], ["hunter"]);
const mapping = LittleGod.getAnimalSpriteMapping();
assert.equal(mapping.hunter.juvenile.path, "art/animals/wolf-pup.png");
assert.equal(mapping.hunter.adult.path, "art/animals/wolf-adult.png");
assert.equal(mapping.hunter.elder.path, "art/animals/wolf-adult.png");

for (const listener of loadListeners) listener();
assert.equal(frame.children.length, 1, "Wolf sprites should mount on one pointer-transparent overlay canvas");
assert.equal(frame.children[0].id, "animalSpriteCanvas");
assert.equal(frame.children[0].style.pointerEvents, "none");
assert.equal(typeof rafCallback, "function");
rafCallback(1000);

const diagnostics = LittleGod.getAnimalSpriteDiagnostics();
assert.equal(diagnostics.overlayMounted, true);
assert.equal(diagnostics.renderedHunters, 1,
  "Adult wolf should render through the prepared sprite asset");
assert.equal(diagnostics.fallbackHunters, 1,
  "A missing juvenile sprite must leave the program-drawn hunter available as fallback");
assert.equal(diagnostics.selectedSpriteVisible, true,
  "Selected hunter should retain an observable selection ring on the sprite layer");
const adultAsset = diagnostics.assets.find((asset) => asset.key === "wolf-adult");
const juvenileAsset = diagnostics.assets.find((asset) => asset.key === "wolf-pup");
assert.equal(adultAsset.status, "ready");
assert.equal(adultAsset.processed, true);
assert.ok(adultAsset.backgroundPixelsRemoved > 0,
  "RGB wolf art should receive border-connected background removal before rendering");
assert.equal(juvenileAsset.status, "error");
assert.ok(drawCalls.some((call) => call[0] === "drawImage" && call.length === 6),
  "Prepared wolf sprite should be drawn with an explicit world-space size");
assert.ok(drawCalls.some((call) => call[0] === "arc"),
  "Sprite overlay should redraw the selected-animal ring instead of hiding selection feedback");

console.log(`static-assets.test: PASS (${references.length} local assets; wolf sprite overlay verified)`);
