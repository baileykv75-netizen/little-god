const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

let draws = 7;
const LittleGod = {
  getExperimentDiagnostics() {
    return {
      algorithm: "mulberry32-fnv1a-v1",
      seed: "replayable-meadow",
      seedHash: 123456,
      draws,
      deterministic: true,
      source: "url",
    };
  },
  getExperimentReplayUrl() {
    return "https://example.test/little-god/?seed=replayable-meadow";
  },
  telemetrySnapshot() {
    return {
      version: "base-v1",
      worldYear: 1.25,
      populations: { grazers: 12, hunters: 2 },
    };
  },
};

const window = {
  LittleGod,
  LittleGodTelemetry: {
    getSnapshot: LittleGod.telemetrySnapshot,
  },
};
const context = { window, console, Object };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/experiment-telemetry-v1.js", "utf8"),
  context,
  { filename: "src/genesis/experiment-telemetry-v1.js" },
);

assert.equal(typeof window.LittleGodTelemetry.getSnapshot, "function");
assert.equal(typeof LittleGod.getExperimentTelemetrySnapshot, "function");
assert.equal(LittleGod.experimentTelemetryModel.includesSeed, true);
assert.equal(LittleGod.experimentTelemetryModel.includesReplayUrl, true);

const first = window.LittleGodTelemetry.getSnapshot();
assert.equal(first.version, "base-v1");
assert.equal(first.worldYear, 1.25);
assert.deepEqual(first.populations, { grazers: 12, hunters: 2 });
assert.equal(first.experiment.seed, "replayable-meadow");
assert.equal(first.experiment.draws, 7);
assert.equal(first.experiment.deterministic, true);
assert.equal(first.experiment.replayUrl,
  "https://example.test/little-god/?seed=replayable-meadow");

// The wrapper must read current experiment state rather than freezing metadata at load time.
draws = 19;
const second = LittleGod.getExperimentTelemetrySnapshot();
assert.equal(second.experiment.draws, 19);
assert.equal(second.populations.grazers, 12);

console.log("experiment-telemetry.test: PASS");
