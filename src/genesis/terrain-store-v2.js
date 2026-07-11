(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Terrain store requires LittleGod core");
  if (!LG.GRID || typeof LG.initializeVegetationGrid !== "function") {
    throw new Error("Terrain store requires world-v2.js");
  }

  const { state, GRID, WORLD } = LG;
  const cellCount = GRID.columns * GRID.rows;
  const originalInitializeVegetationGrid = LG.initializeVegetationGrid;

  function isCompleteGrid(cells) {
    return Array.isArray(cells)
      && cells.length === cellCount
      && cells.every((cell) => cell?.isGridCell === true);
  }

  function publishTerrain(cells) {
    const terrainCells = cells.filter((cell) => cell?.isGridCell === true);
    if (terrainCells.length !== cellCount) {
      throw new Error(`Terrain grid must contain ${cellCount} cells`);
    }
    state.terrainCells = terrainCells.slice();
    return state.terrainCells;
  }

  LG.initializeVegetationGrid = (options = {}) => {
    const cells = originalInitializeVegetationGrid(options);
    return publishTerrain(cells);
  };

  LG.getTerrainCells = () => {
    if (isCompleteGrid(state.terrainCells)) return state.terrainCells;
    if (isCompleteGrid(state.patches)) return publishTerrain(state.patches);
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
        if ((cell.x - x) ** 2 + (cell.y - y) ** 2 <= radiusSquared) nearby.push(cell);
      }
    }
    return nearby;
  };

  LG.terrainStoreModel = Object.freeze({
    version: "terrain-store-v1",
    source: "state.terrainCells",
    legacyPatchCollectionFeedsAnimals: false,
    columns: GRID.columns,
    rows: GRID.rows,
    cellCount,
  });
})();
