(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Experiment provenance requires LittleGod core");
  if (typeof LG.updateWorld !== "function" || typeof LG.seedWorld !== "function") {
    throw new Error("Experiment provenance requires simulation.js");
  }

  const MAX_SPRING_HISTORY = 120;
  let seedingDepth = 0;
  let started = false;
  let defaultInitialState = null;
  let populationAtFirstStart = null;
  let preStartInterventions = [];
  let postStartInterventions = [];
  let springHistory = [];
  let activeSpring = null;

  const number = (value) => Number(value) || 0;
  const positiveDelta = (after, before, key) => Math.max(
    0,
    number(after?.[key]) - number(before?.[key]),
  );

  function resourceSnapshot() {
    const totals = LG.getResourceTotals?.() || {};
    return {
      green: number(totals.green),
      dry: number(totals.dry),
      seeds: number(totals.seeds),
      roots: number(totals.roots),
    };
  }

  function stateSnapshot() {
    return {
      year: number(LG.state.year),
      populations: {
        grazers: LG.state.grazers?.length || 0,
        hunters: LG.state.hunters?.length || 0,
        carcasses: LG.state.carcasses?.length || 0,
      },
      resources: resourceSnapshot(),
      rules: { ...(LG.state.rules || {}) },
    };
  }

  function compactInterventions(records) {
    const byKind = {};
    const bySpecies = {};
    let animalsAdded = 0;
    let floraPlacements = 0;
    for (const record of records) {
      byKind[record.kind] = (byKind[record.kind] || 0) + 1;
      if (record.species) bySpecies[record.species] = (bySpecies[record.species] || 0) + 1;
      animalsAdded += record.kind === "animal-placement" ? record.count : 0;
      floraPlacements += record.kind === "flora-placement" ? 1 : 0;
    }
    return {
      count: records.length,
      byKind,
      bySpecies,
      animalsAdded,
      floraPlacements,
      firstYear: records.length ? records[0].year : null,
      lastYear: records.length ? records.at(-1).year : null,
    };
  }

  function recordIntervention(record) {
    if (seedingDepth > 0) return;
    const normalized = {
      year: number(LG.state.year),
      kind: record.kind,
      species: record.species || null,
      count: Math.max(0, Number(record.count) || 0),
    };
    (started ? postStartInterventions : preStartInterventions).push(normalized);
  }

  function beginSpring(startResources) {
    activeSpring = {
      year: Math.floor(number(LG.state.year)),
      startGreen: startResources.green,
      endGreen: startResources.green,
      greenGain: 0,
      netGreenGain: 0,
      rootRecovery: 0,
      seedGerminated: 0,
      triggeredSpringRecovery: false,
    };
  }

  function springRecovered(entry) {
    return entry.greenGain >= 18 || entry.rootRecovery >= 9 || entry.seedGerminated >= 0.8;
  }

  function finishSpring(endResources = null) {
    if (!activeSpring) return;
    if (endResources) activeSpring.endGreen = endResources.green;
    activeSpring.netGreenGain = activeSpring.endGreen - activeSpring.startGreen;
    activeSpring.triggeredSpringRecovery = springRecovered(activeSpring);
    springHistory.push({ ...activeSpring });
    if (springHistory.length > MAX_SPRING_HISTORY) springHistory.shift();
    activeSpring = null;
  }

  function updateCorrectedSpring({
    beforeSeason,
    afterSeason,
    beforeResources,
    afterResources,
    beforeMetrics,
    afterMetrics,
  }) {
    if (beforeSeason === "spring" && afterSeason !== "spring") {
      finishSpring(beforeResources);
    }
    if (afterSeason === "spring" && !activeSpring) beginSpring(beforeResources);
    if (afterSeason !== "spring" || !activeSpring) return;

    activeSpring.endGreen = afterResources.green;
    activeSpring.greenGain += Math.max(0, afterResources.green - beforeResources.green);
    activeSpring.rootRecovery += positiveDelta(afterMetrics, beforeMetrics, "rootGained");
    activeSpring.seedGerminated += positiveDelta(afterMetrics, beforeMetrics, "seedGerminated");
    activeSpring.netGreenGain = activeSpring.endGreen - activeSpring.startGreen;
    activeSpring.triggeredSpringRecovery = springRecovered(activeSpring);
  }

  function reset() {
    started = false;
    defaultInitialState = null;
    populationAtFirstStart = null;
    preStartInterventions = [];
    postStartInterventions = [];
    springHistory = [];
    activeSpring = null;
  }

  const baseCreateAnimal = LG.createAnimal;
  LG.createAnimal = (type, x, y, options = {}) => {
    const animal = baseCreateAnimal(type, x, y, options);
    const explicitPlayerPlacement = options.playerIntervention === true
      || (options.spread === 34 && !Array.isArray(options.parents));
    if (animal && explicitPlayerPlacement) {
      recordIntervention({ kind: "animal-placement", species: type, count: 1 });
    }
    return animal;
  };

  const baseSeedPatchAt = LG.seedPatchAt;
  LG.seedPatchAt = (x, y, ...args) => {
    const patch = baseSeedPatchAt(x, y, ...args);
    if (patch && seedingDepth === 0) {
      recordIntervention({ kind: "flora-placement", species: "flora", count: 1 });
    }
    return patch;
  };

  const baseSeedWorld = LG.seedWorld;
  LG.seedWorld = (...args) => {
    reset();
    seedingDepth += 1;
    try {
      const result = baseSeedWorld.apply(LG, args);
      defaultInitialState = stateSnapshot();
      return result;
    } finally {
      seedingDepth -= 1;
    }
  };

  LG.markExperimentStart = () => {
    if (started) return populationAtFirstStart;
    started = true;
    populationAtFirstStart = stateSnapshot();
    return populationAtFirstStart;
  };

  const baseUpdateWorld = LG.updateWorld;
  LG.updateWorld = (dt) => {
    if (!started) LG.markExperimentStart();
    const beforeSeason = LG.state.season;
    const beforeResources = resourceSnapshot();
    const beforeMetrics = { ...(LG.state.vegetationMetrics || {}) };
    const result = baseUpdateWorld(dt);
    updateCorrectedSpring({
      beforeSeason,
      afterSeason: LG.state.season,
      beforeResources,
      afterResources: resourceSnapshot(),
      beforeMetrics,
      afterMetrics: { ...(LG.state.vegetationMetrics || {}) },
    });
    return result;
  };

  function diagnostics() {
    const corrected = [
      ...springHistory.map((entry) => ({ ...entry })),
      ...(activeSpring ? [{ ...activeSpring }] : []),
    ];
    const measuredSpringGermination = corrected.reduce(
      (sum, entry) => sum + number(entry.seedGerminated),
      0,
    );
    const globalSeedGerminated = number(LG.state.vegetationMetrics?.seedGerminated);
    return {
      version: "experiment-provenance-v1",
      defaultInitialState: defaultInitialState ? structuredClone(defaultInitialState) : null,
      populationAtFirstStart: populationAtFirstStart ? structuredClone(populationAtFirstStart) : null,
      preStartInterventions: compactInterventions(preStartInterventions),
      postStartInterventions: compactInterventions(postStartInterventions),
      springDiagnostics: corrected,
      springConsistency: {
        measuredSpringGermination,
        globalSeedGerminated,
        difference: globalSeedGerminated - measuredSpringGermination,
      },
    };
  }

  const baseCompactSummary = LG.getEcologySupervisionDiagnostics;
  if (typeof baseCompactSummary === "function") {
    LG.getEcologySupervisionDiagnostics = () => {
      const summary = baseCompactSummary();
      const provenance = diagnostics();
      return {
        ...summary,
        initialConditions: {
          defaultInitialState: provenance.defaultInitialState,
          populationAtFirstStart: provenance.populationAtFirstStart,
          preStartInterventions: provenance.preStartInterventions,
          postStartInterventions: provenance.postStartInterventions,
        },
        springDiagnostics: provenance.springDiagnostics,
        springConsistency: provenance.springConsistency,
      };
    };
  }

  LG.getExperimentProvenanceDiagnostics = diagnostics;
  LG.experimentProvenanceModel = Object.freeze({
    version: "experiment-provenance-v1",
    distinguishesDefaultAndFirstStart: true,
    distinguishesPreAndPostStartInterventions: true,
    correctedSpringSampling: true,
    changesSimulationRules: false,
  });

  reset();

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__provenanceWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({
        ...baseSnapshot(),
        experimentProvenance: diagnostics(),
        compactSummary: LG.getEcologySupervisionDiagnostics?.() || null,
      });
      wrapped.__provenanceWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
