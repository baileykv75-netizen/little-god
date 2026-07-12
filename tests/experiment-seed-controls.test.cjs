const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

class FakeElement {
  constructor() {
    this.value = "";
    this.textContent = "";
    this.title = "";
    this.dataset = {};
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type) {
    const event = { preventDefault() {} };
    for (const listener of this.listeners.get(type) || []) {
      await listener(event);
    }
  }
}

const elements = {
  ".build-version": new FakeElement(),
  "#experimentSeedForm": new FakeElement(),
  "#experimentSeedInput": new FakeElement(),
  "#copyExperimentReplay": new FakeElement(),
  "#experimentSeedStatus": new FakeElement(),
};
let worldResets = 0;
let cameraResets = 0;
let copiedText = "";
let toast = "";

const LittleGod = {
  state: {},
  seedWorld() {
    worldResets += 1;
    this.state.snapshot = [this.random(), this.random()];
    return this.state.snapshot.slice();
  },
  camera: {
    reset() { cameraResets += 1; },
  },
  showToast(message) { toast = message; },
};

const context = {
  window: {
    LittleGod,
    location: {
      search: "?seed=repeatable-forest",
      href: "https://example.test/little-god/?mode=observe&seed=repeatable-forest",
    },
  },
  document: {
    readyState: "complete",
    querySelector(selector) { return elements[selector] || null; },
  },
  navigator: {
    clipboard: {
      async writeText(value) { copiedText = value; },
    },
  },
  URL,
  URLSearchParams,
  Date: class extends Date {
    static now() { return 123456789; }
  },
  console,
  encodeURIComponent,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/rng-v1.js", "utf8"),
  context,
  { filename: "src/genesis/rng-v1.js" },
);

assert.equal(elements["#experimentSeedForm"].dataset.bound, "true");
assert.equal(elements["#experimentSeedInput"].value, "repeatable-forest");
assert.equal(LittleGod.getExperimentControlDiagnostics().mounted, true);
assert.equal(LittleGod.experimentControlModel.resetsWorldOnApply, true);

const initialWorld = LittleGod.seedWorld();
elements["#experimentSeedInput"].value = "meadow-study-02";
(async () => {
  await elements["#experimentSeedForm"].dispatch("submit");
  assert.equal(worldResets, 2);
  assert.equal(cameraResets, 1);
  assert.equal(LittleGod.getExperimentDiagnostics().seed, "meadow-study-02");
  assert.equal(LittleGod.getExperimentDiagnostics().source, "control");
  assert.equal(elements["#experimentSeedInput"].value, "meadow-study-02");
  assert.match(elements["#experimentSeedStatus"].textContent, /已重置为种子/);
  assert.equal(toast, "已使用新种子重置世界");
  assert.notDeepEqual(LittleGod.state.snapshot, initialWorld);

  await elements["#copyExperimentReplay"].dispatch("click");
  assert.equal(copiedText, "https://example.test/little-god/?mode=observe&seed=meadow-study-02");
  assert.equal(elements["#experimentSeedStatus"].textContent, "复现链接已复制");
  assert.equal(toast, "复现链接已复制");

  console.log("experiment-seed-controls.test: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
