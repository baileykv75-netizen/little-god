(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Terrain feeding requires LittleGod core");
  if (typeof LG.getEstablishedGrazerLoop !== "function" || typeof LG.setTerrainGrazerUpdater !== "function") {
    throw new Error("Terrain feeding bootstrap must load before simulation.js");
  }

  const { state, SPECIES } = LG;
  const legacyViewCache = new WeakMap();

  function legacySafeCell(cell) {
    let proxy = legacyViewCache.get(cell);
    if (proxy) return proxy;
    proxy = new Proxy(cell, {
      get(target, property, receiver) {
        // Legacy feeding used a circular radius. Grid cells intentionally expose
        // no usable radius while the established lifecycle loop is running.
        if (property === "radius") return Number.NaN;
        return Reflect.get(target, property, receiver);
      },
      set(target, property, value, receiver) {
        return Reflect.set(target, property, value, receiver);
      },
    });
    legacyViewCache.set(cell, proxy);
    return proxy;
  }

  function runEstablishedGrazerLoop(dt) {
    const establishedLoop = LG.getEstablishedGrazerLoop();
    if (typeof establishedLoop !== "function") return;

    const terrainCells = state.patches;
    const safeGridView = terrainCells
      .filter((cell) => cell?.isGridCell === true)
      .map(legacySafeCell);
    state.patches = safeGridView;
    try {
      establishedLoop.call(LG, dt);
    } finally {
      state.patches = terrainCells;
    }
  }

  function terrainCellsNear(animal, radius) {
    if (typeof LG.getVegetationCellsInRadius !== "function") return [];
    return LG.getVegetationCellsInRadius(animal.x, animal.y, radius)
      .filter((cell) => cell?.isGridCell === true);
  }

  LG.getTerrainFeedingCell = (animal, radius = 24) => {
    let best = null;
    let bestScore = -Infinity;
    for (const cell of terrainCellsNear(animal, radius)) {
      const distance = Math.hypot(cell.x - animal.x, cell.y - animal.y);
      const food = cell.green + cell.dry * 0.38;
      const score = food - distance * 0.08;
      if (food > 0.12 && score > bestScore) {
        best = cell;
        bestScore = score;
      }
    }
    return best;
  };

  LG.consumeTerrainFoodAt = (grazer, dt) => {
    if (!grazer || !Number.isFinite(dt) || dt <= 0) return 0;
    const cell = LG.getTerrainFeedingCell(grazer);
    if (!cell) return 0;

    const config = SPECIES.grazer;
    const maxEnergy = grazer.derived?.maxEnergy || config.maxEnergy;
    let eaten = 0;

    if (cell.green > 0.15) {
      eaten = Math.min(cell.green, config.eatRate * dt);
      cell.green -= eaten;
      cell.rootBiomass = Math.max(0, cell.rootBiomass - eaten * 0.012);
      grazer.energy = Math.min(maxEnergy, grazer.energy + eaten * config.greenEnergy);
      LG.incrementMetric("greenConsumed", eaten);
    } else if (cell.dry > 0.05) {
      eaten = Math.min(cell.dry, config.eatRate * 0.58 * dt);
      cell.dry -= eaten;
      grazer.energy = Math.min(maxEnergy, grazer.energy + eaten * config.dryEnergy);
      LG.incrementMetric("dryConsumed", eaten);
    }

    if (eaten > 0) {
      grazer.lastMealAge = 0;
      cell.lastDisturbedYear = state.year;
    }
    return eaten;
  };

  function updateGrazersFromTerrain(dt) {
    runEstablishedGrazerLoop(dt);

    for (const grazer of state.grazers) {
      const threatRadius = grazer.derived?.threatRadius || SPECIES.grazer.threatRadius;
      const threatened = LG.findNearest?.(
        grazer,
        state.hunters,
        threatRadius,
        (hunter) => hunter.state !== "rest" && hunter.state !== "feed",
      );
      if (!threatened) LG.consumeTerrainFoodAt(grazer, dt);
    }
  }

  LG.setTerrainGrazerUpdater(updateGrazersFromTerrain);
  LG.terrainFeedingModel = Object.freeze({
    version: "grid-local-v4",
    source: "64x40-vegetation-grid",
    legacyCircularFeeding: false,
    binding: "captured-before-simulation",
  });
})();
