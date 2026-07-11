(() => {
  "use strict";

  const SAMPLE_INTERVAL_MS = 1000;
  const MAX_SAMPLES = 1800;
  const MAX_ACTIONS = 600;
  const MAX_ERRORS = 100;
  const MAX_WORLD_EVENTS = 300;

  const session = {
    reportVersion: "little-god-stage0-diagnostics-v1",
    sessionId: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    startedAt: new Date().toISOString(),
    samples: [],
    actions: [],
    errors: [],
    worldEvents: [],
    seenWorldEvents: new Set(),
    lastSampleSignature: "",
  };

  function getElement(selector) {
    return document.querySelector(selector);
  }

  function textOf(selector, fallback = "") {
    return getElement(selector)?.textContent?.trim() || fallback;
  }

  function numberFromText(value, fallback = 0) {
    const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : fallback;
  }

  function valueOf(selector, fallback = null) {
    const element = getElement(selector);
    return element ? element.value : fallback;
  }

  function checkedOf(selector) {
    return Boolean(getElement(selector)?.checked);
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
    const displayedEvents = readRecentEvents();
    for (const event of displayedEvents.reverse()) {
      const key = `${event.year}|${event.message}`;
      if (session.seenWorldEvents.has(key)) continue;
      session.seenWorldEvents.add(key);
      session.worldEvents.push({
        ...event,
        capturedAt: new Date().toISOString(),
      });
    }

    if (session.worldEvents.length > MAX_WORLD_EVENTS) {
      session.worldEvents.splice(0, session.worldEvents.length - MAX_WORLD_EVENTS);
    }
  }

  function getSnapshot() {
    const balanceFill = getElement("#balanceFill");
    const progressFill = getElement("#missionProgress");

    return {
      capturedAt: new Date().toISOString(),
      elapsedRealSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
      worldYear: numberFromText(textOf("#worldAge")),
      running: getElement("#playToggle")?.getAttribute("aria-pressed") === "true",
      speed: currentSpeed(),
      season: textOf("#seasonLabel", "unknown"),
      selectedSpecies: selectedSpecies(),
      rules: {
        growth: numberFromText(valueOf("#growthRule", 1), 1),
        fertility: numberFromText(valueOf("#fertilityRule", 1), 1),
        harshSeasons: checkedOf("#seasonsRule"),
      },
      populations: {
        flora: numberFromText(textOf("#floraCount")),
        grazers: numberFromText(textOf("#grazerCount")),
        hunters: numberFromText(textOf("#hunterCount")),
      },
      trends: {
        flora: textOf("#floraTrend"),
        grazers: textOf("#grazerTrend"),
        hunters: textOf("#hunterTrend"),
      },
      mission: {
        state: textOf("#missionState"),
        yearsText: textOf("#missionYears"),
        progressPercent: numberFromText(progressFill?.style.width, 0),
      },
      ecology: {
        label: textOf("#balanceLabel"),
        scorePercent: numberFromText(balanceFill?.style.width, 0),
        advice: textOf("#balanceAdvice"),
      },
    };
  }

  function snapshotSignature(snapshot) {
    return JSON.stringify({
      year: snapshot.worldYear,
      running: snapshot.running,
      speed: snapshot.speed,
      season: snapshot.season,
      selectedSpecies: snapshot.selectedSpecies,
      rules: snapshot.rules,
      populations: snapshot.populations,
      missionState: snapshot.mission.state,
      ecologyLabel: snapshot.ecology.label,
    });
  }

  function recordSample(force = false) {
    collectNewWorldEvents();
    const snapshot = getSnapshot();
    const signature = snapshotSignature(snapshot);

    if (!force && signature === session.lastSampleSignature) return;
    session.lastSampleSignature = signature;
    session.samples.push(snapshot);

    if (session.samples.length > MAX_SAMPLES) {
      session.samples.splice(0, session.samples.length - MAX_SAMPLES);
    }
  }

  function recordAction(type, details = {}) {
    session.actions.push({
      capturedAt: new Date().toISOString(),
      elapsedRealSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
      worldYear: numberFromText(textOf("#worldAge")),
      type,
      details,
    });

    if (session.actions.length > MAX_ACTIONS) {
      session.actions.splice(0, session.actions.length - MAX_ACTIONS);
    }

    window.setTimeout(() => recordSample(true), 0);
  }

  function recordError(error) {
    session.errors.push({
      capturedAt: new Date().toISOString(),
      elapsedRealSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
      worldYear: numberFromText(textOf("#worldAge")),
      ...error,
    });

    if (session.errors.length > MAX_ERRORS) {
      session.errors.splice(0, session.errors.length - MAX_ERRORS);
    }
  }

  function summarizePopulation(samples, key) {
    const values = samples.map((sample) => sample.populations[key]).filter(Number.isFinite);
    if (values.length === 0) return null;

    let firstZeroYear = null;
    let previous = values[0];
    for (let index = 1; index < samples.length; index += 1) {
      const current = samples[index].populations[key];
      if (previous > 0 && current === 0) {
        firstZeroYear = samples[index].worldYear;
        break;
      }
      previous = current;
    }

    return {
      initial: values[0],
      final: values.at(-1),
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      firstObservedExtinctionYear: firstZeroYear,
    };
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
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        documentVisibility: document.visibilityState,
      },
      summary: {
        realSessionSeconds: Number(((Date.now() - Date.parse(session.startedAt)) / 1000).toFixed(1)),
        finalWorldYear: finalSnapshot.worldYear,
        missionState: finalSnapshot.mission.state,
        missionYearsText: finalSnapshot.mission.yearsText,
        finalEcologyState: finalSnapshot.ecology,
        populationHistory: {
          flora: summarizePopulation(session.samples, "flora"),
          grazers: summarizePopulation(session.samples, "grazers"),
          hunters: summarizePopulation(session.samples, "hunters"),
        },
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

  function safeFileTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  function downloadReport() {
    const notes = window.prompt(
      "可选：请简要描述你发现的问题，例如“12倍速运行到80年后食草兽突然灭绝”。这段文字会写入诊断报告。",
      "",
    );
    const report = buildReport(notes === null ? "" : notes.trim());
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `little-god-diagnostic-${safeFileTimestamp()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    const button = getElement("#exportDiagnosticsButton");
    if (button) {
      const originalText = button.textContent;
      button.textContent = "诊断已导出";
      button.disabled = true;
      window.setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 1600);
    }
  }

  function bindActionTracking() {
    getElement("#playToggle")?.addEventListener("click", () => {
      recordAction("toggle-time", { nextRunning: getElement("#playToggle")?.getAttribute("aria-pressed") !== "true" });
    }, true);

    for (const button of document.querySelectorAll(".speed-button")) {
      button.addEventListener("click", () => recordAction("set-speed", { speed: Number(button.dataset.speed) }), true);
    }

    for (const button of document.querySelectorAll(".species-button")) {
      button.addEventListener("click", () => recordAction("select-species", { species: button.dataset.species }), true);
    }

    getElement("#worldCanvas")?.addEventListener("pointerdown", (event) => {
      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      recordAction("place-species", {
        species: selectedSpecies(),
        normalizedX: Number(((event.clientX - rect.left) / rect.width).toFixed(3)),
        normalizedY: Number(((event.clientY - rect.top) / rect.height).toFixed(3)),
      });
    }, true);

    getElement("#growthRule")?.addEventListener("change", () => {
      recordAction("change-growth-rule", { value: numberFromText(valueOf("#growthRule"), 1) });
    }, true);

    getElement("#fertilityRule")?.addEventListener("change", () => {
      recordAction("change-fertility-rule", { value: numberFromText(valueOf("#fertilityRule"), 1) });
    }, true);

    getElement("#seasonsRule")?.addEventListener("change", () => {
      recordAction("toggle-harsh-seasons", { enabled: checkedOf("#seasonsRule") });
    }, true);

    getElement("#resetButton")?.addEventListener("click", () => recordAction("reset-world"), true);
    getElement("#clearButton")?.addEventListener("click", () => recordAction("clear-life"), true);
    getElement("#exportDiagnosticsButton")?.addEventListener("click", downloadReport);
  }

  function bindErrorTracking() {
    window.addEventListener("error", (event) => {
      recordError({
        type: "window-error",
        message: event.message || "Unknown window error",
        source: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null,
        stack: event.error?.stack || null,
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      recordError({
        type: "unhandled-promise-rejection",
        message: reason?.message || String(reason),
        stack: reason?.stack || null,
      });
    });
  }

  function observeWorldEvents() {
    const eventLog = getElement("#eventLog");
    if (!eventLog) return;
    const observer = new MutationObserver(() => collectNewWorldEvents());
    observer.observe(eventLog, { childList: true, subtree: true, characterData: true });
  }

  function initializeDiagnostics() {
    bindActionTracking();
    bindErrorTracking();
    observeWorldEvents();
    collectNewWorldEvents();
    recordSample(true);
    window.setInterval(() => recordSample(false), SAMPLE_INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeDiagnostics, { once: true });
  } else {
    initializeDiagnostics();
  }
})();