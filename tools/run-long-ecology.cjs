#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_YEARS = 60;
const DEFAULT_SEEDS_PER_SCENARIO = 2;
const DEFAULT_STEP_YEARS = 0.001875;

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
];

const POST_DIAGNOSTIC_PATHS = [
  "src/genesis/group-quality-v1.js",
  "src/genesis/experiment-provenance-v1.js",
];

const SCENARIOS = Object.freeze({
  default: Object.freeze({
    label: "默认世界",
    description: "使用种子生成的默认世界，不进行任何玩家干预。",
    interventions: Object.freeze([]),
  }),
  "light-intervention": Object.freeze({
    label: "轻度干预",
    description: "运行后在第10年补充一处草地、第12年投放3只食草兽、第24年投放1只猎食兽。",
    interventions: Object.freeze([
      Object.freeze({ year: 10, kind: "flora", x: 1024, y: 640, count: 1 }),
      Object.freeze({ year: 12, kind: "grazer", x: 960, y: 640, count: 3 }),
      Object.freeze({ year: 24, kind: "hunter", x: 1100, y: 640, count: 1 }),
    ]),
  }),
  stress: Object.freeze({
    label: "压力场景",
    description: "时间开始前固定补充24处草地、12只食草兽和6只猎食兽，验证高密度投放后的长期结果。",
    interventions: Object.freeze([
      ...Array.from({ length: 24 }, (_, index) => Object.freeze({
        year: 0,
        phase: "preStart",
        kind: "flora",
        x: 180 + (index % 6) * 330,
        y: 150 + Math.floor(index / 6) * 300,
        count: 1,
      })),
      ...Array.from({ length: 4 }, (_, index) => Object.freeze({
        year: 0,
        phase: "preStart",
        kind: "grazer",
        x: 430 + (index % 2) * 900,
        y: 330 + Math.floor(index / 2) * 520,
        count: 3,
      })),
      ...Array.from({ length: 6 }, (_, index) => Object.freeze({
        year: 0,
        phase: "preStart",
        kind: "hunter",
        x: 690 + (index % 3) * 330,
        y: 430 + Math.floor(index / 3) * 360,
        count: 1,
      })),
    ]),
  }),
});

function parseArgs(argv) {
  const options = {
    years: DEFAULT_YEARS,
    seedsPerScenario: DEFAULT_SEEDS_PER_SCENARIO,
    stepYears: DEFAULT_STEP_YEARS,
    outputDir: path.join(ROOT, "artifacts", "round51"),
    quiet: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (argument === "--years") {
      options.years = Number(next);
      index += 1;
    } else if (argument === "--seeds-per-scenario") {
      options.seedsPerScenario = Number(next);
      index += 1;
    } else if (argument === "--step-years") {
      options.stepYears = Number(next);
      index += 1;
    } else if (argument === "--output-dir") {
      options.outputDir = path.resolve(ROOT, next);
      index += 1;
    } else if (argument === "--quiet") {
      options.quiet = true;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!Number.isFinite(options.years) || options.years <= 0) throw new Error("--years must be positive");
  if (!Number.isInteger(options.seedsPerScenario) || options.seedsPerScenario <= 0) {
    throw new Error("--seeds-per-scenario must be a positive integer");
  }
  if (!Number.isFinite(options.stepYears) || options.stepYears <= 0) throw new Error("--step-years must be positive");
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
    dataset: { build: "v0.6.6" },
    textContent: "v0.6.6",
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

function createContext(seed, includePostDiagnostics) {
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
    navigator: { language: "zh-CN", userAgent: "round51-node", clipboard: null },
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

  const paths = includePostDiagnostics
    ? [...SCRIPT_PATHS, ...POST_DIAGNOSTIC_PATHS]
    : SCRIPT_PATHS;
  for (const relativePath of paths) {
    const filename = path.join(ROOT, relativePath);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: relativePath });
  }
  return context;
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

function stateSnapshot(LG) {
  return {
    year: LG.state.year,
    populations: {
      grazers: LG.state.grazers.length,
      hunters: LG.state.hunters.length,
      carcasses: LG.state.carcasses.length,
    },
    resources: resourceSnapshot(LG),
    rules: { ...LG.state.rules },
  };
}

function placeIntervention(LG, intervention) {
  let created = 0;
  if (intervention.kind === "flora") {
    if (LG.seedPatchAt(intervention.x, intervention.y)) created = 1;
  } else {
    for (let index = 0; index < intervention.count; index += 1) {
      if (LG.createAnimal(intervention.kind, intervention.x, intervention.y, {
        spread: 34,
        playerIntervention: true,
      })) created += 1;
    }
    if (created) {
      LG.state.lastAnimalPlacementYear = LG.state.year;
      LG.state.coexistenceYears = 0;
      LG.state.minimumDuringAttempt = {
        grazers: LG.state.grazers.length,
        hunters: LG.state.hunters.length,
      };
    }
  }
  return { ...intervention, created, appliedYear: LG.state.year };
}

function lifetimeSnapshot(LG) {
  return { ...(LG.state.lifetime || {}) };
}

function lifetimeDelta(after, before) {
  const result = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "year") continue;
    result[key] = (Number(after[key]) || 0) - (Number(before[key]) || 0);
  }
  return result;
}

function recordYear(LG, year, previousLifetime) {
  const lifetime = lifetimeSnapshot(LG);
  return {
    record: {
      year,
      grazers: LG.state.grazers.length,
      hunters: LG.state.hunters.length,
      ...resourceSnapshot(LG),
      events: lifetimeDelta(lifetime, previousLifetime),
    },
    lifetime,
  };
}

function round(value, digits = 8) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return Number.isFinite(value) ? round(value) : value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
}

function runSingle({ scenarioName, scenario, seed, years, stepYears, phase }) {
  const post = phase === "post";
  const context = createContext(seed, post);
  const LG = context.LittleGod;
  LG.setExperimentSeed(seed, { source: "round51-long-run", resetWorld: true });
  LG.state.running = true;

  const defaultInitialState = stateSnapshot(LG);
  const appliedInterventions = [];
  const scheduled = scenario.interventions.map((entry, index) => ({ ...entry, index, applied: false }));
  for (const intervention of scheduled.filter((entry) => entry.phase === "preStart")) {
    appliedInterventions.push(placeIntervention(LG, intervention));
    intervention.applied = true;
  }
  const populationAtFirstStart = stateSnapshot(LG);

  const timeline = [];
  let previousLifetime = lifetimeSnapshot(LG);
  let recordedYear = 0;
  let first = recordYear(LG, 0, previousLifetime);
  timeline.push(first.record);
  previousLifetime = first.lifetime;

  while (LG.state.year < years - 1e-12) {
    for (const intervention of scheduled) {
      if (intervention.applied || intervention.phase === "preStart") continue;
      if (LG.state.year + 1e-12 >= intervention.year) {
        appliedInterventions.push(placeIntervention(LG, intervention));
        intervention.applied = true;
      }
    }
    const dt = Math.min(stepYears, years - LG.state.year);
    LG.updateWorld(dt);
    const currentYear = Math.floor(LG.state.year + 1e-9);
    while (recordedYear < currentYear && recordedYear < Math.floor(years)) {
      recordedYear += 1;
      const next = recordYear(LG, recordedYear, previousLifetime);
      timeline.push(next.record);
      previousLifetime = next.lifetime;
    }
  }

  if (timeline.at(-1)?.year !== years) {
    const finalRecord = recordYear(LG, years, previousLifetime);
    timeline.push(finalRecord.record);
  }

  const compact = LG.getEcologySupervisionDiagnostics?.() || null;
  const provenance = LG.getExperimentProvenanceDiagnostics?.() || null;
  const groupQuality = LG.getGroupQualityDiagnostics?.() || null;
  const legacyGroups = !post && typeof LG.getGroupBehaviorDiagnostics === "function"
    ? LG.getGroupBehaviorDiagnostics()
    : null;
  const finalState = stateSnapshot(LG);
  const lifetime = lifetimeSnapshot(LG);
  return {
    scenario: scenarioName,
    scenarioLabel: scenario.label,
    seed,
    phase,
    years,
    stepYears,
    deterministic: LG.getExperimentDiagnostics?.().deterministic === true,
    initialConditions: provenance ? {
      defaultInitialState: provenance.defaultInitialState,
      populationAtFirstStart: provenance.populationAtFirstStart,
      preStartInterventions: provenance.preStartInterventions,
      postStartInterventions: provenance.postStartInterventions,
    } : {
      defaultInitialState,
      populationAtFirstStart,
      preStartInterventions: {
        count: appliedInterventions.filter((entry) => entry.phase === "preStart").length,
      },
      postStartInterventions: {
        count: appliedInterventions.filter((entry) => entry.phase !== "preStart").length,
      },
    },
    appliedInterventions,
    yearlyTimeline: timeline,
    final: {
      ...finalState,
      presence: LG.getPresence(),
      balance: LG.calculateBalance(),
      lifetime,
      ageStructure: {
        grazers: LG.getAgeStructure(LG.state.grazers),
        hunters: LG.getAgeStructure(LG.state.hunters),
      },
    },
    milestones: compact?.milestones || null,
    reproductionDiagnostics: compact?.reproductionDiagnostics || null,
    springDiagnostics: compact?.springDiagnostics || null,
    springConsistency: compact?.springConsistency || null,
    groupQuality,
    legacyGroupSnapshot: legacyGroups ? {
      grazerHerds: legacyGroups.grazerHerds,
      hunterPacks: legacyGroups.hunterPacks,
      groupedAnimals: legacyGroups.groupedAnimals,
      largestGroup: legacyGroups.largestGroup,
      averageGroupSize: legacyGroups.averageGroupSize,
      note: "Pre-Round-51 diagnostics rebuilt groups but did not preserve observation identities or classify hunt outcomes.",
    } : null,
  };
}

function seedsFor(scenarioName, count) {
  return Array.from({ length: count }, (_, index) => (
    `round51-${scenarioName}-${String(index + 1).padStart(2, "0")}`
  ));
}

function runPhase(options, phase) {
  const runs = [];
  for (const [scenarioName, scenario] of Object.entries(SCENARIOS)) {
    for (const seed of seedsFor(scenarioName, options.seedsPerScenario)) {
      if (!options.quiet) process.stdout.write(`[${phase}] ${scenarioName} ${seed}\n`);
      runs.push(runSingle({
        scenarioName,
        scenario,
        seed,
        years: options.years,
        stepYears: options.stepYears,
        phase,
      }));
    }
  }
  return runs;
}

function aggregateScenario(runs) {
  const count = runs.length;
  const alive = (predicate) => runs.filter(predicate).length;
  const sumLifetime = (key) => runs.reduce((sum, run) => sum + (Number(run.final.lifetime[key]) || 0), 0);
  const extinctHunters = runs.filter((run) => run.final.populations.hunters === 0);
  const pack = runs.reduce((totals, run) => {
    const hunts = run.groupQuality?.hunts;
    if (!hunts) return totals;
    totals.packAttempts += hunts.packHunts || 0;
    totals.packSuccesses += hunts.packHuntSuccesses || 0;
    totals.soloAttempts += hunts.soloHunts || 0;
    totals.soloSuccesses += hunts.soloHuntSuccesses || 0;
    totals.unknown += hunts.unknownHunts || 0;
    return totals;
  }, { packAttempts: 0, packSuccesses: 0, soloAttempts: 0, soloSuccesses: 0, unknown: 0 });

  return {
    runs: count,
    survivalAtFinalYear: {
      flora: count ? alive((run) => run.final.presence.flora) / count : null,
      grazers: count ? alive((run) => run.final.populations.grazers > 0) / count : null,
      hunters: count ? alive((run) => run.final.populations.hunters > 0) / count : null,
    },
    hunterExtinctionRuns: extinctHunters.length,
    hunterDeathTotals: {
      starvation: sumLifetime("hunterStarvationDeaths"),
      oldAge: sumLifetime("hunterOldAgeDeaths"),
    },
    reproductionTotals: {
      grazerBirths: sumLifetime("grazerBirths"),
      hunterBirths: sumLifetime("hunterBirths"),
      inheritedBirths: sumLifetime("inheritedBirths"),
    },
    huntComparison: {
      packHunts: pack.packAttempts,
      packHuntSuccesses: pack.packSuccesses,
      packHuntSuccessRate: pack.packAttempts ? pack.packSuccesses / pack.packAttempts : null,
      soloHunts: pack.soloAttempts,
      soloHuntSuccesses: pack.soloSuccesses,
      soloHuntSuccessRate: pack.soloAttempts ? pack.soloSuccesses / pack.soloAttempts : null,
      unknownHunts: pack.unknown,
    },
  };
}

function aggregate(runs) {
  const scenarios = {};
  for (const scenarioName of Object.keys(SCENARIOS)) {
    scenarios[scenarioName] = aggregateScenario(runs.filter((run) => run.scenario === scenarioName));
  }
  return { scenarios };
}

function behaviorSignature(run) {
  return stableObject({
    scenario: run.scenario,
    seed: run.seed,
    yearlyTimeline: run.yearlyTimeline,
    final: {
      populations: run.final.populations,
      resources: run.final.resources,
      presence: run.final.presence,
      lifetime: run.final.lifetime,
      balance: run.final.balance,
    },
  });
}

function comparePhases(baselineRuns, postRuns) {
  const postByKey = new Map(postRuns.map((run) => [`${run.scenario}|${run.seed}`, run]));
  const mismatches = [];
  for (const baseline of baselineRuns) {
    const key = `${baseline.scenario}|${baseline.seed}`;
    const post = postByKey.get(key);
    if (!post || JSON.stringify(behaviorSignature(baseline)) !== JSON.stringify(behaviorSignature(post))) {
      mismatches.push(key);
    }
  }
  return {
    sameSeedsAndScenarios: baselineRuns.length === postRuns.length && mismatches.length === 0,
    ecologyBehaviorUnchanged: mismatches.length === 0,
    mismatches,
    expectedDiagnosticChanges: [
      "springDiagnostics.seedGerminated now records the supplemental continuous-grid germination observed by the global budget",
      "initial conditions distinguish generated defaults, first start, and pre/post-start interventions",
      "group identities, turnover, distances, split/merge events, and pack/solo hunt outcomes are observation-tracked",
    ],
  };
}

function gitSha() {
  try {
    return process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function reportDocument(options, phase, runs) {
  const command = `node tools/run-long-ecology.cjs --years ${options.years} --seeds-per-scenario ${options.seedsPerScenario} --step-years ${options.stepYears} --output-dir ${path.relative(ROOT, options.outputDir)}`;
  return {
    schemaVersion: "round51-long-run-v1",
    phase,
    generatedAt: new Date().toISOString(),
    commit: gitSha(),
    metadata: {
      yearsPerRun: options.years,
      seedsPerScenario: options.seedsPerScenario,
      stepYears: options.stepYears,
      stepBasis: "controlled headless step equal to the in-game 12x four-substep update (0.001875 years by default)",
      scenarios: Object.fromEntries(Object.entries(SCENARIOS).map(([key, value]) => [key, {
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
    aggregate: aggregate(runs),
    runs,
  };
}

function percent(value) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function topHunterFailure(postRuns) {
  const totals = {};
  for (const run of postRuns) {
    const failures = run.reproductionDiagnostics?.hunter?.failureReasons || {};
    for (const [key, value] of Object.entries(failures)) totals[key] = (totals[key] || 0) + (Number(value) || 0);
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || ["no-data", 0];
}

function combinedGroupSummary(postRuns, type) {
  const rows = postRuns.map((run) => run.groupQuality?.[type]).filter(Boolean);
  const sum = (key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const max = (key) => rows.reduce((value, row) => Math.max(value, Number(row[key]) || 0), 0);
  return {
    observedGroupTracks: sum("observedGroupTracks"),
    stableGroupCount: sum("stableGroupCount"),
    splitCount: sum("splitCount"),
    mergeCount: sum("mergeCount"),
    maximumMemberDistance: max("maximumMemberDistance"),
    turnoverValues: rows.map((row) => row.membershipTurnover).filter(Number.isFinite),
  };
}

function generateFindings(options, baselineDoc, postDoc, comparison) {
  const defaultPost = postDoc.aggregate.scenarios.default;
  const allPostRuns = postDoc.runs;
  const deathTotals = Object.values(postDoc.aggregate.scenarios).reduce((totals, scenario) => {
    totals.starvation += scenario.hunterDeathTotals.starvation;
    totals.oldAge += scenario.hunterDeathTotals.oldAge;
    totals.extinctions += scenario.hunterExtinctionRuns;
    return totals;
  }, { starvation: 0, oldAge: 0, extinctions: 0 });
  const [failureName, failureCount] = topHunterFailure(allPostRuns);
  const grazerGroups = combinedGroupSummary(allPostRuns, "grazer");
  const hunterGroups = combinedGroupSummary(allPostRuns, "hunter");
  const hunts = Object.values(postDoc.aggregate.scenarios).reduce((totals, scenario) => {
    const row = scenario.huntComparison;
    totals.packAttempts += row.packHunts;
    totals.packSuccesses += row.packHuntSuccesses;
    totals.soloAttempts += row.soloHunts;
    totals.soloSuccesses += row.soloHuntSuccesses;
    totals.unknown += row.unknownHunts;
    return totals;
  }, { packAttempts: 0, packSuccesses: 0, soloAttempts: 0, soloSuccesses: 0, unknown: 0 });
  const packRate = hunts.packAttempts ? hunts.packSuccesses / hunts.packAttempts : null;
  const soloRate = hunts.soloAttempts ? hunts.soloSuccesses / hunts.soloAttempts : null;
  const enoughHuntSamples = hunts.packAttempts >= 30 && hunts.soloAttempts >= 30;
  const springBaseline = baselineDoc.runs.reduce((sum, run) => sum + (run.springDiagnostics || [])
    .reduce((entrySum, entry) => entrySum + (Number(entry.seedGerminated) || 0), 0), 0);
  const springPost = postDoc.runs.reduce((sum, run) => sum + (run.springDiagnostics || [])
    .reduce((entrySum, entry) => entrySum + (Number(entry.seedGerminated) || 0), 0), 0);

  return `# Round 51 — 长期沙盒验证与群体行为质量基线

## 运行定义

- 每个场景运行 **${options.years} 年**；每个场景使用 **${options.seedsPerScenario} 个固定种子**。
- 受控步长为 **${options.stepYears} 年**，对应游戏 12× 模式的四子步更新尺度。
- 基线与复跑使用完全相同的场景、种子、干预和步长。
- 复现命令：

\`\`\`bash
${postDoc.metadata.reproduceCommand}
\`\`\`

| 场景 | 定义 | 种子 |
|---|---|---|
${Object.entries(postDoc.metadata.scenarios).map(([name, scenario]) => `| ${name} | ${scenario.description} | ${scenario.seeds.join(", ")} |`).join("\n")}

## 基线与复跑

- 生态行为逐年签名一致：**${comparison.ecologyBehaviorUnchanged ? "是" : "否"}**。
- 不一致键：${comparison.mismatches.length ? comparison.mismatches.join(", ") : "无"}。
- 修改前观察器记录的春季发芽总量：${springBaseline.toFixed(3)}。
- 修复后 springDiagnostics 记录的发芽总量：${springPost.toFixed(3)}。
- 预期变化只来自诊断采样与语义修复；生态状态、出生、死亡、捕食和资源时间线不得变化。

## 1. 默认场景第 ${options.years} 年存活比例

| 层级 | 存活比例 |
|---|---:|
| 植物储备 | ${percent(defaultPost.survivalAtFinalYear.flora)} |
| 食草兽 | ${percent(defaultPost.survivalAtFinalYear.grazers)} |
| 猎食兽 | ${percent(defaultPost.survivalAtFinalYear.hunters)} |

样本仅有 ${defaultPost.runs} 个固定种子，因此该比例是回归基线，不是统计学上的生态稳定率估计。

## 2. 捕食层灭绝的主要原因

- 三个场景合计出现 ${deathTotals.extinctions} 次猎食兽灭绝。
- 猎食兽死亡累计：老死 ${deathTotals.oldAge}，饥饿 ${deathTotals.starvation}。
- 繁殖诊断中累计最高的失败原因是 \`${failureName}\`（${failureCount} 次评估）。
- 判读：${deathTotals.oldAge > deathTotals.starvation ? "老死数量高于饥饿，说明年龄结构与持续补员不足比直接饥饿更突出。" : "饥饿不低于老死，食物承载仍是主要压力。"} 失败原因是逐更新评估次数，不能直接等同于独立个体数量。

## 3. 当前群体是否稳定

| 物种 | 观察轨迹 | 稳定群 | 分裂 | 合并 | 最大成员—中心距离 |
|---|---:|---:|---:|---:|---:|
| 食草兽 | ${grazerGroups.observedGroupTracks} | ${grazerGroups.stableGroupCount} | ${grazerGroups.splitCount} | ${grazerGroups.mergeCount} | ${grazerGroups.maximumMemberDistance.toFixed(1)} |
| 猎食兽 | ${hunterGroups.observedGroupTracks} | ${hunterGroups.stableGroupCount} | ${hunterGroups.splitCount} | ${hunterGroups.mergeCount} | ${hunterGroups.maximumMemberDistance.toFixed(1)} |

稳定群判据：观察寿命至少 0.5 年，且相邻采样成员集合平均 Jaccard 不低于 0.6。观察身份通过相邻采样最大成员重叠追踪，并不改变现有群体决策。链式连通分量频繁拆分/合并时，身份只能近似延续，因此不能把观察轨迹当成真正的固定兽群实体。

## 4. 猎群是否提高捕猎成功率

- 猎群捕猎：${hunts.packSuccesses} / ${hunts.packAttempts}，成功率 ${percent(packRate)}。
- 独行捕猎：${hunts.soloSuccesses} / ${hunts.soloAttempts}，成功率 ${percent(soloRate)}。
- 未能定位执行者的捕猎：${hunts.unknown}。
- 结论：${enoughHuntSamples ? "两类样本均达到30次，可作为方向性观察；但分组不是随机实验，群体成员属性、猎物状态与空间条件不同，不能据此断言因果增益。" : "至少一类样本少于30次，证据不足，不能断言猎群提高捕猎效率。"}

## 5. 下一轮唯一推荐行为改动

**把距离连通分量改为“有成员上限、以稳定中心或首领为加入基准、带退出滞后的持久群体身份”。**

下一轮只实施这一项，不同时加入共同移动、围猎或新数值加成；先消除链式巨群和每帧重建，随后再用本轮指标验证群体寿命、成员周转与空间尺度是否改善。

## 已知限制

- 本轮只测量，不改变群体决策、捕猎概率或生态参数。
- 每场景 ${options.seedsPerScenario} 个种子只能形成回归基线；扩大统计置信度需要更多种子。
- 群体身份是观察层的重叠匹配，不是游戏内真实持久 ID。
- pack/solo 成功率是观察相关性，不控制个体属性、猎物体力、地形和猎物密度。
- 头less运行不渲染画布；浏览器视觉、相机和交互仍由现有浏览器回归单独验证。
`;
}

function writeResults(options, baselineDoc, postDoc, comparison) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const baselinePath = path.join(options.outputDir, "baseline.json");
  const postPath = path.join(options.outputDir, "post.json");
  const comparisonPath = path.join(options.outputDir, "comparison.json");
  const findingsPath = path.join(ROOT, "LONG_RUN_FINDINGS.md");
  fs.writeFileSync(baselinePath, `${JSON.stringify(baselineDoc, null, 2)}\n`);
  fs.writeFileSync(postPath, `${JSON.stringify(postDoc, null, 2)}\n`);
  fs.writeFileSync(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`);
  fs.writeFileSync(findingsPath, generateFindings(options, baselineDoc, postDoc, comparison));
  return { baselinePath, postPath, comparisonPath, findingsPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: node tools/run-long-ecology.cjs [--years 60] [--seeds-per-scenario 2] [--step-years 0.001875] [--output-dir artifacts/round51]\n");
    return;
  }
  const baselineRuns = runPhase(options, "baseline");
  const postRuns = runPhase(options, "post");
  const baselineDoc = reportDocument(options, "baseline", baselineRuns);
  const postDoc = reportDocument(options, "post", postRuns);
  const comparison = comparePhases(baselineRuns, postRuns);
  if (!comparison.ecologyBehaviorUnchanged) {
    throw new Error(`Round 51 diagnostics changed ecological behavior: ${comparison.mismatches.join(", ")}`);
  }
  const paths = writeResults(options, baselineDoc, postDoc, comparison);
  if (!options.quiet) {
    process.stdout.write(`Long-run baseline: ${path.relative(ROOT, paths.baselinePath)}\n`);
    process.stdout.write(`Long-run post: ${path.relative(ROOT, paths.postPath)}\n`);
    process.stdout.write(`Findings: ${path.relative(ROOT, paths.findingsPath)}\n`);
  }
}

if (require.main === module) main();

module.exports = {
  SCENARIOS,
  parseArgs,
  runSingle,
  runPhase,
  aggregate,
  comparePhases,
  generateFindings,
};
