(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Terrain diagnostics contract requires LittleGod core");

  // This file loads before simulation.js. Capture the established grazer loop
  // when simulation assigns it, then allow the terrain module to replace only
  // the public updater without losing lifecycle, movement or reproduction.
  let establishedGrazerLoop = null;
  let activeGrazerUpdater = (...args) => establishedGrazerLoop?.apply(LG, args);

  Object.defineProperty(LG, "updateGrazers", {
    configurable: true,
    get() {
      return activeGrazerUpdater;
    },
    set(value) {
      establishedGrazerLoop = value;
    },
  });

  LG.getEstablishedGrazerLoop = () => establishedGrazerLoop;
  LG.setTerrainGrazerUpdater = (updater) => {
    if (typeof updater !== "function") throw new TypeError("Terrain grazer updater must be a function");
    activeGrazerUpdater = updater;
  };

  const asCoverage = (value, fallback) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.min(1, numeric));
  };

  LG.getTerrainDiagnostics = () => {
    const vegetation = typeof LG.getVegetationDiagnostics === "function"
      ? LG.getVegetationDiagnostics()
      : null;
    const totals = typeof LG.getResourceTotals === "function"
      ? LG.getResourceTotals()
      : { green: 0, dry: 0, seeds: 0, roots: 0, fertility: 0 };
    const grid = LG.GRID || {};
    const cellCount = vegetation?.cellCount
      ?? ((grid.columns || 0) * (grid.rows || 0));
    const averageFertility = cellCount > 0 ? totals.fertility / cellCount : 0;
    const cellWidth = grid.cellWidth ?? 0;
    const cellHeight = grid.cellHeight ?? 0;
    const cellSize = cellWidth === cellHeight ? cellWidth : null;
    const greenCoverage = asCoverage(vegetation?.vegetatedCoverage, 0);
    const rootCoverage = asCoverage(vegetation?.rootCoverage, 0);
    const bareCoverage = asCoverage(vegetation?.bareCoverage, 1);
    const grazingHotspots = Array.isArray(vegetation?.hotspots)
      ? vegetation.hotspots.map((hotspot) => ({ ...hotspot }))
      : [];

    const result = {
      version: "terrain-grid-diagnostics-v1",
      columns: vegetation?.columns ?? grid.columns ?? 0,
      rows: vegetation?.rows ?? grid.rows ?? 0,
      cellCount,
      cellWidth,
      cellHeight,
      cellSize,
      vegetatedCoverage: greenCoverage,
      rootCoverage,
      bareCoverage,
      hotspots: grazingHotspots,
      grazingHotspots,
      budget: { ...(vegetation?.budget || {}) },
      resources: {
        greenBiomass: totals.green,
        dryBiomass: totals.dry,
        seedBank: totals.seeds,
        rootBiomass: totals.roots,
        averageFertility,
      },
    };

    result.grid = {
      columns: result.columns,
      rows: result.rows,
      cellCount: result.cellCount,
      cellWidth: result.cellWidth,
      cellHeight: result.cellHeight,
      cellSize: result.cellSize,
    };
    result.coverage = {
      green: greenCoverage,
      root: rootCoverage,
      roots: rootCoverage,
      bare: bareCoverage,
      barren: bareCoverage,
      vegetated: greenCoverage,
      rooted: rootCoverage,
    };
    result.resourceBudget = result.budget;

    return result;
  };
})();
