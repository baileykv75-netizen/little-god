#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_YEARS = 60;
const DEFAULT_STEP_YEARS = 0.001875;
const DEFAULT_SEED = "round56-pack-coordination-01";
const DEFAULT_OUTPUT = path.join(ROOT, "artifacts", "round56", "pack-coordination.json");

const SCRIPT_PATHS = [
  "src/genesis/core.js",
  "src/genesis/world-v2.js",
  "src/genesis/terrain-store-v2.js",
  "src/genesis/rng-v1.js",
  "src/genesis/terrain-diagnostics-contract.js",
  "src/genesis/attributes.js",
  "src/genesis/arcane-bloodline-v1.js",
  "src/genesis/kinship-v1.js",
  "src/genesis/speciation-v1.js",
  "src/genesis/simulation.js",
  "src/genesis/ecology-stability-v1.js",
  "src/genesis/hunter-mate-seeking-v1.js",
  "src/genesis/ecology-rebalance-v1.js",
  "src/genesis/active-traits-v1.js",
  "src/genesis/group-behavior-v1.js",
  "src/genesis/pack-hunting-v1.js",
  "src/genesis/group-quality-v1.js",
];

function parseArgs(argv) {
  const options = {
    years: DEFAULT_YEARS,
    stepYears: DEFAULT_STEP_YEARS,
    seed: DEFAULT_SEED,
    output: DEFAULT_OUTPUT,
    quiet: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--years") {
      options.years = Number(next);
      index += 1;
    } else if (argument === "--step-years") {
      options.stepYears = Number(next);
      index += 1;
    } else if (argument === "--seed") {
      options.seed = String(next);
      index += 1;
    } else if (argument === "--output") {
      options.output = path.resolve(ROOT, next);
      index += 1;
    } else if (argument === "--quiet") {
      options.quiet = true;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!Number.isFinite(options.years) || options.years <= 0) {
    throw new Error("--years must be positive");
  }
  if (!Number.isFinite(options.stepYears) || options.stepYears <= 0) {
    throw new Error("--step-years must be positive");
  }
  if (!options.seed.trim()) throw new Error("--seed must not be empty");
  return options;
}

function cloneMath() {
  const copy = Object.create(Math);
  Object.defineProperty(copy, "random", {
    value: Math.random,
    writable: true,
    configurable: true,
  });
  return copy;
}

function createDocumentStub() {
  const buildLabel = {
    dataset: { build: "v0.7.1" },
    textContent: "v0.7.1",
    title: "",
  };
  return {
    readyState: "complete",
    body: {},
    querySelector(selector) {
      return selector === ".build-version" ? buildLabel : null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() {
      return {
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        append() {},
        remove() {},
        click() {},
      };
    },
  };
}

function createContext(seed) {
  const listeners = new Map();
  const context = {
    console,
    Math: cloneMath(),
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Map,
    Set,
    WeakMap,
    WeakSet,
    URL,
    URLSearchParams,
    structuredClone,
    performance,
    crypto: globalThis.crypto || require("crypto").webcrypto,
    document: createDocumentStub(),
    navigator: { language: "zh-CN", userAgent: "round56-node", clipboard: null },
    location: {
      href: `http://localhost/?seed=${encodeURIComponent(seed)}`,
      search: `?seed=${encodeURIComponent(seed)}`,
    },
    history: { replaceState() {} },
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
  };
  context.window = context;
  context.globalThis = context;
  context.addEventListener = (type, listener) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(listener);
  };
  context.removeEventListener = () => {};
  context.dispatchEvent = (event) => {
    for (const listener of listeners.get(event.type) || []) listener(event);
  };
  vm.createContext(context);
  for (const relativePath of SCRIPT_PATHS) {
    const filename = path.join(ROOT, relativePath);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: relativePath });
  }
  return context;
}

function createControlledPopulation(LG) {
  LG.state.grazers.length = 0;
  LG.state.hunters.length = 0;
  LG.state.carcasses.length = 0;

  const grazers = [];
  const hunters = [];
  for (let index = 0; index < 18; index += 1) {
    const x = 1060 + (index % 6) * 18;
    const y = 560 + Math.floor(index / 6) * 24;
    const created = LG.createAnimal("grazer", x, y, {
      spread: 0,
      playerIntervention: false,
    });
    if (created) grazers.push(created);
  }
  for (let index = 0; index < 4; index += 1) {
    const created = LG.createAnimal("hunter", 900 + index * 14, 590 + (index % 2) * 14, {
      spread: 0,
      playerIntervention: false,
    });
    if (created) {
      created.energy = Math.max(Number(created.energy) || 0, 92);
      hunters.push(created);
    }
  }
  if (grazers.length !== 18 || hunters.length !== 4) {
    throw new Error(`Controlled population creation failed: ${grazers.length} grazers, ${hunters.length} hunters`);
  }
  LG.refreshSocialGroups?.();
  return { grazers, hunters };
}

function resourceSnapshot(LG) {
  const totals = LG.getResourceTotals();
  return {
    green: Number(totals.green) || 0,
    dry: Number(totals.dry) || 0,
    seeds: Number(totals.seeds) || 0,
    roots: Number(totals.roots) || 0,
  };
}

function compactPackSnapshot(LG) {
  const diagnostics = LG.getPackHuntingDiagnostics?.() || null;
  if (!diagnostics) return null;
  return {
    activePacks: diagnostics.activePacks,
    coordinatedPacks: diagnostics.coordinatedPacks,
    membersFollowingSharedTarget: diagnostics.membersFollowingSharedTarget,
    targetAcquisitions: diagnostics.targetAcquisitions,
    targetSwitches: diagnostics.targetSwitches,
    targetLosses: diagnostics.targetLosses,
    coordinatedPackHunts: diagnostics.hunts.coordinatedPackHunts,
    coordinatedPackHuntSuccesses: diagnostics.hunts.coordinatedPackHuntSuccesses,
    coordinatedPackHuntSuccessRate: diagnostics.hunts.coordinatedPackHuntSuccessRate,
    uncoordinatedPackHunts: diagnostics.hunts.uncoordinatedPackHunts,
    uncoordinatedPackHuntSuccesses: diagnostics.hunts.uncoordinatedPackHuntSuccesses,
    uncoordinatedPackHuntSuccessRate: diagnostics.hunts.uncoordinatedPackHuntSuccessRate,
  };
}

function yearlyRecord(LG, year) {
  return {
    year,
    grazers: LG.state.grazers.length,
    hunters: LG.state.hunters.length,
    ...resourceSnapshot(LG),
    packCoordination: compactPackSnapshot(LG),
  };
}

function stableSignature(run) {
  return JSON.stringify({
    seed: run.seed,
    years: run.years,
    stepYears: run.stepYears,
    initial: run.initial,
    yearlyTimeline: run.yearlyTimeline,
    final: run.final,
    coordinationSummary: run.coordinationSummary,
  });
}

function runScenario(options) {
  const context = createContext(options.seed);
  const LG = context.LittleGod;
  LG.setExperimentSeed(options.seed, {
    source: "round56-pack-validation",
    resetWorld: true,
  });
  const created = createControlledPopulation(LG);
  const initialGroups = LG.getGroupBehaviorDiagnostics?.() || null;
  if (!initialGroups || initialGroups.hunterPacks < 1) {
    throw new Error("Controlled population did not form a hunter pack");
  }

  LG.state.running = true;
  const timeline = [yearlyRecord(LG, 0)];
  let recordedYear = 0;
  let coordinationObservedSteps = 0;
  let maxCoordinatedPacks = 0;
  let maxFollowers = 0;

  while (LG.state.year < options.years - 1e-12) {
    const dt = Math.min(options.stepYears, options.years - LG.state.year);
    LG.updateWorld(dt);
    const pack = LG.getPackHuntingDiagnostics?.();
    if (pack) {
      if (pack.coordinatedPacks > 0) coordinationObservedSteps += 1;
      maxCoordinatedPacks = Math.max(maxCoordinatedPacks, pack.coordinatedPacks || 0);
      maxFollowers = Math.max(maxFollowers, pack.membersFollowingSharedTarget || 0);
    }
    const currentYear = Math.floor(LG.state.year + 1e-9);
    while (recordedYear < currentYear && recordedYear < Math.floor(options.years)) {
      recordedYear += 1;
      timeline.push(yearlyRecord(LG, recordedYear));
    }
  }

  if (timeline.at(-1)?.year !== options.years) {
    timeline.push(yearlyRecord(LG, options.years));
  }

  const packCoordination = LG.getPackHuntingDiagnostics();
  const groupQuality = LG.getGroupQualityDiagnostics?.() || null;
  const run = {
    seed: options.seed,
    years: options.years,
    stepYears: options.stepYears,
    deterministic: LG.getExperimentDiagnostics?.().deterministic === true,
    scenario: {
      name: "controlled-pack-coordination",
      description: "18 grazers and 4 nearby hunters are created at fixed coordinates after deterministic world seeding; no later intervention occurs.",
      created: {
        grazers: created.grazers.length,
        hunters: created.hunters.length,
      },
    },
    initial: {
      grazers: created.grazers.length,
      hunters: created.hunters.length,
      hunterPacks: initialGroups.hunterPacks,
      largestGroup: initialGroups.largestGroup,
    },
    yearlyTimeline: timeline,
    final: {
      year: LG.state.year,
      grazers: LG.state.grazers.length,
      hunters: LG.state.hunters.length,
      resources: resourceSnapshot(LG),
      lifetime: { ...(LG.state.lifetime || {}) },
    },
    coordinationSummary: {
      coordinationObservedSteps,
      maxCoordinatedPacks,
      maxFollowers,
      packCoordination,
      groupQuality,
    },
  };

  if (!run.deterministic) throw new Error("Experiment RNG is not deterministic");
  if (packCoordination.targetAcquisitions < 1) {
    throw new Error("No shared pack target was acquired during the controlled run");
  }
  if (packCoordination.memberAssignments < 1) {
    throw new Error("No observing pack member received a shared target");
  }
  if (maxFollowers > 4) {
    throw new Error(`Observer-scoped target assignment exceeded pack size: ${maxFollowers}`);
  }
  return run;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node tools/run-pack-coordination-validation.cjs [--years 60] [--step-years 0.001875] [--seed value] [--output path] [--quiet]\n");
    return;
  }

  const primary = runScenario(options);
  const replay = runScenario(options);
  const deterministicReplayMatched = stableSignature(primary) === stableSignature(replay);
  if (!deterministicReplayMatched) {
    throw new Error("Deterministic replay mismatch for controlled pack coordination scenario");
  }

  const report = {
    schemaVersion: "round56-pack-coordination-validation-v1",
    generatedAt: new Date().toISOString(),
    metadata: {
      seed: options.seed,
      years: options.years,
      stepYears: options.stepYears,
      runtimeScripts: SCRIPT_PATHS,
      reproduceCommand: `node tools/run-pack-coordination-validation.cjs --years ${options.years} --step-years ${options.stepYears} --seed ${options.seed} --output ${path.relative(ROOT, options.output)}`,
    },
    deterministicReplayMatched,
    run: primary,
    replaySummary: {
      final: replay.final,
      coordinationSummary: replay.coordinationSummary,
    },
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
  if (!options.quiet) {
    process.stdout.write(`${JSON.stringify({
      output: path.relative(ROOT, options.output),
      deterministicReplayMatched,
      targetAcquisitions: primary.coordinationSummary.packCoordination.targetAcquisitions,
      coordinatedPackHunts: primary.coordinationSummary.packCoordination.hunts.coordinatedPackHunts,
      maxFollowers: primary.coordinationSummary.maxFollowers,
    }, null, 2)}\n`);
  }
}

main();
