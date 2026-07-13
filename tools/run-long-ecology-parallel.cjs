#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const harness = require("./run-long-ecology.cjs");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_WORKERS = 2;

function seedsFor(scenarioName, count) {
  return Array.from({ length: count }, (_, index) => (
    `round51-${scenarioName}-${String(index + 1).padStart(2, "0")}`
  ));
}

function gitSha() {
  return process.env.GITHUB_SHA || null;
}

function reportDocument(options, phase, runs) {
  const command = `node tools/run-long-ecology-parallel.cjs --years ${options.years} --seeds-per-scenario ${options.seedsPerScenario} --step-years ${options.stepYears} --output-dir ${path.relative(ROOT, options.outputDir)}`;
  return {
    schemaVersion: "round51-long-run-v1",
    phase,
    generatedAt: new Date().toISOString(),
    commit: gitSha(),
    metadata: {
      yearsPerRun: options.years,
      seedsPerScenario: options.seedsPerScenario,
      stepYears: options.stepYears,
      workerCount: options.workerCount,
      stepBasis: "controlled headless step equal to the in-game 12x four-substep update",
      scenarios: Object.fromEntries(Object.entries(harness.SCENARIOS).map(([key, value]) => [key, {
        label: value.label,
        description: value.description,
        seeds: seedsFor(key, options.seedsPerScenario),
        interventions: value.interventions,
      }])),
      reproduceCommand: command,
      baselineDefinition: phase === "baseline"
        ? "Current game runtime with Round 51 observation modules excluded. Simulation behavior files are identical."
        : "Same runtime, seeds, scenarios and step size with Round 51 observation modules enabled.",
    },
    aggregate: harness.aggregate(runs),
    runs,
  };
}

function writeResults(options, baselineDoc, postDoc, comparison) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(options.outputDir, "baseline.json"),
    `${JSON.stringify(baselineDoc, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(options.outputDir, "post.json"),
    `${JSON.stringify(postDoc, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(options.outputDir, "comparison.json"),
    `${JSON.stringify(comparison, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(ROOT, "LONG_RUN_FINDINGS.md"),
    harness.generateFindings(options, baselineDoc, postDoc, comparison)
      .replaceAll("头less运行", "无头运行"),
  );
}

function runWorker(task) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { round51Task: task },
    });
    worker.once("message", (message) => {
      if (message?.ok) resolve(message.result);
      else reject(new Error(message?.error || "Unknown Round 51 worker failure"));
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Round 51 worker exited with code ${code}`));
    });
  });
}

async function runQueue(tasks, workerCount, quiet) {
  const results = new Array(tasks.length);
  let nextTask = 0;

  async function consume() {
    while (true) {
      const index = nextTask;
      nextTask += 1;
      if (index >= tasks.length) return;
      const task = tasks[index];
      if (!quiet) process.stdout.write(`[${task.phase}] ${task.scenarioName} ${task.seed}\n`);
      results[index] = await runWorker(task);
    }
  }

  const consumers = Array.from(
    { length: Math.min(workerCount, tasks.length) },
    () => consume(),
  );
  await Promise.all(consumers);
  return results;
}

function buildTasks(options) {
  const tasks = [];
  for (const phase of ["baseline", "post"]) {
    for (const [scenarioName, scenario] of Object.entries(harness.SCENARIOS)) {
      for (const seed of seedsFor(scenarioName, options.seedsPerScenario)) {
        tasks.push({
          scenarioName,
          scenario,
          seed,
          years: options.years,
          stepYears: options.stepYears,
          phase,
        });
      }
    }
  }
  return tasks;
}

async function main() {
  const options = harness.parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node tools/run-long-ecology-parallel.cjs [--years 60] [--seeds-per-scenario 2] [--step-years 0.001875] [--output-dir artifacts/round51]\n");
    return;
  }
  options.workerCount = Math.max(
    1,
    Number.parseInt(process.env.ROUND51_WORKERS || String(DEFAULT_WORKERS), 10) || DEFAULT_WORKERS,
  );

  const results = await runQueue(buildTasks(options), options.workerCount, options.quiet);
  const baselineRuns = results.filter((run) => run.phase === "baseline");
  const postRuns = results.filter((run) => run.phase === "post");
  const baselineDoc = reportDocument(options, "baseline", baselineRuns);
  const postDoc = reportDocument(options, "post", postRuns);
  const comparison = harness.comparePhases(baselineRuns, postRuns);
  if (!comparison.ecologyBehaviorUnchanged) {
    throw new Error(`Round 51 diagnostics changed ecological behavior: ${comparison.mismatches.join(", ")}`);
  }
  writeResults(options, baselineDoc, postDoc, comparison);
  if (!options.quiet) {
    process.stdout.write(`Long-run baseline: ${path.relative(ROOT, path.join(options.outputDir, "baseline.json"))}\n`);
    process.stdout.write(`Long-run post: ${path.relative(ROOT, path.join(options.outputDir, "post.json"))}\n`);
    process.stdout.write("Findings: LONG_RUN_FINDINGS.md\n");
  }
}

if (!isMainThread && workerData?.round51Task) {
  try {
    const result = harness.runSingle(workerData.round51Task);
    parentPort.postMessage({ ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: error?.stack || error?.message || String(error),
    });
  }
} else if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildTasks,
  reportDocument,
  runQueue,
  writeResults,
};
