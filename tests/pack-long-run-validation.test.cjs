const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const assert = require("assert");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "little-god-round56-"));
const output = path.join(tempRoot, "pack-coordination.json");
const relativeOutput = path.relative(process.cwd(), output);
const result = spawnSync(process.execPath, [
  "tools/run-pack-coordination-validation.cjs",
  "--years", "0.08",
  "--step-years", "0.001875",
  "--seed", "round56-pack-test",
  "--output", relativeOutput,
  "--quiet",
], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 120000,
});

assert.equal(result.status, 0, `Pack validation failed:\n${result.stdout}\n${result.stderr}`);
assert.ok(fs.existsSync(output));

const report = JSON.parse(fs.readFileSync(output, "utf8"));
assert.equal(report.schemaVersion, "round56-pack-coordination-validation-v1");
assert.equal(report.deterministicReplayMatched, true);
assert.equal(report.metadata.seed, "round56-pack-test");
assert.equal(report.run.deterministic, true);
assert.equal(report.run.scenario.created.grazers, 18);
assert.equal(report.run.scenario.created.hunters, 4);
assert.ok(report.run.initial.hunterPacks >= 1);
assert.ok(report.run.coordinationSummary.packCoordination.targetAcquisitions >= 1);
assert.ok(report.run.coordinationSummary.packCoordination.memberAssignments >= 1);
assert.ok(report.run.coordinationSummary.maxFollowers >= 2);
assert.ok(report.run.coordinationSummary.maxFollowers <= 4);
assert.ok(Array.isArray(report.run.yearlyTimeline));
assert.ok(report.metadata.runtimeScripts.includes("src/genesis/pack-hunting-v1.js"));
assert.ok(report.metadata.reproduceCommand.includes("run-pack-coordination-validation.cjs"));

const hunts = report.run.coordinationSummary.packCoordination.hunts;
assert.ok(hunts.coordinatedPackHuntSuccessRate === null
  || Number.isFinite(hunts.coordinatedPackHuntSuccessRate));
assert.ok(hunts.uncoordinatedPackHuntSuccessRate === null
  || Number.isFinite(hunts.uncoordinatedPackHuntSuccessRate));

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("pack-long-run-validation.test: PASS");
