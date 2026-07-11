(() => {
  "use strict";

  const SAMPLE_INTERVAL_MS = 1000;
  const MAX_SAMPLES = 2400;
  const MAX_ACTIONS = 800;
  const MAX_ERRORS = 100;
  const MAX_WORLD_EVENTS = 500;

  const session = {
    reportVersion: "little-god-trophic-loop-diagnostics-v3",
    sessionId: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    startedAt: new Date().toISOString(),
    samples: [], actions: [], errors: [], worldEvents: [],
    seenWorldEvents: new Set(), lastSampleSignature: "",
  };

  const getElement = (selector) => document.querySelector(selector);
  const textOf = (selector, fallback = "") => getElement(selector)?.textContent?.trim() || fallback;

  function numberFromText(value, fallback = 0) {
    const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : fallback;
  }

  function currentSpeed() {
    const active = getElement(".speed-button.is-active");
    return active ? numberFromText(active.dataset.speed || active.textContent, 1) : 1;
  }

  function selectedSpecies() {
    return getElement(".species-button.is-active")?.dataset.species || "unknown";
  }

  function readRecentEvents() {
    return [...document.querySelectorAll("#eventLog li")].map((item) => ({
      year: numberFromText(item.querySelector("time")?.textContent, null),
      message: item.querySelector("span")?.textContent?.trim() || item.textContent.trim(),
    }));
  }

  function collectNewWorldEvents() {
    for (const event of readRecentEvents().reverse()) {
      const key = `${event.year}|${event.message}`;
      if (session.seenWorldEvents.has(key)) continue;
      session.seenWorldEvents.add(key);
      session.worldEvents.push({ ...event, capturedAt: new Date().toISOString() });
    }
    if (session.worldEvents.length > MAX_WORLD_EVENTS) session.worldEvents.splice(0, session.worldEvents.length - MAX_WORLD_EVENTS);
  }

  function recordError(error) {
    session.errors.push({
      capturedAt: new Date().toISOString(),
      elapsedRealSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
      ...error,
    });
    if (session.errors.length > MAX_ERRORS) session.errors.splice(0, session.errors.length - MAX_ERRORS);
  }

  function getInternalSnapshot() {
    try {
      return window.LittleGodTelemetry?.getSnapshot?.() || null;
    } catch (error) {
      recordError({ type: "telemetry-read-error", message: error?.message || String(error), stack: error?.stack || null });
      return null;
    }
  }

  function getFallbackSnapshot() {
    return {
      version: "fallback",
      worldYear: numberFromText(textOf("#worldAge")),
      season: textOf("#seasonLabel", "unknown"),
      running: getElement("#playToggle")?.getAttribute("aria-pressed") === "true",
      speed: currentSpeed(),
      rules: {
        growth: numberFromText(getElement("#growthRule")?.value, 1),
        fertility: numberFromText(getElement("#fertilityRule")?.value, 1),
        fullSeasons: Boolean(getElement("#seasonsRule")?.checked),
      },
      resources: {
        greenBiomass: numberFromText(textOf("#floraCount")),
        dryBiomass: numberFromText(textOf("#dryCount")),
        seedBank: numberFromText(textOf("#seedCount")),
        patchCount: null,
      },
      populations: {
        grazers: numberFromText(textOf("#grazerCount")),
        hunters: numberFromText(textOf("#hunterCount")),
        carcasses: numberFromText(textOf("#carcassCount")),
      },
      mission: { state: textOf("#missionState"), yearsText: textOf("#missionYears") },
      balance: { label: textOf("#balanceLabel"), advice: textOf("#balanceAdvice"), score: numberFromText(getElement("#balanceFill")?.style.width) },
    };
  }

  function getSnapshot() {
    const source = getInternalSnapshot() || getFallbackSnapshot();
    return {
      capturedAt: new Date().toISOString(),
      elapsedRealSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
      selectedSpecies: selectedSpecies(),
      ...source,
    };
  }

  function snapshotSignature(snapshot) {
    return JSON.stringify({
      worldYear: Number(snapshot.worldYear || 0).toFixed(2),
      season: snapshot.season,
      running: snapshot.running,
      speed: snapshot.speed,
      rules: snapshot.rules,
      resources: {
        green: Math.round(snapshot.resources?.greenBiomass || 0),
        dry: Math.round(snapshot.resources?.dryBiomass || 0),
        seeds: Math.round(snapshot.resources?.seedBank || 0),
      },
      populations: snapshot.populations,
      mission: snapshot.mission?.criteria,
      balance: snapshot.balance?.label,
    });
  }

  function recordSample(force = false) {
    collectNewWorldEvents();
    const snapshot = getSnapshot();
    const signature = snapshotSignature(snapshot);
    if (!force && signature === session.lastSampleSignature) return;
    session.lastSampleSignature = signature;
    session.samples.push(snapshot);
    if (session.samples.length > MAX_SAMPLES) session.samples.splice(0, session.samples.length - MAX_SAMPLES);
  }

  function recordAction(type, details = {}) {
    const snapshot = getSnapshot();
    session.actions.push({
      capturedAt: snapshot.capturedAt,
      elapsedRealSeconds: snapshot.elapsedRealSeconds,
      worldYear: snapshot.worldYear,
      type,
      details,
    });
    if (session.actions.length > MAX_ACTIONS) session.actions.splice(0, session.actions.length - MAX_ACTIONS);
    window.setTimeout(() => recordSample(true), 0);
  }

  function numericSeries(path) {
    const keys = path.split(".");
    return session.samples.map((sample) => keys.reduce((value, key) => value?.[key], sample)).filter(Number.isFinite);
  }

  function summarizeSeries(path) {
    const values = numericSeries(path);
    if (values.length === 0) return null;
    return { initial: values[0], final: values.at(-1), minimum: Math.min(...values), maximum: Math.max(...values) };
  }

  function firstTransitionToZero(path) {
    const keys = path.split(".");
    let previous = null;
    for (const sample of session.samples) {
      const current = keys.reduce((value, key) => value?.[key], sample);
      if (!Number.isFinite(current)) continue;
      if (previous !== null && previous > 0 && current <= 0) return sample.worldYear;
      previous = current;
    }
    return null;
  }

  function buildReport(playerNotes) {
    recordSample(true);
    const finalSnapshot = getSnapshot();
    return {
      reportVersion: session.reportVersion,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      exportedAt: new Date().toISOString(),
      playerNotes: playerNotes || "",
      privacy: "本报告由浏览器在本地生成，仅在玩家主动下载后保存；游戏不会自动上传游玩记录。",
      environment: {
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        language: navigator.language,
        viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      },
      summary: {
        realSessionSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
        finalWorldYear: finalSnapshot.worldYear,
        finalSeason: finalSnapshot.season,
        finalEcologyState: finalSnapshot.balance,
        resources: {
          greenBiomass: summarizeSeries("resources.greenBiomass"),
          dryBiomass: summarizeSeries("resources.dryBiomass"),
          seedBank: summarizeSeries("resources.seedBank"),
          averageFertility: summarizeSeries("resources.averageFertility"),
          firstGreenBiomassZeroYear: firstTransitionToZero("resources.greenBiomass"),
          firstSeedBankZeroYear: firstTransitionToZero("resources.seedBank"),
        },
        populations: {
          grazers: { ...summarizeSeries("populations.grazers"), firstExtinctionYear: firstTransitionToZero("populations.grazers") },
          hunters: { ...summarizeSeries("populations.hunters"), firstExtinctionYear: firstTransitionToZero("populations.hunters") },
        },
        finalAgeStructure: {
          grazers: finalSnapshot.populations?.grazerAges || null,
          hunters: finalSnapshot.populations?.hunterAges || null,
        },
        finalMission: finalSnapshot.mission || null,
        lifetimeMetrics: finalSnapshot.lifetimeMetrics || null,
        hunterBehavior: finalSnapshot.hunterBehavior || null,
        recordedSamples: session.samples.length,
        recordedActions: session.actions.length,
        recordedErrors: session.errors.length,
        recordedWorldEvents: session.worldEvents.length,
      },
      finalSnapshot,
      actions: session.actions,
      worldEvents: session.worldEvents,
      errors: session.errors,
      samples: session.samples,
    };
  }

  function safeFileTimestamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

  function downloadReport() {
    const notes = window.prompt("可选：请描述你观察到的问题，例如“猎食兽一直追不上食草兽”或“动物仍在食物充足时断代”。", "");
    const report = buildReport(notes === null ? "" : notes.trim());
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `little-god-diagnostic-${safeFileTimestamp()}.json`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    const button = getElement("#exportDiagnosticsButton");
    if (button) {
      const originalText = button.textContent; button.textContent = "诊断已导出"; button.disabled = true;
      window.setTimeout(() => { button.textContent = originalText; button.disabled = false; }, 1600);
    }
  }

  function bindActionTracking() {
    getElement("#playToggle")?.addEventListener("click", () => {
      window.setTimeout(() => {
        const snapshot = getSnapshot();
        const type = snapshot.running ? (snapshot.worldYear > 0 ? "resume-time" : "start-time") : "pause-time";
        recordAction(type, { running: snapshot.running, speed: snapshot.speed });
      }, 0);
    });
    for (const button of document.querySelectorAll(".speed-button")) button.addEventListener("click", () => recordAction("set-speed", { speed: Number(button.dataset.speed) }));
    for (const button of document.querySelectorAll(".species-button")) button.addEventListener("click", () => recordAction("select-species", { species: button.dataset.species }));
    getElement("#worldCanvas")?.addEventListener("pointerdown", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      recordAction("place-species", {
        species: selectedSpecies(),
        normalizedX: Number(((event.clientX - rect.left) / rect.width).toFixed(3)),
        normalizedY: Number(((event.clientY - rect.top) / rect.height).toFixed(3)),
      });
    });
    getElement("#growthRule")?.addEventListener("change", () => recordAction("change-growth-rule", { value: numberFromText(getElement("#growthRule")?.value, 1) }));
    getElement("#fertilityRule")?.addEventListener("change", () => recordAction("change-fertility-rule", { value: numberFromText(getElement("#fertilityRule")?.value, 1) }));
    getElement("#seasonsRule")?.addEventListener("change", () => recordAction("toggle-full-seasons", { enabled: Boolean(getElement("#seasonsRule")?.checked) }));
    getElement("#resetButton")?.addEventListener("click", () => recordAction("reset-world"));
    getElement("#clearButton")?.addEventListener("click", () => recordAction("clear-life"));
    getElement("#exportDiagnosticsButton")?.addEventListener("click", downloadReport);
  }

  function bindErrorTracking() {
    window.addEventListener("error", (event) => recordError({
      type: "window-error", message: event.message || "Unknown window error", source: event.filename || null,
      line: event.lineno || null, column: event.colno || null, stack: event.error?.stack || null,
    }));
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      recordError({ type: "unhandled-promise-rejection", message: reason?.message || String(reason), stack: reason?.stack || null });
    });
  }

  function initialize() {
    bindActionTracking(); bindErrorTracking(); recordSample(true);
    window.setInterval(() => recordSample(false), SAMPLE_INTERVAL_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
