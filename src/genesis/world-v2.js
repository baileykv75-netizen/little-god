(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Genesis world-v2 requires core.js");

  const previousWorld = LG.WORLD;
  LG.WORLD = Object.freeze({
    ...previousWorld,
    width: 2048,
    height: 1280,
    viewportWidth: 960,
    viewportHeight: 600,
    movementScale: 3,
    maxPatches: 64 * 40,
  });

  const { WORLD, SPECIES } = LG;

  LG.GRID = Object.freeze({
    columns: 64,
    rows: 40,
    cellWidth: WORLD.width / 64,
    cellHeight: WORLD.height / 40,
    maxGreen: 12,
    maxDry: 10,
    maxSeeds: 8,
    maxRoots: 10,
  });

  const GRID = LG.GRID;
  const GRID_CELL_COUNT = GRID.columns * GRID.rows;

  const vegetationTotals = () => ({
    green: 0,
    dry: 0,
    seeds: 0,
    roots: 0,
    fertility: 0,
  });

  function resetVegetationMetrics() {
    LG.state.vegetationMetrics = {
      greenGrowth: 0,
      winterWither: 0,
      dryDecomposed: 0,
      seedProduced: 0,
      seedDecayed: 0,
      seedGerminated: 0,
      rootGained: 0,
      rootLost: 0,
      grazingRemoved: 0,
    };
  }

  function createGridCell(column, row) {
    const cell = {
      id: row * GRID.columns + column + 1,
      type: "flora",
      gridColumn: column,
      gridRow: row,
      isGridCell: true,
      x: (column + 0.5) * GRID.cellWidth,
      y: (row + 0.5) * GRID.cellHeight,
      radius: Math.max(GRID.cellWidth, GRID.cellHeight) * 0.72,
      dry: 0,
      seeds: 0,
      rootBiomass: 0,
      fertility: LG.clamp(0.72 + Math.sin(column * 0.57 + row * 0.31) * 0.09 + Math.cos(row * 0.43) * 0.06, 0.5, 1.05),
      moisture: LG.clamp(0.62 + Math.sin(column * 0.21 - row * 0.17) * 0.11, 0.35, 0.9),
      grazingPressure: 0,
      lastDisturbedYear: -Infinity,
      phase: (column * 1.7 + row * 2.3) % (Math.PI * 2),
      spreadCooldown: 0,
      barrenAge: 0,
      lineageId: "flora-primordial",
      generation: 0,
      _green: 0,
    };

    Object.defineProperty(cell, "green", {
      enumerable: true,
      configurable: false,
      get() {
        return this._green;
      },
      set(value) {
        const next = LG.clamp(Number.isFinite(value) ? value : 0, 0, GRID.maxGreen);
        if (!LG._vegetationInternalUpdate && next < this._green) {
          const removed = this._green - next;
          this.grazingPressure += removed;
          this.lastDisturbedYear = LG.state.year;
          if (LG.state.vegetationMetrics) LG.state.vegetationMetrics.grazingRemoved += removed;
        }
        this._green = next;
      },
    });

    return cell;
  }

  LG.initializeVegetationGrid = ({ blank = true } = {}) => {
    LG._vegetationInternalUpdate = true;
    LG.state.patches = [];
    for (let row = 0; row < GRID.rows; row += 1) {
      for (let column = 0; column < GRID.columns; column += 1) {
        LG.state.patches.push(createGridCell(column, row));
      }
    }
    LG._vegetationInternalUpdate = false;
    resetVegetationMetrics();
    if (!blank) LG.seedPatchAt(WORLD.width / 2, WORLD.height / 2);
    return LG.state.patches;
  };

  function ensureGrid() {
    if (
      LG.state.patches.length !== GRID_CELL_COUNT
      || !LG.state.patches[0]?.isGridCell
    ) {
      LG.initializeVegetationGrid();
    }
    return LG.state.patches;
  }

  LG.gridIndex = (column, row) => row * GRID.columns + column;

  LG.getVegetationCell = (column, row) => {
    ensureGrid();
    const safeColumn = LG.clamp(Math.floor(column), 0, GRID.columns - 1);
    const safeRow = LG.clamp(Math.floor(row), 0, GRID.rows - 1);
    return LG.state.patches[LG.gridIndex(safeColumn, safeRow)];
  };

  LG.getVegetationCellAt = (x, y) => LG.getVegetationCell(
    Math.floor(LG.clamp(x, 0, WORLD.width - 0.001) / GRID.cellWidth),
    Math.floor(LG.clamp(y, 0, WORLD.height - 0.001) / GRID.cellHeight),
  );

  LG.getVegetationCellsInRadius = (x, y, radius) => {
    ensureGrid();
    const minColumn = LG.clamp(Math.floor((x - radius) / GRID.cellWidth), 0, GRID.columns - 1);
    const maxColumn = LG.clamp(Math.floor((x + radius) / GRID.cellWidth), 0, GRID.columns - 1);
    const minRow = LG.clamp(Math.floor((y - radius) / GRID.cellHeight), 0, GRID.rows - 1);
    const maxRow = LG.clamp(Math.floor((y + radius) / GRID.cellHeight), 0, GRID.rows - 1);
    const radiusSquared = radius * radius;
    const cells = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const cell = LG.state.patches[LG.gridIndex(column, row)];
        if ((cell.x - x) ** 2 + (cell.y - y) ** 2 <= radiusSquared) cells.push(cell);
      }
    }
    return cells;
  };

  function applyVegetationBrush(x, y, options = {}) {
    ensureGrid();
    const radius = LG.clamp(options.radius ?? 92, 28, 180);
    const greenPeak = options.green === 0 ? 0 : LG.clamp((options.green ?? 82) / 9, 2.5, GRID.maxGreen);
    const dryPeak = LG.clamp((options.dry ?? 10) / 3, 0, GRID.maxDry);
    const seedPeak = LG.clamp((options.seeds ?? 44) / 7, 0, GRID.maxSeeds);
    const rootPeak = LG.clamp((options.rootBiomass ?? 54) / 6, 0, GRID.maxRoots);
    const fertilityTarget = LG.clamp(options.fertility ?? 0.92, 0.45, 1.2);
    const cells = LG.getVegetationCellsInRadius(x, y, radius);
    let centerCell = LG.getVegetationCellAt(x, y);

    LG._vegetationInternalUpdate = true;
    for (const cell of cells) {
      const distance = Math.hypot(cell.x - x, cell.y - y);
      const normalized = LG.clamp(1 - distance / radius, 0, 1);
      const weight = normalized * normalized * (3 - 2 * normalized);
      if (weight <= 0) continue;
      cell.green = Math.max(cell.green, greenPeak * (0.28 + weight * 0.72));
      cell.dry = LG.clamp(Math.max(cell.dry, dryPeak * weight), 0, GRID.maxDry);
      cell.seeds = LG.clamp(Math.max(cell.seeds, seedPeak * (0.35 + weight * 0.65)), 0, GRID.maxSeeds);
      cell.rootBiomass = LG.clamp(Math.max(cell.rootBiomass, rootPeak * (0.35 + weight * 0.65)), 0, GRID.maxRoots);
      cell.fertility = LG.clamp(cell.fertility * 0.55 + fertilityTarget * 0.45, 0.35, 1.3);
      cell.lineageId = options.lineageId || cell.lineageId;
      cell.generation = options.generation || cell.generation;
      cell.barrenAge = 0;
      if (distance < Math.hypot(centerCell.x - x, centerCell.y - y)) centerCell = cell;
    }
    LG._vegetationInternalUpdate = false;
    return centerCell;
  }

  LG.createPatch = (x, y, options = {}) => applyVegetationBrush(x, y, options);
  LG.seedPatchAt = (x, y) => applyVegetationBrush(x, y, {
    radius: 105,
    green: 96,
    dry: 12,
    seeds: 58,
    rootBiomass: 66,
    fertility: 1.02,
  });

  LG.findPatchNear = (x, y, radius = 58) => {
    const candidates = LG.getVegetationCellsInRadius(x, y, Math.max(radius, GRID.cellWidth));
    let nearest = null;
    let bestDistance = Infinity;
    for (const cell of candidates) {
      const distance = (cell.x - x) ** 2 + (cell.y - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = cell;
      }
    }
    return nearest || LG.getVegetationCellAt(x, y);
  };

  LG.getResourceTotals = () => {
    ensureGrid();
    return LG.state.patches.reduce((totals, cell) => {
      totals.green += cell.green;
      totals.dry += cell.dry;
      totals.seeds += cell.seeds;
      totals.roots += cell.rootBiomass;
      totals.fertility += cell.fertility;
      return totals;
    }, vegetationTotals());
  };

  LG.hasDormantPlantLife = () => {
    const totals = LG.getResourceTotals();
    return totals.green + totals.dry + totals.seeds + totals.roots > 1;
  };

  function neighbourAverage(cells, column, row, key) {
    let total = 0;
    let count = 0;
    const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of offsets) {
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= GRID.columns || nextRow < 0 || nextRow >= GRID.rows) continue;
      total += cells[LG.gridIndex(nextColumn, nextRow)][key];
      count += 1;
    }
    return count ? total / count : 0;
  }

  function updateVegetationGrid(dt) {
    const cells = ensureGrid();
    const metrics = LG.state.vegetationMetrics || (resetVegetationMetrics(), LG.state.vegetationMetrics);
    const scratch = LG._vegetationScratch || {
      green: new Float32Array(GRID_CELL_COUNT),
      dry: new Float32Array(GRID_CELL_COUNT),
      seeds: new Float32Array(GRID_CELL_COUNT),
      roots: new Float32Array(GRID_CELL_COUNT),
      fertility: new Float32Array(GRID_CELL_COUNT),
      pressure: new Float32Array(GRID_CELL_COUNT),
    };
    LG._vegetationScratch = scratch;

    const fullSeasons = LG.state.rules.fullSeasons;
    const season = fullSeasons ? LG.state.season : "summer";
    const growthMultiplier = LG.state.rules.growth;
    let springGreenBefore = 0;
    let springGreenAfter = 0;

    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      const neighbourGreen = neighbourAverage(cells, cell.gridColumn, cell.gridRow, "green");
      const neighbourRoots = neighbourAverage(cells, cell.gridColumn, cell.gridRow, "rootBiomass");
      const greenBefore = cell.green;
      const dryBefore = cell.dry;
      const rootsBefore = cell.rootBiomass;
      const seedsBefore = cell.seeds;
      let green = greenBefore;
      let dry = dryBefore;
      let roots = rootsBefore;
      let seeds = seedsBefore;
      let fertility = cell.fertility;

      const litterSuppression = 1 - LG.clamp(dry / GRID.maxDry, 0, 1) * 0.28;
      const capacity = GRID.maxGreen * (0.58 + fertility * 0.32 + cell.moisture * 0.1);
      const space = LG.clamp(1 - green / Math.max(1, capacity), 0, 1);
      const rootSupport = 0.18 + roots / GRID.maxRoots * 0.82;
      const neighbourSupport = (neighbourGreen / GRID.maxGreen * 0.7 + neighbourRoots / GRID.maxRoots * 0.3);
      const seasonalGrowth = season === "spring" ? 8.8 : season === "summer" ? 5.6 : season === "autumn" ? 1.7 : 0;
      let growth = seasonalGrowth * growthMultiplier * fertility * cell.moisture * space * litterSuppression
        * (rootSupport + neighbourSupport * 0.18) * dt;

      if (green <= 0.05 && roots <= 0.12 && seeds <= 0.08) growth = 0;

      if (season === "spring") {
        springGreenBefore += green;
        const rootRecovery = Math.min(roots * 0.34 * dt, space * 2.4 * dt);
        green += rootRecovery;
        roots = Math.max(0, roots - rootRecovery * 0.045);
        metrics.greenGrowth += rootRecovery;
        metrics.rootLost += rootRecovery * 0.045;

        if (roots < 0.55 && seeds > 0.04 && (neighbourGreen > 0.5 || neighbourRoots > 0.4)) {
          const germinated = Math.min(seeds, (0.22 + neighbourSupport * 0.55) * fertility * dt);
          seeds -= germinated;
          roots += germinated * 0.82;
          green += germinated * 0.38;
          metrics.seedGerminated += germinated;
          metrics.rootGained += germinated * 0.82;
          metrics.greenGrowth += germinated * 0.38;
        }
      }

      if (growth > 0) {
        green += growth;
        const rootGain = growth * 0.065;
        roots += rootGain;
        metrics.greenGrowth += growth;
        metrics.rootGained += rootGain;
      }

      if (season === "autumn" && green > 0.15) {
        const seedGain = Math.min(GRID.maxSeeds - seeds, green * 0.52 * dt);
        const wither = Math.min(green, green * 0.9 * dt);
        seeds += seedGain;
        green -= wither;
        dry += wither * 0.88;
        metrics.seedProduced += seedGain;
      }

      if (season === "winter" && green > 0) {
        const withered = Math.min(green, (1.4 + green * 2.4) * dt);
        green -= withered;
        dry += withered * 0.82;
        metrics.winterWither += withered;
      }

      const dryDecayRate = season === "spring" ? 0.82 : 0.2;
      const dryDecay = Math.min(dry, dry * dryDecayRate * dt);
      dry -= dryDecay;
      fertility += dryDecay * 0.014 - Math.max(0, green - greenBefore) * 0.0045;
      metrics.dryDecomposed += dryDecay;

      const seedDecay = Math.min(seeds, seeds * 0.075 * dt);
      seeds -= seedDecay;
      metrics.seedDecayed += seedDecay;

      const rootMaintenance = roots * (season === "winter" ? 0.055 : 0.028) * dt;
      roots -= rootMaintenance;
      metrics.rootLost += rootMaintenance;
      if (green < 0.08 && dry < 0.05) {
        const exposureLoss = Math.min(roots, 0.18 * dt);
        roots -= exposureLoss;
        metrics.rootLost += exposureLoss;
      }

      scratch.green[index] = LG.clamp(green, 0, GRID.maxGreen);
      scratch.dry[index] = LG.clamp(dry, 0, GRID.maxDry);
      scratch.seeds[index] = LG.clamp(seeds, 0, GRID.maxSeeds);
      scratch.roots[index] = LG.clamp(roots, 0, GRID.maxRoots);
      scratch.fertility[index] = LG.clamp(fertility, 0.35, 1.3);
      scratch.pressure[index] = Math.max(0, cell.grazingPressure - 1.25 * dt);
      if (season === "spring") springGreenAfter += scratch.green[index];
    }

    LG._vegetationInternalUpdate = true;
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      cell.green = scratch.green[index];
      cell.dry = scratch.dry[index];
      cell.seeds = scratch.seeds[index];
      cell.rootBiomass = scratch.roots[index];
      cell.fertility = scratch.fertility[index];
      cell.grazingPressure = scratch.pressure[index];
      cell.barrenAge = cell.green + cell.dry + cell.seeds + cell.rootBiomass < 0.08
        ? cell.barrenAge + dt
        : 0;
    }
    LG._vegetationInternalUpdate = false;

    if (
      season === "spring"
      && LG.state.springBaseline
      && LG.state.springRecoveryYear !== LG.state.springBaseline.year
      && springGreenAfter >= springGreenBefore + 65
    ) {
      LG.state.springRecoveryYear = LG.state.springBaseline.year;
      LG.incrementMetric("springRecoveries");
      if (!LG.state.eventFlags.firstSpringRecovery) {
        LG.state.eventFlags.firstSpringRecovery = true;
        LG.addEvent("连续地表第一次依靠根系与局部种子完成明显春季恢复。 ");
      }
    }
  }

  LG.updateVegetationGrid = updateVegetationGrid;

  function localPlantFood(animal, radius = 175) {
    return LG.getVegetationCellsInRadius(animal.x, animal.y, radius).reduce(
      (total, cell) => total + cell.green + cell.dry * 0.35,
      0,
    );
  }

  let legacyUpdatePatches = null;
  Object.defineProperty(LG, "updatePatches", {
    configurable: true,
    get() {
      return updateVegetationGrid;
    },
    set(value) {
      legacyUpdatePatches = value;
    },
  });
  LG.getLegacyPatchUpdater = () => legacyUpdatePatches;

  let legacyLocalPlantFood = null;
  Object.defineProperty(LG, "localPlantFood", {
    configurable: true,
    get() {
      return localPlantFood;
    },
    set(value) {
      legacyLocalPlantFood = value;
    },
  });
  LG.getLegacyLocalPlantFood = () => legacyLocalPlantFood;

  LG.getVegetationDiagnostics = () => {
    const cells = ensureGrid();
    const vegetated = cells.filter((cell) => cell.green >= 0.7).length;
    const rooted = cells.filter((cell) => cell.rootBiomass >= 0.45).length;
    const bare = cells.filter((cell) => cell.green + cell.dry + cell.rootBiomass < 0.18).length;
    const hotspots = [...cells]
      .filter((cell) => cell.grazingPressure > 0.01)
      .sort((a, b) => b.grazingPressure - a.grazingPressure)
      .slice(0, 6)
      .map((cell) => ({
        column: cell.gridColumn,
        row: cell.gridRow,
        pressure: Number(cell.grazingPressure.toFixed(3)),
      }));
    return {
      columns: GRID.columns,
      rows: GRID.rows,
      cellCount: cells.length,
      vegetatedCoverage: vegetated / cells.length,
      rootCoverage: rooted / cells.length,
      bareCoverage: bare / cells.length,
      hotspots,
      budget: { ...(LG.state.vegetationMetrics || {}) },
    };
  };

  let baseTelemetrySnapshot = null;
  Object.defineProperty(LG, "telemetrySnapshot", {
    configurable: true,
    get() {
      return () => {
        const snapshot = baseTelemetrySnapshot ? baseTelemetrySnapshot() : {};
        const diagnostics = LG.getVegetationDiagnostics();
        return {
          ...snapshot,
          version: "0.4.2-grid.1",
          resources: {
            ...(snapshot.resources || {}),
            patchCount: diagnostics.vegetatedCoverage * diagnostics.cellCount,
            gridCellCount: diagnostics.cellCount,
          },
          vegetationGrid: diagnostics,
        };
      };
    },
    set(value) {
      baseTelemetrySnapshot = value;
    },
  });

  LG.createDecor = () => {
    LG.state.decor = [];
    const colors = [
      "rgba(239,231,178,.06)",
      "rgba(91,151,121,.05)",
      "rgba(99,153,172,.045)",
      "rgba(255,255,255,.055)",
    ];
    for (let index = 0; index < 28; index += 1) {
      LG.state.decor.push({
        x: LG.randomBetween(30, WORLD.width - 30),
        y: LG.randomBetween(30, WORLD.height - 30),
        radiusX: LG.randomBetween(70, 230),
        radiusY: LG.randomBetween(45, 135),
        rotation: LG.randomBetween(0, Math.PI),
        color: colors[index % colors.length],
      });
    }
  };

  LG.createAnimal = (type, x, y, options = {}) => {
    if (LG.state.grazers.length + LG.state.hunters.length >= WORLD.maxAnimals) return null;
    const config = SPECIES[type];
    const spread = options.spread ?? 0;
    const margin = 14;
    const animal = {
      id: LG.state.nextEntityId++,
      type,
      x: LG.clamp(x + LG.randomBetween(-spread, spread), margin, WORLD.width - margin),
      y: LG.clamp(y + LG.randomBetween(-spread, spread), margin, WORLD.height - margin),
      angle: LG.randomBetween(-Math.PI, Math.PI),
      age: options.age ?? LG.randomBetween(config.minReproductionAge * 0.45, config.minReproductionAge * 1.8),
      energy: options.energy ?? LG.randomBetween(config.maxEnergy * 0.72, config.maxEnergy * 0.9),
      stamina: options.stamina ?? config.staminaMax,
      lifespan: options.lifespan ?? LG.randomBetween(config.lifespan[0], config.lifespan[1]),
      reproductionCooldown: options.reproductionCooldown ?? LG.randomBetween(0.05, 0.45),
      attackCooldown: 0,
      state: "wander",
      stateTimer: 0,
      targetId: null,
      consecutiveFailures: 0,
      wanderTimer: LG.randomBetween(0.02, 0.16),
      bobPhase: LG.randomBetween(0, Math.PI * 2),
      lastMealAge: options.lastMealAge ?? (type === "hunter" ? 1.3 : 0),
      parents: options.parents?.map((parent) => parent.id) || [],
      generation: options.generation || 0,
      lineageId: options.lineageId || `${type}-primordial`,
      sex: options.sex || (Math.random() < 0.5 ? "female" : "male"),
      birthYear: LG.state.year,
      offspringCount: 0,
      breedingReadiness: options.breedingReadiness || 0,
      preferredMateId: null,
    };
    (type === "grazer" ? LG.state.grazers : LG.state.hunters).push(animal);
    return animal;
  };

  function seedHabitat(centerX, centerY, brushCount = 6) {
    for (let index = 0; index < brushCount; index += 1) {
      const angle = (index / brushCount) * Math.PI * 2 + LG.randomBetween(-0.35, 0.35);
      const distance = LG.randomBetween(60, 220);
      LG.createPatch(
        centerX + Math.cos(angle) * distance,
        centerY + Math.sin(angle) * distance,
        { radius: LG.randomBetween(95, 145) },
      );
    }
    LG.createPatch(centerX, centerY, { radius: 165, green: 96, seeds: 56, rootBiomass: 66 });
  }

  LG.seedWorld = () => {
    const state = LG.state;
    state.running = false;
    state.speed = 1;
    state.year = 0;
    state.coexistenceYears = 0;
    state.longestCoexistence = 0;
    state.historicalMissionComplete = false;
    state.season = "spring";
    state.grazers = [];
    state.hunters = [];
    state.carcasses = [];
    state.effects = [];
    state.events = [];
    state.nextEntityId = GRID_CELL_COUNT + 1;
    state.presence = { flora: false, grazer: false, hunter: false };
    state.ledger = LG.freshLedger(0);
    state.lifetime = LG.freshLedger(0);
    state.lastAnimalPlacementYear = -Infinity;
    state.minimumDuringAttempt = { grazers: Infinity, hunters: Infinity };
    state.springBaseline = null;
    state.springRecoveryYear = -1;
    state.selectedIndividualId = null;
    state.pointer = { x: WORLD.width / 2, y: WORLD.height / 2, inside: false };
    state.eventFlags = {
      firstHunt: false,
      firstHunterBirth: false,
      firstSpringRecovery: false,
      grazerEndangered: false,
      hunterEndangered: false,
      firstInheritedBirth: false,
    };

    LG.initializeVegetationGrid();
    LG.createDecor();
    const habitats = [
      { x: 430, y: 320 },
      { x: 1600, y: 300 },
      { x: 600, y: 965 },
      { x: 1540, y: 930 },
    ];
    for (const habitat of habitats) seedHabitat(habitat.x, habitat.y, 6);

    for (let index = 0; index < 20; index += 1) {
      const habitat = habitats[index % habitats.length];
      LG.createAnimal("grazer", habitat.x, habitat.y, {
        spread: 185,
        age: LG.randomBetween(0.35, 2.4),
        sex: index % 2 === 0 ? "female" : "male",
      });
    }
    for (let index = 0; index < 2; index += 1) {
      LG.createAnimal("hunter", habitats[0].x + (index === 0 ? -70 : 70), habitats[0].y + LG.randomBetween(-45, 45), {
        age: LG.randomBetween(1.9, 3.6),
        energy: LG.randomBetween(104, 122),
        sex: index === 0 ? "female" : "male",
      });
    }

    state.presence = LG.getPresence();
    state.trendBaseline = LG.buildTrendSnapshot?.() ?? null;
    state.minimumDuringAttempt = {
      grazers: state.grazers.length,
      hunters: state.hunters.length,
    };
    LG.addEvent("Genesis世界已切换为64×40连续生态网格，植物与觅食共享同一空间数据。", 0);
    LG.addEvent("本轮保留现有动物行为，只替换植物空间模型、季节更新和资源诊断。", 0);
  };

  const updateBuildLabels = () => {
    const build = document.querySelector(".build-version");
    if (build) build.textContent = "v0.4.2 · vegetation grid";
    const footerTitle = document.querySelector(".footer-note span");
    const footerCopy = document.querySelector(".footer-note p");
    if (footerTitle) footerTitle.textContent = "Genesis v0.2 · 检查点2 第1轮：连续生态网格";
    if (footerCopy) footerCopy.textContent = "64×40植物网格已替换圆形斑块数据；季节更新、局部觅食与诊断开始共享同一空间资源。";
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateBuildLabels, { once: true });
  else updateBuildLabels();
})();
