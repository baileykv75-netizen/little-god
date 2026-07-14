(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Grass texture requires LittleGod core");

  const { state, WORLD, GRID } = LG;
  const ASSET_PATH = "art/terrain/grass-base.png";
  const CELL_PIXELS = 8;
  const TILE_PIXELS = 32;
  const REBUILD_INTERVAL_MS = 250;

  const textureRaster = document.createElement("canvas");
  textureRaster.width = GRID.columns * CELL_PIXELS;
  textureRaster.height = GRID.rows * CELL_PIXELS;
  const textureContext = textureRaster.getContext("2d");

  const maskRaster = document.createElement("canvas");
  maskRaster.width = textureRaster.width;
  maskRaster.height = textureRaster.height;
  const maskContext = maskRaster.getContext("2d");

  const tileRaster = document.createElement("canvas");
  tileRaster.width = TILE_PIXELS;
  tileRaster.height = TILE_PIXELS;
  const tileContext = tileRaster.getContext("2d");

  const asset = {
    path: ASSET_PATH,
    status: "loading",
    width: 0,
    height: 0,
    error: null,
  };

  let overlayCanvas = null;
  let overlayContext = null;
  let lastBuildTime = -Infinity;
  let lastSeason = null;
  let textureReady = false;
  let renderedFrames = 0;
  let texturedCells = 0;
  let meanCoverage = 0;
  let fallbackReason = "asset-loading";

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const smoothstep = (edge0, edge1, value) => {
    const amount = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
    return amount * amount * (3 - 2 * amount);
  };

  function terrainCells() {
    if (typeof LG.getTerrainCells === "function") return LG.getTerrainCells();
    if (Array.isArray(state.terrainCells)) return state.terrainCells;
    if (Array.isArray(state.patches)) return state.patches;
    return null;
  }

  function field(cells, x, y, key) {
    const x0 = Math.max(0, Math.min(GRID.columns - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(GRID.rows - 1, Math.floor(y)));
    const x1 = Math.min(GRID.columns - 1, x0 + 1);
    const y1 = Math.min(GRID.rows - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = Number(cells[y0 * GRID.columns + x0]?.[key]) || 0;
    const b = Number(cells[y0 * GRID.columns + x1]?.[key]) || 0;
    const c = Number(cells[y1 * GRID.columns + x0]?.[key]) || 0;
    const d = Number(cells[y1 * GRID.columns + x1]?.[key]) || 0;
    return mix(mix(a, b, tx), mix(c, d, tx), ty);
  }

  function seasonStrength() {
    if (state.season === "spring") return 1;
    if (state.season === "summer") return 0.92;
    if (state.season === "autumn") return 0.62;
    return 0.34;
  }

  function prepareTile(image) {
    tileContext.clearRect(0, 0, TILE_PIXELS, TILE_PIXELS);
    tileContext.imageSmoothingEnabled = true;
    tileContext.drawImage(image, 0, 0, TILE_PIXELS, TILE_PIXELS);
  }

  function paintRepeatedTile() {
    textureContext.clearRect(0, 0, textureRaster.width, textureRaster.height);
    textureContext.globalCompositeOperation = "source-over";
    textureContext.globalAlpha = 1;
    for (let y = 0; y < textureRaster.height; y += TILE_PIXELS) {
      for (let x = 0; x < textureRaster.width; x += TILE_PIXELS) {
        textureContext.drawImage(tileRaster, x, y, TILE_PIXELS, TILE_PIXELS);
      }
    }
  }

  function rebuildTexture() {
    if (asset.status !== "ready") {
      textureReady = false;
      fallbackReason = asset.status === "error" ? "asset-error" : "asset-loading";
      return false;
    }

    const cells = terrainCells();
    if (!Array.isArray(cells) || cells.length !== GRID.columns * GRID.rows) {
      textureReady = false;
      fallbackReason = "terrain-cells-unavailable";
      return false;
    }

    paintRepeatedTile();
    const mask = maskContext.createImageData(maskRaster.width, maskRaster.height);
    const pixels = mask.data;
    const maxGreen = GRID.maxGreen || 12;
    const maxDry = GRID.maxDry || 10;
    const maxRoots = GRID.maxRoots || 10;
    const seasonal = seasonStrength();
    let coverageSum = 0;
    let coveredCellCount = 0;

    for (let row = 0; row < GRID.rows; row += 1) {
      for (let column = 0; column < GRID.columns; column += 1) {
        const cell = cells[row * GRID.columns + column];
        const green = clamp01((Number(cell?.green) || 0) / maxGreen);
        const roots = clamp01((Number(cell?.rootBiomass) || 0) / maxRoots);
        const dry = clamp01((Number(cell?.dry) || 0) / maxDry);
        const pressure = clamp01((Number(cell?.grazingPressure) || 0) / 8);
        const cellCoverage = clamp01(green * 0.88 + roots * 0.12 - dry * 0.16 - pressure * 0.22);
        coverageSum += cellCoverage;
        if (cellCoverage >= 0.08) coveredCellCount += 1;
      }
    }

    for (let py = 0; py < maskRaster.height; py += 1) {
      const gy = py / CELL_PIXELS;
      for (let px = 0; px < maskRaster.width; px += 1) {
        const gx = px / CELL_PIXELS;
        const green = clamp01(field(cells, gx, gy, "green") / maxGreen);
        const roots = clamp01(field(cells, gx, gy, "rootBiomass") / maxRoots);
        const dry = clamp01(field(cells, gx, gy, "dry") / maxDry);
        const pressure = clamp01(field(cells, gx, gy, "grazingPressure") / 8);
        const coverage = clamp01(green * 0.88 + roots * 0.12 - dry * 0.16 - pressure * 0.22);
        const alpha = Math.round(smoothstep(0.035, 0.72, coverage) * seasonal * 96);
        const offset = (py * maskRaster.width + px) * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = alpha;
      }
    }

    maskContext.putImageData(mask, 0, 0);
    textureContext.save();
    textureContext.globalCompositeOperation = "destination-in";
    textureContext.drawImage(maskRaster, 0, 0);
    textureContext.restore();

    texturedCells = coveredCellCount;
    meanCoverage = coverageSum / cells.length;
    textureReady = true;
    fallbackReason = null;
    return true;
  }

  function resizeOverlay() {
    const baseCanvas = document.querySelector("#worldCanvas");
    if (!baseCanvas || !overlayCanvas) return false;
    if (overlayCanvas.width !== baseCanvas.width) overlayCanvas.width = baseCanvas.width;
    if (overlayCanvas.height !== baseCanvas.height) overlayCanvas.height = baseCanvas.height;
    return true;
  }

  function renderFrame(timestamp = 0) {
    if (!overlayCanvas || !overlayContext || !LG.camera) return false;
    resizeOverlay();
    if (timestamp - lastBuildTime >= REBUILD_INTERVAL_MS || state.season !== lastSeason) {
      rebuildTexture();
      lastBuildTime = timestamp;
      lastSeason = state.season;
    }

    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (textureReady) {
      overlayContext.save();
      LG.camera.apply(overlayContext);
      overlayContext.imageSmoothingEnabled = true;
      overlayContext.imageSmoothingQuality = "high";
      overlayContext.drawImage(textureRaster, 0, 0, WORLD.width, WORLD.height);
      overlayContext.restore();
    }
    renderedFrames += 1;
    return true;
  }

  function mountOverlay() {
    const baseCanvas = document.querySelector("#worldCanvas");
    const frame = document.querySelector(".world-frame");
    if (!baseCanvas || !frame || overlayCanvas) return false;

    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "grassTextureCanvas";
    overlayCanvas.setAttribute("aria-hidden", "true");
    Object.assign(overlayCanvas.style, {
      position: "absolute",
      inset: "0",
      zIndex: "1",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      mixBlendMode: "soft-light",
    });
    overlayContext = overlayCanvas.getContext("2d");
    resizeOverlay();
    frame.append(overlayCanvas);

    const loop = (timestamp) => {
      renderFrame(timestamp);
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
    return true;
  }

  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    try {
      asset.width = Number(image.naturalWidth || image.width) || 0;
      asset.height = Number(image.naturalHeight || image.height) || 0;
      prepareTile(image);
      asset.status = "ready";
      fallbackReason = null;
      lastBuildTime = -Infinity;
    } catch (error) {
      asset.status = "error";
      asset.error = String(error?.message || error);
      fallbackReason = "asset-error";
    }
  };
  image.onerror = () => {
    asset.status = "error";
    asset.error = `Failed to load ${ASSET_PATH}`;
    fallbackReason = "asset-error";
  };
  image.src = ASSET_PATH;

  LG.renderGrassTextureFrame = renderFrame;
  LG.getTerrainArtDiagnostics = () => ({
    version: "terrain-art-v1",
    overlayMounted: Boolean(overlayCanvas && overlayContext),
    renderedFrames,
    textureReady,
    texturedCells,
    meanCoverage,
    fallbackReason,
    rasterWidth: textureRaster.width,
    rasterHeight: textureRaster.height,
    asset: { ...asset },
  });
  LG.terrainArtModel = Object.freeze({
    version: "terrain-art-v1",
    integratedTiles: Object.freeze(["grass-base"]),
    renderer: "camera-aware-overlay-canvas",
    ecologyDrivenMask: true,
    programTerrainFallback: true,
    preservesPointerInteraction: true,
    waterEnabled: false,
    riverbanksEnabled: false,
  });

  if (document.readyState === "complete") mountOverlay();
  else window.addEventListener("load", mountOverlay, { once: true });
})();
