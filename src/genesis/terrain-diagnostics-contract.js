(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Terrain diagnostics contract requires LittleGod core");

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

    const result = {
      version: "terrain-grid-diagnostics-v1",
      columns: vegetation?.columns ?? grid.columns ?? 0,
      rows: vegetation?.rows ?? grid.rows ?? 0,
      cellCount,
      cellWidth: grid.cellWidth ?? 0,
      cellHeight: grid.cellHeight ?? 0,
      vegetatedCoverage: vegetation?.vegetatedCoverage ?? 0,
      rootCoverage: vegetation?.rootCoverage ?? 0,
      bareCoverage: vegetation?.bareCoverage ?? 1,
      hotspots: vegetation?.hotspots ?? [],
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
    };
    result.coverage = {
      vegetated: result.vegetatedCoverage,
      rooted: result.rootCoverage,
      bare: result.bareCoverage,
    };
    result.resourceBudget = result.budget;

    return result;
  };
})();
