(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Terrain store requires LittleGod core");
  if (!LG.GRID || typeof LG.initializeVegetationGrid !== "function") {
    throw new Error("Terrain store requires world-v2.js");
  }

  const { state, GRID, WORLD } = LG;
  const cellCount = GRID.columns * GRID.rows;
  const initialPatchCollection = Array.isArray(state.patches) ? state.patches : [];
  let renderViews = initialPatchCollection;
  let terrainModeDepth = 0;
  let suppressExternalClear = false;

  const original = {
    initializeVegetationGrid: LG.initializeVegetationGrid,
    createPatch: LG.createPatch,
    seedPatchAt: LG.seedPatchAt,
    findPatchNear: LG.findPatchNear,
    getResourceTotals: LG.getResourceTotals,
    hasDormantPlantLife: LG.hasDormantPlantLife,
    updateVegetationGrid: LG.updateVegetationGrid,
    getVegetationDiagnostics: LG.getVegetationDiagnostics,
  };

  state.terrainCells = Array.isArray(state.terrainCells) ? state.terrainCells : [];

  Object.defineProperty(state, "patches", {
    configurable: true,
    enumerable: true,
    get() {
      return terrainModeDepth > 0 ? state.terrainCells : renderViews;
    },
    set(value) {
      const next = Array.isArray(value) ? value : [];
      if (terrainModeDepth > 0) {
        state.terrainCells = next;
        return;
      }
      renderViews = next;
      if (!suppressExternalClear && next.length === 0) state.terrainCells = [];
    },
  });

  function withTerrainCells(callback) {
    terrainModeDepth += 1;
    try {
      return callback();
    } finally {
      terrainModeDepth -= 1;
    }
  }

  function isCompleteGrid(cells) {
    return Array.isArray(cells)
      && cells.length === cellCount
      && cells.every((cell) => cell?.isGridCell === true);
  }

  function normalizeCanonicalCell(cell) {
    // Circular radius belongs to the renderer only. Feeding, seasons and
    // diagnostics operate on rectangular grid cells with no patch radius.
    if (Object.prototype.hasOwnProperty.call(cell, "radius")) delete cell.radius;
    cell.terrainModel = "grid-cell";
    cell.drivesFeeding = true;
    return cell;
  }

  function createRenderView(cell) {
    const view = {
      id: `terrain-view-${cell.id}`,
      type: "terrain-view",
      isGridCell: false,
      isTerrainRenderCell: true,
      drivesFeeding: false,
      terrainCellId: cell.id,
      radius: Math.max(GRID.cellWidth, GRID.cellHeight) * 0.72,
    };

    for (const key of [
      "x", "y", "green", "dry", "seeds", "rootBiomass", "fertility",
      "moisture", "grazingPressure", "phase", "barrenAge", "gridColumn", "gridRow",
    ]) {
      Object.defineProperty(view, key, {
        enumerable: true,
        configurable: false,
        get() { return cell[key]; },
        set(value) {
          // Render views never own food. Only non-food compatibility writes such
          // as carcass fertility enrichment are forwarded to the terrain cell.
          if (key === "fertility") cell.fertility = value;
        },
      });
    }
    return view;
  }

  function publishTerrain(cells) {
    if (!isCompleteGrid(cells)) {
      throw new Error(`Terrain grid must contain ${cellCount} canonical cells`);
    }
    state.terrainCells = cells.map(normalizeCanonicalCell);
    suppressExternalClear = true;
    renderViews = state.terrainCells.map(createRenderView);
    suppressExternalClear = false;
    return state.terrainCells;
  }

  LG.initializeVegetationGrid = (options = {}) => {
    const cells = withTerrainCells(() => original.initializeVegetationGrid(options));
    return publishTerrain(cells);
  };

  LG.getTerrainCells = () => {
    if (isCompleteGrid(state.terrainCells)) return state.terrainCells;
    return LG.initializeVegetationGrid();
  };

  LG.getVegetationCell = (column, row) => {
    const cells = LG.getTerrainCells();
    const safeColumn = LG.clamp(Math.floor(column), 0, GRID.columns - 1);
    const safeRow = LG.clamp(Math.floor(row), 0, GRID.rows - 1);
    return cells[safeRow * GRID.columns + safeColumn];
  };

  LG.getVegetationCellAt = (x, y) => LG.getVegetationCell(
    Math.floor(LG.clamp(x, 0, WORLD.width - 0.001) / GRID.cellWidth),
    Math.floor(LG.clamp(y, 0, WORLD.height - 0.001) / GRID.cellHeight),
  );

  LG.getVegetationCellsInRadius = (x, y, radius) => {
    const cells = LG.getTerrainCells();
    const minColumn = LG.clamp(Math.floor((x - radius) / GRID.cellWidth), 0, GRID.columns - 1);
    const maxColumn = LG.clamp(Math.floor((x + radius) / GRID.cellWidth), 0, GRID.columns - 1);
    const minRow = LG.clamp(Math.floor((y - radius) / GRID.cellHeight), 0, GRID.rows - 1);
    const maxRow = LG.clamp(Math.floor((y + radius) / GRID.cellHeight), 0, GRID.rows - 1);
    const radiusSquared = radius * radius;
    const nearby = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const cell = cells[row * GRID.columns + column];
        if (
          cell?.isGridCell === true
          && cell.terrainModel === "grid-cell"
          && !Object.prototype.hasOwnProperty.call(cell, "radius")
          && (cell.x - x) ** 2 + (cell.y - y) ** 2 <= radiusSquared
        ) nearby.push(cell);
      }
    }
    return nearby;
  };

  LG.createPatch = (...args) => withTerrainCells(() => original.createPatch(...args));
  LG.seedPatchAt = (...args) => withTerrainCells(() => original.seedPatchAt(...args));
  LG.findPatchNear = (...args) => withTerrainCells(() => original.findPatchNear(...args));
  LG.getResourceTotals = () => withTerrainCells(() => original.getResourceTotals());
  LG.hasDormantPlantLife = () => withTerrainCells(() => original.hasDormantPlantLife());
  LG.getVegetationDiagnostics = () => withTerrainCells(() => original.getVegetationDiagnostics());

  const updateTerrain = (dt) => withTerrainCells(() => original.updateVegetationGrid(dt));
  LG.updateVegetationGrid = updateTerrain;
  Object.defineProperty(LG, "updatePatches", {
    configurable: true,
    enumerable: true,
    get() { return updateTerrain; },
    set() {},
  });

  if (isCompleteGrid(state.terrainCells)) publishTerrain(state.terrainCells);
  else if (isCompleteGrid(initialPatchCollection)) publishTerrain(initialPatchCollection);

  LG.terrainStoreModel = Object.freeze({
    version: "terrain-store-v3",
    source: "state.terrainCells",
    renderSource: "state.patches-render-views",
    canonicalCellsHaveCircularRadius: false,
    sharedCellIdentityWithLegacyPatches: false,
    legacyPatchCollectionFeedsAnimals: false,
    columns: GRID.columns,
    rows: GRID.rows,
    cellCount,
  });
})();
