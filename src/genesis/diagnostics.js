(() => {
  "use strict";

  const SAMPLE_INTERVAL_MS = 1000;
  const MAX_SAMPLES = 2400;
  const MAX_ACTIONS = 800;
  const MAX_ERRORS = 100;
  const MAX_EVENTS = 600;

  const session = {
    reportVersion: "little-god-genesis-traits-diagnostics-v1",
    sessionId: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    startedAt: new Date().toISOString(),
    samples: [],
    actions: [],
    errors: [],
    worldEvents: [],
    seenEvents: new Set(),
    lastSignature: "",
  };

  const plantFlowBridge = {
    seedProduced: 0,
    seedGerminated: 0,
    bridgedSeedDispersals: 0,
    bridgedGerminatedBiomass: 0,
  };

  const numericMetric = (source, key) => Number(source?.[key]) || 0;
  const positiveMetricDelta = (after, before, key) => Math.max(
    0,
    numericMetric(after, key) - numericMetric(before, key),
  );

  function resetPlantFlowBridge() {
    plantFlowBridge.seedProduced = 0;
    plantFlowBridge.seedGerminated = 0;
    plantFlowBridge.bridgedSeedDispersals = 0;
    plantFlowBridge.bridgedGerminatedBiomass = 0;
  }

  function plantFlowDiagnostics() {
    const LG = window.LittleGod;
    return {
      version: "continuous-plant-flow-v1",
      source: "continuous-grid-vegetation-budget",
      seedProduced: numericMetric(LG?.state?.vegetationMetrics, "seedProduced"),
      seedGerminated: numericMetric(LG?.state?.vegetationMetrics, "seedGerminated"),
      germinatedBiomass: numericMetric(LG?.state?.lifetime, "germinatedBiomass"),
      seedDispersals: numericMetric(LG?.state?.lifetime, "seedDispersals"),
      observedDeltas: {
        seedProduced: plantFlowBridge.seedProduced,
        seedGerminated: plantFlowBridge.seedGerminated,
      },
      bridgeAdditions: {
        germinatedBiomass: plantFlowBridge.bridgedGerminatedBiomass,
        seedDispersals: plantFlowBridge.bridgedSeedDispersals,
      },
    };
  }

  function installPlantFlowBridge() {
    const LG = window.LittleGod;
    if (!LG?.state || typeof LG.updateWorld !== "function" || LG.updateWorld.__plantFlowBridge) return;

    const baseUpdateWorld = LG.updateWorld;
    const wrappedUpdateWorld = (dt) => {
      const beforeVegetation = { ...(LG.state.vegetationMetrics || {}) };
      const beforeLifetime = { ...(LG.state.lifetime || {}) };
      const result = baseUpdateWorld(dt);
      const afterVegetation = { ...(LG.state.vegetationMetrics || {}) };
      const afterLifetime = { ...(LG.state.lifetime || {}) };

      const germinated = positiveMetricDelta(afterVegetation, beforeVegetation, "seedGerminated");
      const produced = positiveMetricDelta(afterVegetation, beforeVegetation, "seedProduced");
      const expectedBiomass = germinated * 0.38;
      const alreadyCountedBiomass = positiveMetricDelta(afterLifetime, beforeLifetime, "germinatedBiomass");
      const alreadyCountedDispersals = positiveMetricDelta(afterLifetime, beforeLifetime, "seedDispersals");
      const missingBiomass = Math.max(0, expectedBiomass - alreadyCountedBiomass);
      const missingDispersals = Math.max(0, produced - alreadyCountedDispersals);

      plantFlowBridge.seedGerminated += germinated;
      plantFlowBridge.seedProduced += produced;
      if (missingBiomass > 1e-9 && typeof LG.incrementMetric === "function") {
        LG.incrementMetric("germinatedBiomass", missingBiomass);
        plantFlowBridge.bridgedGerminatedBiomass += missingBiomass;
      }
      if (missingDispersals > 1e-9 && typeof LG.incrementMetric === "function") {
        LG.incrementMetric("seedDispersals", missingDispersals);
        plantFlowBridge.bridgedSeedDispersals += missingDispersals;
      }
      return result;
    };
    wrappedUpdateWorld.__plantFlowBridge = true;
    LG.updateWorld = wrappedUpdateWorld;

    if (typeof LG.seedWorld === "function" && !LG.seedWorld.__plantFlowBridge) {
      const baseSeedWorld = LG.seedWorld;
      const wrappedSeedWorld = (...args) => {
        const result = baseSeedWorld.apply(LG, args);
        resetPlantFlowBridge();
        return result;
      };
      wrappedSeedWorld.__plantFlowBridge = true;
      LG.seedWorld = wrappedSeedWorld;
    }
  }

  installPlantFlowBridge();

  const get = (selector) => document.querySelector(selector);
  const text = (selector, fallback = "") => get(selector)?.textContent?.trim() || fallback;

  function numberFrom(value, fallback = 0) {
    const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : fallback;
  }

  function currentSpeed() {
    return Number(get(".speed-button.is-active")?.dataset.speed || 1);
  }

  function selectedSpecies() {
    return window.LittleGod?.state?.inspectMode
      ? "inspect"
      : get(".species-button.is-active")?.dataset.species || "unknown";
  }

  function fallbackSnapshot() {
    return {
      version: "0.4.0-genesis.1-fallback",
      worldYear: numberFrom(text("#worldAge")),
      season: text("#seasonLabel", "unknown"),
      running: get("#playToggle")?.getAttribute("aria-pressed") === "true",
      speed: currentSpeed(),
      resources: {
        greenBiomass: numberFrom(text("#floraCount")),
        dryBiomass: numberFrom(text("#dryCount")),
        seedBank: numberFrom(text("#seedCount")),
        rootBiomass: numberFrom(text("#hudRoots")),
      },
      populations: {
        grazers: numberFrom(text("#grazerCount")),
        hunters: numberFrom(text("#hunterCount")),
        carcasses: numberFrom(text("#carcassCount")),
      },
      balance: {
        label: text("#balanceLabel"),
        advice: text("#balanceAdvice"),
        score: numberFrom(get("#balanceFill")?.style.width),
      },
    };
  }

  function snapshot() {
    let internal = null;
    try {
      internal = window.LittleGodTelemetry?.getSnapshot?.() || null;
    } catch (error) {
      recordError({ type: "telemetry-read-error", message: error.message, stack: error.stack || null });
    }
    const base = internal || fallbackSnapshot();
    const LG = window.LittleGod;
    if (LG && !base.genesis && LG.populationTraitSummary) {
      const totals = LG.getResourceTotals();
      base.version = "0.4.0-genesis.1";
      base.resources = { ...base.resources, rootBiomass: totals.roots };
      base.genesis = {
        attributeModelVersion: 1,
        inheritedBirths: LG.state.lifetime.inheritedBirths,
        localMateChoices: LG.state.lifetime.localMateChoices,
        selectedIndividualId: LG.state.selectedIndividualId,
        populations: {
          grazers: LG.populationTraitSummary(LG.state.grazers),
          hunters: LG.populationTraitSummary(LG.state.hunters),
        },
      };
    }
    return {
      capturedAt: new Date().toISOString(),
      elapsedRealSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
      selectedSpecies: selectedSpecies(),
      ...base,
      plantFlowDiagnostics: plantFlowDiagnostics(),
    };
  }

  function collectEvents() {
    const items = [...document.querySelectorAll("#eventLog li")].reverse();
    for (const item of items) {
      const event = {
        yearText: item.querySelector("time")?.textContent?.trim() || "",
        message: item.querySelector("span")?.textContent?.trim() || item.textContent.trim(),
      };
      const key = `${event.yearText}|${event.message}`;
      if (session.seenEvents.has(key)) continue;
      session.seenEvents.add(key);
      session.worldEvents.push({ ...event, capturedAt: new Date().toISOString() });
    }
    if (session.worldEvents.length > MAX_EVENTS) {
      session.worldEvents.splice(0, session.worldEvents.length - MAX_EVENTS);
    }
  }

  function signature(value) {
    return JSON.stringify({
      year: Number(value.worldYear || 0).toFixed(3),
      season: value.season,
      running: value.running,
      speed: value.speed,
      resources: value.resources,
      populations: value.populations,
      balance: value.balance?.label,
      inheritedBirths: value.genesis?.inheritedBirths,
      localMateChoices: value.genesis?.localMateChoices,
      plantFlow: value.plantFlowDiagnostics,
    });
  }

  function recordSample(force = false) {
    collectEvents();
    const value = snapshot();
    const currentSignature = signature(value);
    if (!force && currentSignature === session.lastSignature) return;
    session.lastSignature = currentSignature;
    session.samples.push(value);
    if (session.samples.length > MAX_SAMPLES) {
      session.samples.splice(0, session.samples.length - MAX_SAMPLES);
    }
  }

  function recordAction(type, details = {}) {
    const value = snapshot();
    session.actions.push({
      capturedAt: value.capturedAt,
      elapsedRealSeconds: value.elapsedRealSeconds,
      worldYear: value.worldYear,
      type,
      details,
    });
    if (session.actions.length > MAX_ACTIONS) {
      session.actions.splice(0, session.actions.length - MAX_ACTIONS);
    }
    setTimeout(() => recordSample(true), 0);
  }

  function recordError(error) {
    session.errors.push({
      capturedAt: new Date().toISOString(),
      elapsedRealSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
      ...error,
    });
    if (session.errors.length > MAX_ERRORS) session.errors.shift();
  }

  function numericSeries(path) {
    const keys = path.split(".");
    return session.samples
      .map((sample) => keys.reduce((value, key) => value?.[key], sample))
      .filter(Number.isFinite);
  }

  function summarize(path) {
    const values = numericSeries(path);
    if (!values.length) return null;
    return {
      initial: values[0],
      final: values.at(-1),
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    };
  }

  function buildReport(playerNotes) {
    recordSample(true);
    const finalSnapshot = snapshot();
    const baseCompactSummary = finalSnapshot.compactSummary
      || window.LittleGod?.getEcologySupervisionDiagnostics?.()
      || null;
    const compactSummary = baseCompactSummary ? {
      ...baseCompactSummary,
      plantFlowDiagnostics: plantFlowDiagnostics(),
    } : null;
    return {
      reportVersion: session.reportVersion,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      exportedAt: new Date().toISOString(),
      playerNotes: playerNotes || "",
      privacy: "本报告仅在浏览器本地生成，游戏不会自动上传。",
      environment: {
        pageUrl: location.href,
        userAgent: navigator.userAgent,
        language: navigator.language,
        viewport: {
          width: innerWidth,
          height: innerHeight,
          devicePixelRatio,
        },
      },
      summary: {
        realSessionSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
        finalWorldYear: finalSnapshot.worldYear,
        finalSeason: finalSnapshot.season,
        finalEcologyState: finalSnapshot.balance,
        resources: {
          greenBiomass: summarize("resources.greenBiomass"),
          dryBiomass: summarize("resources.dryBiomass"),
          seedBank: summarize("resources.seedBank"),
          rootBiomass: summarize("resources.rootBiomass"),
        },
        populations: {
          grazers: summarize("populations.grazers"),
          hunters: summarize("populations.hunters"),
        },
        genesis: finalSnapshot.genesis || null,
        lifetimeMetrics: finalSnapshot.lifetimeMetrics || null,
        plantFlowDiagnostics: plantFlowDiagnostics(),
        recordedSamples: session.samples.length,
        recordedActions: session.actions.length,
        recordedErrors: session.errors.length,
        recordedWorldEvents: session.worldEvents.length,
      },
      compactSummary,
      finalSnapshot,
      actions: session.actions,
      worldEvents: session.worldEvents,
      errors: session.errors,
      samples: session.samples,
    };
  }

  function downloadReport() {
    const notes = prompt("可选：描述你观察到的属性、遗传、择偶或生态问题。", "");
    const report = buildReport(notes === null ? "" : notes.trim());
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `little-god-genesis-diagnostic-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    const button = get("#exportDiagnosticsButton");
    if (button) {
      const original = button.textContent;
      button.textContent = "诊断已导出";
      button.disabled = true;
      setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
      }, 1600);
    }
  }

  function bindActions() {
    get("#playToggle")?.addEventListener("click", () => {
      const runningBefore = get("#playToggle")?.getAttribute("aria-pressed") === "true";
      recordAction(runningBefore ? "pause-time" : (window.LittleGod?.state?.year > 0 ? "resume-time" : "start-time"), {
        running: !runningBefore,
        speed: currentSpeed(),
      });
    }, true);
    for (const button of document.querySelectorAll(".speed-button")) {
      button.addEventListener("click", () => recordAction("set-speed", { speed: Number(button.dataset.speed) }), true);
    }
    for (const button of document.querySelectorAll(".species-button")) {
      button.addEventListener("click", () => recordAction("select-species", { species: button.dataset.species }), true);
    }
    get("#genesisInspectToggle")?.addEventListener("click", () => recordAction("toggle-inspect-mode"), true);
    get("#worldCanvas")?.addEventListener("pointerdown", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      recordAction(window.LittleGod?.state?.inspectMode ? "inspect-individual" : "place-species", {
        selectedSpecies: selectedSpecies(),
        normalizedX: Number(((event.clientX - rect.left) / rect.width).toFixed(3)),
        normalizedY: Number(((event.clientY - rect.top) / rect.height).toFixed(3)),
      });
    }, true);
    get("#growthRule")?.addEventListener("change", () => recordAction("change-growth-rule", { value: Number(get("#growthRule")?.value) }), true);
    get("#fertilityRule")?.addEventListener("change", () => recordAction("change-fertility-rule", { value: Number(get("#fertilityRule")?.value) }), true);
    get("#seasonsRule")?.addEventListener("change", () => recordAction("toggle-seasons", { enabled: Boolean(get("#seasonsRule")?.checked) }), true);
    get("#resetButton")?.addEventListener("click", () => recordAction("reset-world"), true);
    get("#clearButton")?.addEventListener("click", () => recordAction("clear-life"), true);
    get("#exportDiagnosticsButton")?.addEventListener("click", downloadReport);
  }

  window.addEventListener("error", (event) => recordError({
    type: "window-error",
    message: event.message || "Unknown error",
    source: event.filename || null,
    line: event.lineno || null,
    column: event.colno || null,
    stack: event.error?.stack || null,
  }));
  window.addEventListener("unhandledrejection", (event) => recordError({
    type: "unhandled-promise-rejection",
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack || null,
  }));

  window.LittleGodDiagnostics = Object.freeze({
    buildReport,
    snapshot,
    recordSample,
    plantFlowDiagnostics,
  });

  bindActions();
  recordSample(true);
  setInterval(() => recordSample(false), SAMPLE_INTERVAL_MS);
})();
