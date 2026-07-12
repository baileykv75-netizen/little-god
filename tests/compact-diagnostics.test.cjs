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
const window = {
  LittleGod: { state: { inspectMode: false, year: 3.5 } },
  LittleGodTelemetry: {
    getSnapshot() {
      return {
        version: "test",
        worldYear: 3.5,
        season: "summer",
        running: false,
        speed: 1,
        resources: { greenBiomass: 100, dryBiomass: 20, seedBank: 10, rootBiomass: 30 },
        populations: { grazers: 18, hunters: 3 },
        balance: { label: "脆弱但完整", score: 62 },
        lifetimeMetrics: { hunterBirths: 1, springRecoveries: 1 },
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
const report = window.LittleGodDiagnostics.buildReport("supervision test");
assert.equal(report.compactSummary.meta.version, "ecology-supervision-v1");
assert.equal(report.compactSummary.meta.seed, "compact-test");
assert.equal(report.compactSummary.reproductionDiagnostics.hunter.successes, 1);
assert.equal(report.compactSummary.springDiagnostics[0].triggeredSpringRecovery, true);
assert.equal(report.compactSummary.yearlyTimeline[0].hunterBirths, 1);
assert.equal(report.playerNotes, "supervision test");
assert.equal(report.finalSnapshot.compactSummary.meta.version, "ecology-supervision-v1");

console.log("compact-diagnostics.test: PASS");
