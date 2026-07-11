(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Continuous terrain renderer requires LittleGod core");

  const { state, WORLD, GRID, SPECIES } = LG;
  const canvas = document.querySelector("#worldCanvas");
  if (!canvas) throw new Error("Continuous terrain renderer requires #worldCanvas");
  const ctx = canvas.getContext("2d");

  const raster = document.createElement("canvas");
  raster.width = GRID.columns * 2;
  raster.height = GRID.rows * 2;
  const rasterCtx = raster.getContext("2d", { alpha: false });
  const image = rasterCtx.createImageData(raster.width, raster.height);
  const grazerActivity = new Float32Array(GRID.columns * GRID.rows);
  const hunterActivity = new Float32Array(GRID.columns * GRID.rows);

  let lastRasterTime = -Infinity;
  let lastSeason = null;
  let latestHeatmapDiagnostics = null;

  state.showActivityHeatmap = Boolean(state.showActivityHeatmap);

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const smoothstep = (edge0, edge1, value) => {
    const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
    return t * t * (3 - 2 * t);
  };

  function palette() {
    if (state.season === "spring") {
      return { base: [184, 211, 162], soil: [151, 129, 91], dry: [199, 165, 91], green: [66, 148, 84] };
    }
    if (state.season === "summer") {
      return { base: [170, 204, 145], soil: [148, 124, 84], dry: [192, 157, 80], green: [57, 137, 76] };
    }
    if (state.season === "autumn") {
      return { base: [196, 198, 144], soil: [154, 126, 83], dry: [202, 158, 73], green: [83, 137, 78] };
    }
    return { base: [171, 195, 188], soil: [143, 128, 104], dry: [177, 154, 105], green: [79, 126, 101] };
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

  function sampled(values, x, y) {
    const x0 = Math.max(0, Math.min(GRID.columns - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(GRID.rows - 1, Math.floor(y)));
    const x1 = Math.min(GRID.columns - 1, x0 + 1);
    const y1 = Math.min(GRID.rows - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const a = values[y0 * GRID.columns + x0] || 0;
    const b = values[y0 * GRID.columns + x1] || 0;
    const c = values[y1 * GRID.columns + x0] || 0;
    const d = values[y1 * GRID.columns + x1] || 0;
    return mix(mix(a, b, tx), mix(c, d, tx), ty);
  }

  function addActivity(values, animal, amount) {
    const column = Math.max(0, Math.min(GRID.columns - 1, Math.floor(animal.x / GRID.cellWidth)));
    const row = Math.max(0, Math.min(GRID.rows - 1, Math.floor(animal.y / GRID.cellHeight)));
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nextColumn = column + dx;
        const nextRow = row + dy;
        if (nextColumn < 0 || nextColumn >= GRID.columns || nextRow < 0 || nextRow >= GRID.rows) continue;
        const distanceWeight = dx === 0 && dy === 0 ? 1 : (dx === 0 || dy === 0 ? 0.42 : 0.22);
        values[nextRow * GRID.columns + nextColumn] += amount * distanceWeight;
      }
    }
  }

  function rebuildActivityFields(cells) {
    grazerActivity.fill(0);
    hunterActivity.fill(0);
    for (const grazer of state.grazers || []) addActivity(grazerActivity, grazer, 1);
    for (const hunter of state.hunters || []) addActivity(hunterActivity, hunter, 1.35);

    const hotspots = [];
    let peakIntensity = 0;
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      const grazing = clamp01((Number(cell.grazingPressure) || 0) / 8);
      const grazers = clamp01(grazerActivity[index] / 3);
      const hunters = clamp01(hunterActivity[index] / 2);
      const intensity = clamp01(grazing * 0.68 + grazers * 0.5 + hunters * 0.72);
      peakIntensity = Math.max(peakIntensity, intensity);
      if (intensity >= 0.12) {
        hotspots.push({
          column: cell.gridColumn ?? index % GRID.columns,
          row: cell.gridRow ?? Math.floor(index / GRID.columns),
          intensity,
          grazerActivity: grazerActivity[index],
          hunterActivity: hunterActivity[index],
          grazingPressure: Number(cell.grazingPressure) || 0,
        });
      }
    }
    hotspots.sort((a, b) => b.intensity - a.intensity);
    latestHeatmapDiagnostics = {
      enabled: state.showActivityHeatmap,
      cellsWithActivity: hotspots.length,
      peakIntensity,
      hotspots: hotspots.slice(0, 12),
    };
  }

  function rebuildRaster() {
    const cells = typeof LG.getTerrainCells === "function" ? LG.getTerrainCells() : state.terrainCells;
    if (!Array.isArray(cells) || cells.length !== GRID.columns * GRID.rows) return false;

    rebuildActivityFields(cells);
    const colors = palette();
    const maxGreen = GRID.maxGreen || 12;
    const maxDry = GRID.maxDry || 10;
    const maxRoots = GRID.maxRoots || 10;
    const data = image.data;

    for (let py = 0; py < raster.height; py += 1) {
      const gy = py / 2;
      for (let px = 0; px < raster.width; px += 1) {
        const gx = px / 2;
        const worldX = gx * GRID.cellWidth;
        const worldY = gy * GRID.cellHeight;
        const noise = (
          Math.sin(worldX * 0.013 + Math.sin(worldY * 0.009) * 1.7)
          + Math.sin(worldY * 0.017 - worldX * 0.004)
        ) * 0.035;
        const green = clamp01(field(cells, gx, gy, "green") / maxGreen);
        const dry = clamp01(field(cells, gx, gy, "dry") / maxDry);
        const roots = clamp01(field(cells, gx, gy, "rootBiomass") / maxRoots);
        const fertility = clamp01((field(cells, gx, gy, "fertility") - 0.35) / 0.95);
        const pressure = clamp01(field(cells, gx, gy, "grazingPressure") / 8);

        const soilAmount = clamp01(0.08 + fertility * 0.12 + pressure * 0.35);
        const dryAmount = smoothstep(0.02, 0.5, dry + noise * 0.4);
        const greenAmount = smoothstep(0.035, 0.62, green + roots * 0.055 + noise - pressure * 0.05);

        let red = mix(colors.base[0], colors.soil[0], soilAmount);
        let greenChannel = mix(colors.base[1], colors.soil[1], soilAmount);
        let blue = mix(colors.base[2], colors.soil[2], soilAmount);
        red = mix(red, colors.dry[0], dryAmount * 0.72);
        greenChannel = mix(greenChannel, colors.dry[1], dryAmount * 0.72);
        blue = mix(blue, colors.dry[2], dryAmount * 0.72);
        red = mix(red, colors.green[0], greenAmount * 0.92);
        greenChannel = mix(greenChannel, colors.green[1], greenAmount * 0.92);
        blue = mix(blue, colors.green[2], greenAmount * 0.92);

        if (state.showActivityHeatmap) {
          const grazerHeat = clamp01(sampled(grazerActivity, gx, gy) / 3);
          const hunterHeat = clamp01(sampled(hunterActivity, gx, gy) / 2);
          const heat = clamp01(pressure * 0.68 + grazerHeat * 0.5 + hunterHeat * 0.72);
          if (heat > 0.015) {
            const hunterShare = hunterHeat / Math.max(0.001, grazerHeat + hunterHeat);
            const heatRed = mix(238, 126, hunterShare);
            const heatGreen = mix(159, 82, hunterShare);
            const heatBlue = mix(54, 186, hunterShare);
            const opacity = smoothstep(0.02, 0.78, heat) * 0.62;
            red = mix(red, heatRed, opacity);
            greenChannel = mix(greenChannel, heatGreen, opacity);
            blue = mix(blue, heatBlue, opacity);
          }
        }

        const index = (py * raster.width + px) * 4;
        data[index] = Math.round(red);
        data[index + 1] = Math.round(greenChannel);
        data[index + 2] = Math.round(blue);
        data[index + 3] = 255;
      }
    }
    rasterCtx.putImageData(image, 0, 0);
    return true;
  }

  function drawDecor() {
    for (const decor of state.decor || []) {
      if (!LG.camera?.isVisible(decor, 180)) continue;
      ctx.save();
      ctx.translate(decor.x, decor.y);
      ctx.rotate(decor.rotation);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = decor.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, decor.radiusX, decor.radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawGrazer(animal, timestamp) {
    if (!LG.camera?.isVisible(animal, 30)) return;
    const stage = LG.lifeStage(animal);
    const scale = (stage === "juvenile" ? 0.7 : stage === "elder" ? 0.92 : 1)
      * (animal.id === state.selectedIndividualId ? 1.18 : 1);
    const bob = Math.sin(timestamp * 0.006 + animal.bobPhase) * 0.7;
    ctx.save();
    ctx.translate(animal.x, animal.y + bob);
    ctx.rotate(animal.angle);
    ctx.scale(scale, scale);
    ctx.globalAlpha = stage === "elder" ? 0.72 : 1;
    ctx.strokeStyle = "rgba(211,142,49,.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-11, 0);
    ctx.stroke();
    ctx.fillStyle = "#e6ad4a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.4, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5cc73";
    ctx.beginPath();
    ctx.arc(4.7, -0.6, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d08b38";
    ctx.beginPath();
    ctx.ellipse(4.2, -4, 1.2, 2.5, -0.35, 0, Math.PI * 2);
    ctx.ellipse(6.7, -3.6, 1.2, 2.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHunter(animal, timestamp) {
    if (!LG.camera?.isVisible(animal, 32)) return;
    const stage = LG.lifeStage(animal);
    const scale = (stage === "juvenile" ? 0.72 : stage === "elder" ? 0.93 : 1)
      * (animal.id === state.selectedIndividualId ? 1.18 : 1);
    const bob = Math.sin(timestamp * 0.007 + animal.bobPhase) * 0.55;
    ctx.save();
    ctx.translate(animal.x, animal.y + bob);
    ctx.rotate(animal.angle);
    ctx.scale(scale, scale);
    ctx.globalAlpha = stage === "elder" ? 0.74 : 1;
    ctx.strokeStyle = "rgba(91,68,137,.36)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();
    ctx.fillStyle = "#7960aa";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-1, -6);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-1, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f6e7a9";
    ctx.beginPath();
    ctx.arc(4, -1.8, 0.85, 0, Math.PI * 2);
    ctx.arc(4, 1.8, 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCarcass(carcass) {
    if (!LG.camera?.isVisible(carcass, 24)) return;
    ctx.save();
    ctx.translate(carcass.x, carcass.y);
    ctx.rotate(carcass.id * 0.73);
    ctx.globalAlpha = LG.clamp(carcass.biomass / 30, 0.18, 0.85);
    ctx.fillStyle = carcass.sourceType === "grazer" ? "#8a6b4f" : "#665672";
    ctx.fillRect(-4, -1.5, 8, 3);
    ctx.restore();
  }

  function drawEffects() {
    for (const effect of state.effects || []) {
      const duration = effect.kind === "lunge" ? 0.35 : 0.7;
      const progress = effect.age / duration;
      if (progress >= 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = (3 - progress * 2) / (LG.camera?.zoom || 1);
      if (effect.kind === "lunge") {
        ctx.translate(effect.x, effect.y);
        ctx.rotate(effect.angle || 0);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(34 + progress * 18, 0);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 8 + progress * 34, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawSelection() {
    const selected = [...state.grazers, ...state.hunters]
      .find((animal) => animal.id === state.selectedIndividualId);
    if (!selected || !LG.camera?.isVisible(selected, 50)) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,246,174,.98)";
    ctx.lineWidth = 2.2 / (LG.camera.zoom || 1);
    ctx.beginPath();
    ctx.arc(selected.x, selected.y, 15 / (LG.camera.zoom || 1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPreview() {
    if (!state.pointer?.inside) return;
    const config = SPECIES[state.selectedSpecies];
    if (!config) return;
    const radius = (state.selectedSpecies === "flora" ? 28 : 18) / (LG.camera?.zoom || 1);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.setLineDash([5 / (LG.camera.zoom || 1), 6 / (LG.camera.zoom || 1)]);
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 1.5 / (LG.camera.zoom || 1);
    ctx.beginPath();
    ctx.arc(state.pointer.x, state.pointer.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function renderFrame(timestamp) {
    if (!LG.camera) return;
    if (timestamp - lastRasterTime >= 100 || state.season !== lastSeason) {
      if (rebuildRaster()) {
        lastRasterTime = timestamp;
        lastSeason = state.season;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    LG.camera.apply(ctx);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(raster, 0, 0, WORLD.width, WORLD.height);
    drawDecor();
    ctx.strokeStyle = "rgba(255,255,255,.42)";
    ctx.lineWidth = 3 / (LG.camera.zoom || 1);
    ctx.strokeRect(2, 2, WORLD.width - 4, WORLD.height - 4);
    for (const carcass of state.carcasses) drawCarcass(carcass);
    for (const grazer of state.grazers) drawGrazer(grazer, timestamp);
    for (const hunter of state.hunters) drawHunter(hunter, timestamp);
    drawEffects();
    drawSelection();
    drawPreview();
    ctx.restore();
  }

  function syncHeatmapButton(button) {
    button.setAttribute("aria-pressed", String(state.showActivityHeatmap));
    button.textContent = state.showActivityHeatmap ? "热区开" : "热区";
    button.title = state.showActivityHeatmap
      ? "关闭活动热区：橙色表示食草与啃食压力，紫色表示猎食兽活动"
      : "显示活动热区：观察动物聚集和啃食压力";
  }

  function injectHeatmapControl() {
    const controls = document.querySelector("#cameraControls");
    if (!controls || document.querySelector("#activityHeatmapToggle")) return;
    const button = document.createElement("button");
    button.id = "activityHeatmapToggle";
    button.type = "button";
    button.className = "camera-fit";
    syncHeatmapButton(button);
    button.addEventListener("click", () => {
      state.showActivityHeatmap = !state.showActivityHeatmap;
      lastRasterTime = -Infinity;
      syncHeatmapButton(button);
      LG.showToast?.(state.showActivityHeatmap ? "活动热区已开启" : "活动热区已关闭");
    });
    controls.append(button);
  }

  LG.renderContinuousTerrainFrame = renderFrame;
  LG.getActivityHeatmapDiagnostics = () => ({
    ...(latestHeatmapDiagnostics || {
      enabled: state.showActivityHeatmap,
      cellsWithActivity: 0,
      peakIntensity: 0,
      hotspots: [],
    }),
    enabled: state.showActivityHeatmap,
    hotspots: (latestHeatmapDiagnostics?.hotspots || []).map((hotspot) => ({ ...hotspot })),
  });
  LG.terrainRendererModel = Object.freeze({
    version: "continuous-raster-v2",
    source: "state.terrainCells",
    gridColumns: GRID.columns,
    gridRows: GRID.rows,
    rasterColumns: raster.width,
    rasterRows: raster.height,
    usesLegacyPatchShapes: false,
    smoothInterpolation: true,
    activityHeatmap: true,
  });

  injectHeatmapControl();

  function loop(timestamp) {
    renderFrame(timestamp);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
