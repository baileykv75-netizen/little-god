const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const assert = require("assert");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "little-god-round51-"));
const relativeOutput = path.relative(process.cwd(), tempRoot);
const result = spawnSync(process.execPath, [
  "tools/run-long-ecology.cjs",
  "--years", "0.03",
  "--seeds-per-scenario", "1",
  "--step-years", "0.001875",
  "--output-dir", relativeOutput,
  "--quiet",
], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 120000,
});

assert.equal(result.status, 0, `Long-run harness failed:\n${result.stdout}\n${result.stderr}`);

const baseline = JSON.parse(fs.readFileSync(path.join(tempRoot, "baseline.json"), "utf8"));
const post = JSON.parse(fs.readFileSync(path.join(tempRoot, "post.json"), "utf8"));
const comparison = JSON.parse(fs.readFileSync(path.join(tempRoot, "comparison.json"), "utf8"));

assert.equal(baseline.phase, "baseline");
assert.equal(post.phase, "post");
assert.equal(baseline.runs.length, 3);
assert.equal(post.runs.length, 3);
assert.equal(comparison.ecologyBehaviorUnchanged, true);
assert.deepEqual(comparison.mismatches, []);
assert.ok(post.runs.every((run) => run.initialConditions.defaultInitialState));
assert.ok(post.runs.every((run) => run.initialConditions.populationAtFirstStart));
assert.ok(post.runs.every((run) => run.groupQuality?.observationOnly === true));
assert.ok(post.runs.every((run) => Array.isArray(run.yearlyTimeline)));
assert.equal(post.metadata.scenarios.default.seeds[0], "round51-default-01");
assert.equal(post.metadata.scenarios.stress.interventions.filter((entry) => entry.phase === "preStart").length, 34);
assert.equal(typeof post.aggregate.scenarios.default.survivalAtFinalYear.hunters, "number");
assert.ok(fs.existsSync(path.resolve("LONG_RUN_FINDINGS.md")));

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("long-run-tool.test: PASS");
