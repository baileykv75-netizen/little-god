const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const compactSummary = {
  meta: { version: "ecology-supervision-v1", seed: "compact-test", duration: 3.5 },
  verdict: { label: "脆弱但完整", failedCriteria: ["spring"] },
  milestones: { firstHunterBirthYear: 1.2 },
  populationSummary: { initial: { grazers: 20, hunters: 2 }, maximum: { grazers: 25, hunters: 4 }, final: { grazers: 18, hunters: 3 } },
  reproductionDiagnostics: { hunter: { attempts: 2, successes: 1, failureReasons: { preyRatio: 3 } } },
  springDiagnostics: [{ year: 0, greenGain: 30, triggeredSpringRecovery: true }],
  yearlyTimeline: [{ year: 0, grazers: 20, hunters: 2, green: 100, dry: 20, seeds: 10, roots: 30, hunterBirths: 1, springRecoveries: 1 }],
};

const listeners = {};
const document = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { click() {}, remove() {} }; },
  body: { append() {} },
};

const state = {
  inspectMode: false,
  year: 3.5,
  season: "spring",
  vegetationMetrics: { seedProduced: 0, seedGerminated: 0 },
  ledger: { germinatedBiomass: 0, seedDispersals: 0 },
  lifetime: { germinatedBiomass: 0, seedDispersals: 0, hunterBirths: 1, springRecoveries: 1 },
};

const LittleGod = {
  state,
  incrementMetric(key, amount = 1) {
    state.ledger[key] = (state.ledger[key] || 0) + amount;
    state.lifetime[key] = (state.lifetime[key] || 0) + amount;
  },
  updateWorld(dt) {
    state.year += dt;
    if (state.season === "spring") {
      state.vegetationMetrics.seedGerminated += 2;
      LittleGod.incrementMetric("germinatedBiomass", 0.76);
    }
    if (state.season === "autumn") {
      state.vegetationMetrics.seedProduced += 3;
    }
  },
  seedWorld() {
    state.vegetationMetrics.seedProduced = 0;
    state.vegetationMetrics.seedGerminated = 0;
    state.ledger.germinatedBiomass = 0;
    state.ledger.seedDispersals = 0;
    state.lifetime.germinatedBiomass = 0;
    state.lifetime.seedDispersals = 0;
    return true;
  },
};

const window = {
  LittleGod,
  LittleGodTelemetry: {
    getSnapshot() {
      return {
        version: "test",
        worldYear: state.year,
        season: state.season,
        running: false,
        speed: 1,
        resources: { greenBiomass: 100, dryBiomass: 20, seedBank: 10, rootBiomass: 30 },
        populations: { grazers: 18, hunters: 3 },
        balance: { label: "脆弱但完整", score: 62 },
        lifetimeMetrics: { ...state.lifetime },
        compactSummary,
      };
    },
  },
  addEventListener(type, listener) { listeners[type] = listener; },
};

const context = {
  window,
  document,
  console,
  crypto: { randomUUID() { return "diagnostic-test"; } },
  Date,
  Math,
  Set,
  Object,
  Number,
  String,
  JSON,
  location: { href: "https://example.test/little-god/" },
  navigator: { userAgent: "node", language: "zh-CN" },
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  setTimeout() { return 1; },
  setInterval() { return 1; },
  clearInterval() {},
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/diagnostics.js", "utf8"),
  context,
  { filename: "src/genesis/diagnostics.js" },
);

assert.equal(typeof window.LittleGodDiagnostics.buildReport, "function");
assert.equal(typeof window.LittleGodDiagnostics.plantFlowDiagnostics, "function");

LittleGod.updateWorld(0.1);
assert.equal(state.lifetime.germinatedBiomass, 0.76,
  "The bridge must not double-count germination already recorded by ecology stability");
assert.equal(state.lifetime.seedDispersals, 0);

state.season = "autumn";
LittleGod.updateWorld(0.1);
assert.equal(state.lifetime.seedDispersals, 3,
  "Autumn seed production must reach the public seedDispersals metric");

const report = window.LittleGodDiagnostics.buildReport("supervision test");
assert.equal(report.compactSummary.meta.version, "ecology-supervision-v1");
assert.equal(report.compactSummary.meta.seed, "compact-test");
assert.equal(report.compactSummary.reproductionDiagnostics.hunter.successes, 1);
assert.equal(report.compactSummary.springDiagnostics[0].triggeredSpringRecovery, true);
assert.equal(report.compactSummary.yearlyTimeline[0].hunterBirths, 1);
assert.equal(report.playerNotes, "supervision test");
assert.equal(report.finalSnapshot.compactSummary.meta.version, "ecology-supervision-v1");
assert.equal(report.compactSummary.plantFlowDiagnostics.version, "continuous-plant-flow-v1");
assert.equal(report.compactSummary.plantFlowDiagnostics.seedProduced, 3);
assert.equal(report.compactSummary.plantFlowDiagnostics.seedGerminated, 2);
assert.equal(report.compactSummary.plantFlowDiagnostics.germinatedBiomass, 0.76);
assert.equal(report.compactSummary.plantFlowDiagnostics.seedDispersals, 3);
assert.equal(report.compactSummary.plantFlowDiagnostics.bridgeAdditions.germinatedBiomass, 0);
assert.equal(report.compactSummary.plantFlowDiagnostics.bridgeAdditions.seedDispersals, 3);
assert.equal(report.summary.plantFlowDiagnostics.seedDispersals, 3);
assert.equal(report.finalSnapshot.plantFlowDiagnostics.seedProduced, 3);

LittleGod.seedWorld();
const resetFlow = window.LittleGodDiagnostics.plantFlowDiagnostics();
assert.equal(resetFlow.observedDeltas.seedProduced, 0);
assert.equal(resetFlow.observedDeltas.seedGerminated, 0);
assert.equal(resetFlow.bridgeAdditions.seedDispersals, 0);

console.log("compact-diagnostics.test: PASS");
