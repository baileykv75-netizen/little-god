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
assert.ok(references.includes("src/genesis/deer-sprites-v1.js"),
  "index.html must load the Round 60 deer sprite slice");

const integratedSprites = [
  "art/animals/wolf-adult.png",
  "art/animals/wolf-pup.png",
  "art/animals/deer-buck.png",
  "art/animals/deer-doe.png",
  "art/animals/deer-fawn.png",
];
for (const spritePath of integratedSprites) {
  const absolute = path.join(root, spritePath);
  assert.ok(fs.existsSync(absolute), `Missing integrated animal sprite: ${spritePath}`);
  assert.ok(fs.statSync(absolute).size > 0, `Animal sprite must not be empty: ${spritePath}`);
}

function pngColorType(filename) {
  const data = fs.readFileSync(path.join(root, filename));
  assert.equal(data.toString("ascii", 12, 16), "IHDR", `${filename} must contain a PNG IHDR chunk`);
  return data[25];
}
for (const deerPath of [
  "art/animals/deer-buck.png",
  "art/animals/deer-doe.png",
  "art/animals/deer-fawn.png",
]) {
  assert.equal(pngColorType(deerPath), 2,
    `${deerPath} is expected to be RGB art and must use runtime background removal`);
}

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

function runSpriteModule({ modulePath, state, failImage, lifeStage }) {
  const drawCalls = [];
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
      if (failImage(value)) this.onerror?.(new Error(`simulated missing sprite: ${value}`));
      else this.onload?.();
    }
    get src() { return this._src; }
  }

  const baseCanvas = new FakeElement("canvas");
  const frame = new FakeElement("div");
  const loadListeners = [];
  let rafCallback = null;
  const LittleGod = {
    state,
    lifeStage,
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
    fs.readFileSync(path.join(root, modulePath), "utf8"),
    sandbox,
    { filename: modulePath },
  );
  for (const listener of loadListeners) listener();
  assert.equal(typeof rafCallback, "function", `${modulePath} should start a render loop after load`);
  rafCallback(1000);
  return { LittleGod, frame, drawCalls };
}

const wolfRun = runSpriteModule({
  modulePath: "src/genesis/art-preview-v1.js",
  state: {
    selectedIndividualId: 10,
    hunters: [
      { id: 10, age: 3, x: 100, y: 120, angle: 0.2, bobPhase: 0.4 },
      { id: 11, age: 0.2, x: 180, y: 150, angle: 0.7, bobPhase: 0.9 },
    ],
  },
  failImage: (value) => value.includes("wolf-pup"),
  lifeStage: (animal) => animal.age < 1 ? "juvenile" : "adult",
});

assert.equal(wolfRun.LittleGod.animalSpriteModel.version, "animal-sprites-v1");
assert.equal(wolfRun.LittleGod.animalSpriteModel.programDrawingFallback, true);
assert.equal(wolfRun.LittleGod.animalSpriteModel.terrainSpritesEnabled, false);
assert.deepEqual([...wolfRun.LittleGod.animalSpriteModel.integratedSpecies], ["hunter"]);
const wolfMapping = wolfRun.LittleGod.getAnimalSpriteMapping();
assert.equal(wolfMapping.hunter.juvenile.path, "art/animals/wolf-pup.png");
assert.equal(wolfMapping.hunter.adult.path, "art/animals/wolf-adult.png");
assert.equal(wolfRun.frame.children.length, 1);
assert.equal(wolfRun.frame.children[0].id, "animalSpriteCanvas");
assert.equal(wolfRun.frame.children[0].style.pointerEvents, "none");
const wolfDiagnostics = wolfRun.LittleGod.getAnimalSpriteDiagnostics();
assert.equal(wolfDiagnostics.renderedHunters, 1);
assert.equal(wolfDiagnostics.fallbackHunters, 1);
assert.equal(wolfDiagnostics.selectedSpriteVisible, true);
assert.equal(wolfDiagnostics.assets.find((asset) => asset.key === "wolf-adult").processed, true);

const deerRun = runSpriteModule({
  modulePath: "src/genesis/deer-sprites-v1.js",
  state: {
    selectedIndividualId: 20,
    grazers: [
      { id: 20, age: 3, sex: "male", x: 100, y: 120, angle: 0.2, bobPhase: 0.4 },
      { id: 21, age: 10, sex: "female", x: 180, y: 150, angle: 0.7, bobPhase: 0.9 },
      { id: 22, age: 0.2, sex: "male", x: 240, y: 180, angle: 1.1, bobPhase: 1.2 },
    ],
  },
  failImage: (value) => value.includes("deer-fawn"),
  lifeStage: (animal) => animal.age < 1 ? "juvenile" : animal.age >= 8 ? "elder" : "adult",
});

assert.equal(deerRun.LittleGod.deerSpriteModel.version, "deer-sprites-v1");
assert.equal(deerRun.LittleGod.deerSpriteModel.programDrawingFallback, true);
assert.equal(deerRun.LittleGod.deerSpriteModel.sexAwareAdults, true);
assert.equal(deerRun.LittleGod.deerSpriteModel.terrainSpritesEnabled, false);
assert.deepEqual([...deerRun.LittleGod.deerSpriteModel.integratedSpecies], ["grazer"]);
const deerMapping = deerRun.LittleGod.getDeerSpriteMapping();
assert.equal(deerMapping.juvenile.any.path, "art/animals/deer-fawn.png");
assert.equal(deerMapping.adult.male.path, "art/animals/deer-buck.png");
assert.equal(deerMapping.adult.female.path, "art/animals/deer-doe.png");
assert.equal(deerMapping.elder.male.path, "art/animals/deer-buck.png");
assert.equal(deerMapping.elder.female.path, "art/animals/deer-doe.png");
assert.equal(deerRun.frame.children.length, 1,
  "Deer sprites should mount on one pointer-transparent overlay canvas");
assert.equal(deerRun.frame.children[0].id, "deerSpriteCanvas");
assert.equal(deerRun.frame.children[0].style.pointerEvents, "none");
const deerDiagnostics = deerRun.LittleGod.getDeerSpriteDiagnostics();
assert.equal(deerDiagnostics.renderedGrazers, 2,
  "Adult male and elder female grazers should use their sex-aware deer sprites");
assert.equal(deerDiagnostics.fallbackGrazers, 1,
  "A missing fawn sprite must leave the program-drawn juvenile grazer available");
assert.equal(deerDiagnostics.selectedSpriteVisible, true,
  "Selected grazer should retain an observable selection ring on the deer layer");
for (const key of ["deer-buck", "deer-doe"]) {
  const asset = deerDiagnostics.assets.find((candidate) => candidate.key === key);
  assert.equal(asset.status, "ready");
  assert.equal(asset.processed, true);
  assert.ok(asset.backgroundPixelsRemoved > 0,
    `${key} RGB art should receive border-connected background removal before rendering`);
}
assert.equal(deerDiagnostics.assets.find((asset) => asset.key === "deer-fawn").status, "error");
assert.ok(deerRun.drawCalls.filter((call) => call[0] === "drawImage" && call.length === 6).length >= 2,
  "Prepared buck and doe sprites should be drawn with explicit world-space sizes");
assert.ok(deerRun.drawCalls.some((call) => call[0] === "arc"),
  "Deer sprite overlay should redraw the selected-animal ring");

console.log(`static-assets.test: PASS (${references.length} local assets; wolf and deer sprite overlays verified)`);
