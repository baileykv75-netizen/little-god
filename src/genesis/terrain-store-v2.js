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
  let suppressExternalWrite = false;
  let invalidatedByLegacyReplacement = false;

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
      if (!suppressExternalWrite) {
        state.terrainCells = [];
        invalidatedByLegacyReplacement = true;
      }
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
    if (Object.prototype.hasOwnProperty.call(cell, "radius")) delete cell.radius;
    cell.terrainModel = "grid-cell";
    cell.drivesFeeding = true;
    return cell;
  }

  function copyRenderSnapshot(view, cell) {
    view.x = cell.x;
    view.y = cell.y;
    view.green = cell.green;
    view.dry = cell.dry;
    view.seeds = cell.seeds;
    view.rootBiomass = cell.rootBiomass;
    view.moisture = cell.moisture;
    view.grazingPressure = cell.grazingPressure;
    view.phase = cell.phase;
    view.barrenAge = cell.barrenAge;
    view.gridColumn = cell.gridColumn;
    view.gridRow = cell.gridRow;
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
      green: 0,
      dry: 0,
      seeds: 0,
      rootBiomass: 0,
    };
    Object.defineProperty(view, "fertility", {
      enumerable: true,
      configurable: false,
      get() { return cell.fertility; },
      set(value) { cell.fertility = value; },
    });
    copyRenderSnapshot(view, cell);
    return view;
  }

  function syncRenderViews() {
    if (!isCompleteGrid(state.terrainCells)) return;
    if (renderViews.length !== cellCount || !renderViews.every((view) => view?.isTerrainRenderCell)) {
      renderViews = state.terrainCells.map(createRenderView);
      return;
    }
    for (let index = 0; index < state.terrainCells.length; index += 1) {
      copyRenderSnapshot(renderViews[index], state.terrainCells[index]);
    }
  }

  function publishTerrain(cells) {
    if (!isCompleteGrid(cells)) {
      throw new Error(`Terrain grid must contain ${cellCount} canonical cells`);
    }
    state.terrainCells = cells.map(normalizeCanonicalCell);
    invalidatedByLegacyReplacement = false;
    suppressExternalWrite = true;
    renderViews = state.terrainCells.map(createRenderView);
    suppressExternalWrite = false;
    return state.terrainCells;
  }

  LG.initializeVegetationGrid = (options = {}) => {
    const cells = withTerrainCells(() => original.initializeVegetationGrid(options));
    return publishTerrain(cells);
  };

  LG.getTerrainCells = () => {
    if (isCompleteGrid(state.terrainCells)) return state.terrainCells;
    if (invalidatedByLegacyReplacement) return [];
    return LG.initializeVegetationGrid();
  };

  LG.getVegetationCell = (column, row) => {
    const cells = LG.getTerrainCells();
    if (!cells.length) return null;
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
    if (!cells.length) return [];
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

  LG.createPatch = (...args) => {
    const result = withTerrainCells(() => original.createPatch(...args));
    syncRenderViews();
    return result;
  };
  LG.seedPatchAt = (...args) => {
    const result = withTerrainCells(() => original.seedPatchAt(...args));
    syncRenderViews();
    return result;
  };
  LG.findPatchNear = (...args) => withTerrainCells(() => original.findPatchNear(...args));
  LG.getResourceTotals = () => withTerrainCells(() => original.getResourceTotals());
  LG.hasDormantPlantLife = () => withTerrainCells(() => original.hasDormantPlantLife());
  LG.getVegetationDiagnostics = () => withTerrainCells(() => original.getVegetationDiagnostics());

  const updateTerrain = (dt) => {
    const result = withTerrainCells(() => original.updateVegetationGrid(dt));
    syncRenderViews();
    return result;
  };
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
    version: "terrain-store-v4",
    source: "state.terrainCells",
    renderSource: "detached-state.patches-snapshots",
    renderViewsOwnFood: false,
    externalLegacyReplacementInvalidatesTerrain: true,
    canonicalCellsHaveCircularRadius: false,
    sharedCellIdentityWithLegacyPatches: false,
    legacyPatchCollectionFeedsAnimals: false,
    columns: GRID.columns,
    rows: GRID.rows,
    cellCount,
  });
})();
