const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const buildLabel = {
  dataset: { build: "v0.6.6" },
  textContent: "v0.6.6 · runtime provenance",
  title: "",
};

const LittleGod = {
  state: {},
  seedWorld() {
    this.state.snapshot = [this.random(), this.randomBetween(-5, 5), this.random()];
    return this.state.snapshot.slice();
  },
};

const context = {
  window: {
    LittleGod,
    location: { search: "?seed=repeatable-forest" },
  },
  document: {
    readyState: "complete",
    querySelector(selector) {
      if (selector === ".build-version") return buildLabel;
      return null;
    },
    addEventListener() {},
  },
  URLSearchParams,
  Date: class extends Date {
    static now() { return 123456789; }
  },
  console,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/rng-v1.js", "utf8"),
  context,
  { filename: "src/genesis/rng-v1.js" },
);

assert.equal(typeof LittleGod.random, "function");
assert.equal(typeof LittleGod.setExperimentSeed, "function");
assert.equal(typeof LittleGod.getExperimentDiagnostics, "function");
assert.equal(typeof LittleGod.getRuntimeBuildDiagnostics, "function");
assert.equal(buildLabel.textContent, "v0.6.6 · seed repeatable-forest");
assert.ok(buildLabel.title.includes("构建：v0.6.6"));
assert.ok(buildLabel.title.includes("repeatable-forest"));

const firstWorld = LittleGod.seedWorld();
const secondWorld = LittleGod.seedWorld();
assert.deepEqual(secondWorld, firstWorld, "Resetting the world must replay the same seed");

LittleGod.rewindExperimentRandom();
const firstSequence = [LittleGod.random(), LittleGod.random(), LittleGod.random()];
LittleGod.rewindExperimentRandom();
const repeatedSequence = [LittleGod.random(), LittleGod.random(), LittleGod.random()];
assert.deepEqual(repeatedSequence, firstSequence,
  "Rewinding must reproduce the same random sequence");

LittleGod.rewindExperimentRandom();
const globalMathValue = vm.runInContext("Math.random()", context);
LittleGod.rewindExperimentRandom();
assert.equal(globalMathValue, LittleGod.random(),
  "Direct Math.random calls inside browser scripts must use the seeded generator");

LittleGod.setExperimentSeed("different-forest");
const differentWorld = LittleGod.seedWorld();
assert.notDeepEqual(differentWorld, firstWorld, "Different seeds must produce different worlds");
assert.equal(buildLabel.textContent, "v0.6.6 · seed different-forest");
assert.equal(buildLabel.dataset.build, "v0.6.6");

const diagnostics = LittleGod.getExperimentDiagnostics();
assert.equal(diagnostics.algorithm, "mulberry32-fnv1a-v1");
assert.equal(diagnostics.build, "v0.6.6");
assert.equal(diagnostics.seed, "different-forest");
assert.equal(diagnostics.deterministic, true);
assert.equal(diagnostics.source, "api");
assert.equal(diagnostics.draws, 3);
assert.equal(LittleGod.state.randomDraws, 3);
assert.equal(LittleGod.state.experimentSeed, "different-forest");
assert.equal(LittleGod.experimentControlModel.preservesBuildProvenance, true);
assert.deepEqual(
  LittleGod.getRuntimeBuildDiagnostics(),
  { version: "v0.6.6", seed: "different-forest", label: "v0.6.6 · seed different-forest" },
);

console.log("seeded-rng.test: PASS");
