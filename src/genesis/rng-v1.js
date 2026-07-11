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

  function syncState() {
    if (!LG.state) return;
    LG.state.experimentSeed = seed;
    LG.state.experimentSeedHash = seedHash;
    LG.state.randomDraws = draws;
  }

  function renderSeedLabel() {
    if (typeof document === "undefined") return;
    const label = document.querySelector(".build-version");
    if (!label) return;
    const compactSeed = seed.length > 18 ? `${seed.slice(0, 15)}…` : seed;
    label.textContent = `v0.4.8 · seed ${compactSeed}`;
    label.title = `实验种子：${seed}。使用 ?seed=${encodeURIComponent(seed)} 可复现实验。`;
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

  LG.setExperimentSeed = (value, options = {}) => {
    seed = normalizeSeed(value);
    seedSource = "api";
    rewind();
    renderSeedLabel();
    if (options.resetWorld === true) LG.seedWorld();
    return LG.getExperimentDiagnostics();
  };

  LG.rewindExperimentRandom = () => {
    rewind();
    return LG.getExperimentDiagnostics();
  };

  LG.getExperimentDiagnostics = () => ({
    algorithm,
    seed,
    seedHash,
    draws,
    deterministic: true,
    source: seedSource,
  });

  const seedWorld = LG.seedWorld;
  LG.seedWorld = (...args) => {
    rewind();
    return seedWorld.apply(LG, args);
  };

  rewind();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderSeedLabel, { once: true });
    } else {
      renderSeedLabel();
    }
  }
})();
