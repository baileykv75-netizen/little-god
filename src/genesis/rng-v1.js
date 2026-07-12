(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Seeded experiments require LittleGod core");
  if (typeof LG.seedWorld !== "function") throw new Error("Seeded experiments require world-v2.js");

  const nativeRandom = Math.random.bind(Math);
  const algorithm = "mulberry32-fnv1a-v1";

  function normalizeSeed(value) {
    const text = String(value ?? "").trim().slice(0, 64);
    return text || "genesis-default";
  }

  function hashSeed(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0 || 0x6d2b79f5;
  }

  function generatedSeed() {
    const timePart = Date.now().toString(36);
    const randomPart = Math.floor(nativeRandom() * 0xffffffff).toString(36);
    return `genesis-${timePart}-${randomPart}`;
  }

  const querySeed = (() => {
    try {
      return new URLSearchParams(window.location?.search || "").get("seed");
    } catch {
      return null;
    }
  })();

  let seed = normalizeSeed(querySeed || generatedSeed());
  let seedSource = querySeed ? "url" : "generated";
  let seedHash = hashSeed(seed);
  let state = seedHash;
  let draws = 0;

  function buildLabelElement() {
    return typeof document === "undefined" ? null : document.querySelector(".build-version");
  }

  function runtimeBuildVersion() {
    const label = buildLabelElement();
    const declared = label?.dataset?.build?.trim();
    if (declared) return declared;
    const visible = label?.textContent?.trim().match(/^v[\w.-]+/)?.[0];
    return visible || "build-unknown";
  }

  function syncState() {
    if (!LG.state) return;
    LG.state.experimentSeed = seed;
    LG.state.experimentSeedHash = seedHash;
    LG.state.randomDraws = draws;
  }

  function renderSeedLabel() {
    const label = buildLabelElement();
    if (!label) return;
    const build = runtimeBuildVersion();
    const compactSeed = seed.length > 18 ? `${seed.slice(0, 15)}…` : seed;
    label.dataset.build = build;
    label.textContent = `${build} · seed ${compactSeed}`;
    label.title = `构建：${build}。实验种子：${seed}。使用 ?seed=${encodeURIComponent(seed)} 可复现实验。`;
  }

  function syncSeedControls(message = "") {
    if (typeof document === "undefined") return;
    const input = document.querySelector("#experimentSeedInput");
    const status = document.querySelector("#experimentSeedStatus");
    if (input && input.value !== seed) input.value = seed;
    if (status && message) status.textContent = message;
  }

  function rewind() {
    seedHash = hashSeed(seed);
    state = seedHash;
    draws = 0;
    syncState();
  }

  function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    draws += 1;
    syncState();
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  LG.random = nextRandom;
  LG.randomBetween = (min, max) => min + nextRandom() * (max - min);

  // Existing modules still contain direct Math.random calls. Routing the page's
  // random source here makes genetics, movement and hunting part of one replayable experiment.
  Math.random = nextRandom;

  LG.getExperimentReplayUrl = () => {
    try {
      const url = new URL(window.location?.href || "http://localhost/");
      url.searchParams.set("seed", seed);
      return url.toString();
    } catch {
      return `?seed=${encodeURIComponent(seed)}`;
    }
  };

  LG.setExperimentSeed = (value, options = {}) => {
    seed = normalizeSeed(value);
    seedSource = options.source || "api";
    rewind();
    renderSeedLabel();
    syncSeedControls();
    if (options.resetWorld === true) LG.seedWorld();
    return LG.getExperimentDiagnostics();
  };

  LG.rewindExperimentRandom = () => {
    rewind();
    return LG.getExperimentDiagnostics();
  };

  LG.getExperimentDiagnostics = () => ({
    algorithm,
    build: runtimeBuildVersion(),
    seed,
    seedHash,
    draws,
    deterministic: true,
    source: seedSource,
  });

  LG.getRuntimeBuildDiagnostics = () => ({
    version: runtimeBuildVersion(),
    seed,
    label: buildLabelElement()?.textContent?.trim() || null,
  });

  const seedWorld = LG.seedWorld;
  LG.seedWorld = (...args) => {
    rewind();
    return seedWorld.apply(LG, args);
  };

  async function copyReplayUrl() {
    const replayUrl = LG.getExperimentReplayUrl();
    try {
      if (!navigator?.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(replayUrl);
      syncSeedControls("复现链接已复制");
      LG.showToast?.("复现链接已复制");
      return true;
    } catch {
      syncSeedControls("无法访问剪贴板，请从诊断中复制复现链接");
      LG.showToast?.("无法访问剪贴板");
      return false;
    }
  }

  function bindSeedControls() {
    if (typeof document === "undefined") return false;
    const form = document.querySelector("#experimentSeedForm");
    const input = document.querySelector("#experimentSeedInput");
    const copyButton = document.querySelector("#copyExperimentReplay");
    if (!form || !input || !copyButton || form.dataset.bound === "true") return false;

    form.dataset.bound = "true";
    input.value = seed;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const diagnostics = LG.setExperimentSeed(input.value, {
        resetWorld: true,
        source: "control",
      });
      LG.camera?.reset?.();
      syncSeedControls(`已重置为种子 ${diagnostics.seed}`);
      LG.showToast?.("已使用新种子重置世界");
    });
    copyButton.addEventListener("click", () => copyReplayUrl());
    return true;
  }

  LG.getExperimentControlDiagnostics = () => ({
    mounted: typeof document !== "undefined"
      && Boolean(document.querySelector("#experimentSeedForm")?.dataset.bound === "true"),
    seed,
    replayUrl: LG.getExperimentReplayUrl(),
  });
  LG.experimentControlModel = Object.freeze({
    version: "experiment-controls-v1",
    resetsWorldOnApply: true,
    copiesReplayUrl: true,
    preservesBuildProvenance: true,
  });

  rewind();
  if (typeof document !== "undefined") {
    const initializeUi = () => {
      renderSeedLabel();
      bindSeedControls();
      syncSeedControls();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeUi, { once: true });
    } else {
      initializeUi();
    }
  }
})();
