(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Ecology rebalance requires LittleGod core");
  if (
    typeof LG.updateGrazers !== "function"
    || typeof LG.updateHunters !== "function"
    || typeof LG.updateWorld !== "function"
  ) {
    throw new Error("Ecology rebalance requires simulation and stability runtimes");
  }

  const s = LG.state;
  const LOW_GRAZER_THRESHOLD = 14;
  const GRAZER_RECOVERY_FOOD_MIN = 22;
  const GRAZER_RECOVERY_MATE_RANGE = 360;
  const GRAZER_RECOVERY_ENERGY_RATIO = 0.68;
  const MAX_SUPPLEMENTAL_GERMINATION_PER_STEP = 1.2;

  let grazerFailures;
  let grazerTotals;
  let grazerSnapshot;
  let hunterBirthBrakes = 0;
  let supplementalSeedGerminated = 0;

  const blankGrazerFailures = () => ({
    seasonClosed: 0,
    noAdultFemale: 0,
    noAdultMale: 0,
    energyInsufficient: 0,
    cooldownActive: 0,
    mateOutOfRange: 0,
    localFoodInsufficient: 0,
    populationPressure: 0,
    readinessBuilding: 0,
    worldCapacity: 0,
    createFailed: 0,
  });

  function resetDiagnostics() {
    grazerFailures = blankGrazerFailures();
    grazerTotals = { evaluations: 0, attempts: 0, successes: 0, recoveryBirths: 0 };
    grazerSnapshot = {
      adultFemales: 0,
      adultMales: 0,
      energyReady: 0,
      cooldownReady: 0,
      mateDistanceReady: 0,
      localFoodReady: 0,
      populationPressureReady: 0,
      foundMate: 0,
      recoveryWindow: false,
    };
    hunterBirthBrakes = 0;
    supplementalSeedGerminated = 0;
  }

  function statsOf(animal, type = animal?.type) {
    const config = LG.SPECIES?.[type] || {};
    return animal?.derived || {
      maxEnergy: config.maxEnergy || 100,
      senseRadius: config.senseRadius || 260,
      mateRange: 220,
      fertilityMultiplier: 1,
    };
  }

  function nearby(source, targets, radius) {
    const radiusSquared = radius * radius;
    return targets.filter((target) => LG.distanceSquared(source, target) <= radiusSquared);
  }

  function isAdult(animal) {
    return typeof LG.lifeStage === "function" ? LG.lifeStage(animal) === "adult" : animal?.age >= 1;
  }

  function grazerFood(animal, radius) {
    return typeof LG.localPlantFood === "function" ? Number(LG.localPlantFood(animal, radius)) || 0 : 0;
  }

  function readyGrazerMale(animal, config, energyRatio) {
    return isAdult(animal)
      && animal.energy >= config.reproductionEnergy * energyRatio
      && animal.reproductionCooldown <= 0;
  }

  function grazerGateSnapshot() {
    const config = LG.SPECIES.grazer;
    const adults = s.grazers.filter(isAdult);
    const females = adults.filter((animal) => animal.sex === "female");
    const males = adults.filter((animal) => animal.sex === "male");
    const recoveryWindow = s.grazers.length > 1 && s.grazers.length <= LOW_GRAZER_THRESHOLD;
    const energyRatio = recoveryWindow ? GRAZER_RECOVERY_ENERGY_RATIO : 0.78;
    const season = LG.reproductionSeasonMultiplier();

    grazerSnapshot = {
      adultFemales: females.length,
      adultMales: males.length,
      energyReady: females.filter((animal) => animal.energy >= config.reproductionEnergy * energyRatio).length,
      cooldownReady: females.filter((animal) => animal.reproductionCooldown <= 0).length,
      mateDistanceReady: 0,
      localFoodReady: 0,
      populationPressureReady: 0,
      foundMate: 0,
      recoveryWindow,
    };

    if (!females.length) grazerFailures.noAdultFemale += 1;
    if (!males.length) grazerFailures.noAdultMale += 1;
    if (season <= 0) {
      grazerFailures.seasonClosed += females.length;
      return { females, males, recoveryWindow, energyRatio, season };
    }

    for (const female of females) {
      grazerTotals.evaluations += 1;
      const derived = statsOf(female, "grazer");
      if (female.energy < config.reproductionEnergy * energyRatio) {
        grazerFailures.energyInsufficient += 1;
        continue;
      }
      if (female.reproductionCooldown > 0) {
        grazerFailures.cooldownActive += 1;
        continue;
      }

      const mateRange = recoveryWindow
        ? Math.max(GRAZER_RECOVERY_MATE_RANGE, derived.mateRange || 220, (derived.senseRadius || 260) * 1.15)
        : Math.max(220, derived.mateRange || 220);
      const localFood = grazerFood(female, mateRange);
      const foodMinimum = recoveryWindow ? GRAZER_RECOVERY_FOOD_MIN : 38;
      if (localFood < foodMinimum) {
        grazerFailures.localFoodInsufficient += 1;
        continue;
      }
      grazerSnapshot.localFoodReady += 1;

      const localGrazers = nearby(female, s.grazers, mateRange).length;
      const carrying = Math.max(3, localFood / 42);
      const pressureReady = recoveryWindow || localGrazers <= carrying + 2;
      if (!pressureReady) {
        grazerFailures.populationPressure += 1;
        continue;
      }
      grazerSnapshot.populationPressureReady += 1;

      const malesInRange = nearby(female, males, mateRange);
      if (!malesInRange.length) {
        grazerFailures.mateOutOfRange += 1;
        continue;
      }
      grazerSnapshot.mateDistanceReady += 1;
      const readyMales = malesInRange.filter((male) => readyGrazerMale(male, config, energyRatio));
      const mate = LG.chooseLocalMate(female, readyMales);
      if (!mate) {
        grazerFailures.mateOutOfRange += 1;
        continue;
      }
      grazerSnapshot.foundMate += 1;
    }
    return { females, males, recoveryWindow, energyRatio, season };
  }

  function createRecoveryGrazer(mother, father) {
    const config = LG.SPECIES.grazer;
    if (s.grazers.length + s.hunters.length >= LG.WORLD.maxAnimals) {
      grazerFailures.worldCapacity += 1;
      return false;
    }
    const motherStats = statsOf(mother, "grazer");
    const fatherStats = statsOf(father, "grazer");
    grazerTotals.attempts += 1;
    const child = LG.createAnimal("grazer", (mother.x + father.x) / 2, (mother.y + father.y) / 2, {
      spread: 12,
      age: 0,
      parents: [mother, father],
      sex: Math.random() < 0.5 ? "female" : "male",
      energy: (motherStats.maxEnergy + fatherStats.maxEnergy) * 0.27,
      reproductionCooldown: config.reproductionCooldown,
      lineageId: mother.lineageId,
    });
    if (!child) {
      grazerFailures.createFailed += 1;
      return false;
    }
    mother.energy -= config.reproductionCost;
    father.energy -= config.reproductionCost * 0.35;
    mother.reproductionCooldown = config.reproductionCooldown / Math.max(0.55, motherStats.fertilityMultiplier || 1);
    father.reproductionCooldown = config.reproductionCooldown * 0.75 / Math.max(0.55, fatherStats.fertilityMultiplier || 1);
    mother.ecologyRecoveryReadiness = 0;
    mother.offspringCount = (mother.offspringCount || 0) + 1;
    father.offspringCount = (father.offspringCount || 0) + 1;
    mother.lastBirthYear = s.year;
    father.lastBirthYear = s.year;
    LG.incrementMetric("grazerBirths");
    LG.incrementMetric("inheritedBirths");
    s.effects?.push({ kind: "birth", x: child.x, y: child.y, age: 0, color: config.color });
    grazerTotals.successes += 1;
    grazerTotals.recoveryBirths += 1;
    return true;
  }

  function runGrazerRecovery(dt, gate) {
    if (!gate.recoveryWindow || gate.season <= 0) return false;
    const config = LG.SPECIES.grazer;
    for (const female of gate.females) {
      const derived = statsOf(female, "grazer");
      if (female.energy < config.reproductionEnergy * gate.energyRatio || female.reproductionCooldown > 0) continue;
      const mateRange = Math.max(
        GRAZER_RECOVERY_MATE_RANGE,
        derived.mateRange || 220,
        (derived.senseRadius || 260) * 1.15,
      );
      if (grazerFood(female, mateRange) < GRAZER_RECOVERY_FOOD_MIN) continue;
      const readyMales = nearby(female, gate.males, mateRange)
        .filter((male) => readyGrazerMale(male, config, gate.energyRatio));
      const male = LG.chooseLocalMate(female, readyMales);
      if (!male) continue;
      const lowPopulationBoost = 1 + (LOW_GRAZER_THRESHOLD - s.grazers.length) / LOW_GRAZER_THRESHOLD;
      const gain = 5.2
        * s.rules.fertility
        * gate.season
        * (derived.fertilityMultiplier || 1)
        * lowPopulationBoost
        * dt;
      female.ecologyRecoveryReadiness = Math.min(1.25, (female.ecologyRecoveryReadiness || 0) + gain);
      if (female.ecologyRecoveryReadiness < 1) {
        grazerFailures.readinessBuilding += 1;
        continue;
      }
      if (createRecoveryGrazer(female, male)) return true;
    }
    return false;
  }

  function requiredHunterPreyRatio() {
    const count = s.hunters.length;
    let required = count <= 3 ? 1.2 : count <= 6 ? 2.8 : 4.5;
    if (s.year < 8 && count >= 6) required += 0.8;
    return required;
  }

  function shouldBrakeHunterBirth() {
    if (s.hunters.length < 4) return false;
    const ratio = s.grazers.length / Math.max(1, s.hunters.length);
    return ratio < requiredHunterPreyRatio() || s.grazers.length < 12;
  }

  function terrainCells() {
    const canonical = typeof LG.getTerrainCells === "function" ? LG.getTerrainCells() : null;
    if (Array.isArray(canonical) && canonical.length) return canonical;
    if (Array.isArray(s.terrainCells) && s.terrainCells.length) return s.terrainCells;
    return Array.isArray(s.patches) ? s.patches.filter((cell) => cell?.isGridCell === true) : [];
  }

  function promoteSeedGermination(dt) {
    if (s.season !== "spring" || dt <= 0) return 0;
    const cells = terrainCells();
    if (!cells.length) return 0;
    const metrics = s.vegetationMetrics || (s.vegetationMetrics = {});
    let total = 0;
    LG._vegetationInternalUpdate = true;
    try {
      for (const cell of cells) {
        if (total >= MAX_SUPPLEMENTAL_GERMINATION_PER_STEP) break;
        const seeds = Number(cell.seeds) || 0;
        const green = Number(cell.green) || 0;
        const roots = Number(cell.rootBiomass) || 0;
        if (seeds <= 0.08 || green >= 7.5 || roots >= 6.5) continue;
        const openness = LG.clamp(1 - green / 7.5, 0, 1);
        const fertility = LG.clamp(Number(cell.fertility) || 0.75, 0.35, 1.3);
        const moisture = LG.clamp(Number(cell.moisture) || 0.6, 0.25, 1);
        const amount = Math.min(
          seeds,
          MAX_SUPPLEMENTAL_GERMINATION_PER_STEP - total,
          (0.04 + openness * 0.16) * fertility * moisture * dt,
        );
        if (amount <= 1e-9) continue;
        cell.seeds = Math.max(0, seeds - amount);
        cell.rootBiomass = Math.min(LG.GRID?.maxRoots || 10, roots + amount * 0.78);
        cell.green = Math.min(LG.GRID?.maxGreen || 12, green + amount * 0.34);
        metrics.seedGerminated = (Number(metrics.seedGerminated) || 0) + amount;
        metrics.rootGained = (Number(metrics.rootGained) || 0) + amount * 0.78;
        metrics.greenGrowth = (Number(metrics.greenGrowth) || 0) + amount * 0.34;
        total += amount;
      }
    } finally {
      LG._vegetationInternalUpdate = false;
    }
    supplementalSeedGerminated += total;
    return total;
  }

  const baseUpdateGrazers = LG.updateGrazers;
  LG.updateGrazers = (dt) => {
    const gate = grazerGateSnapshot();
    const birthsBefore = Number(s.lifetime?.grazerBirths) || 0;
    const baseCreateAnimal = LG.createAnimal;
    LG.createAnimal = (type, x, y, options = {}) => {
      const inheritedGrazer = type === "grazer" && Array.isArray(options.parents) && options.parents.length >= 2;
      if (inheritedGrazer) grazerTotals.attempts += 1;
      const child = baseCreateAnimal(type, x, y, options);
      if (inheritedGrazer) {
        if (child) grazerTotals.successes += 1;
        else grazerFailures.createFailed += 1;
      }
      return child;
    };
    let result;
    try {
      result = baseUpdateGrazers(dt);
    } finally {
      LG.createAnimal = baseCreateAnimal;
    }
    const birthsAfter = Number(s.lifetime?.grazerBirths) || 0;
    if (birthsAfter === birthsBefore) runGrazerRecovery(dt, gate);
    return result;
  };

  const baseUpdateHunters = LG.updateHunters;
  LG.updateHunters = (dt) => {
    const baseCreateAnimal = LG.createAnimal;
    LG.createAnimal = (type, x, y, options = {}) => {
      const inheritedHunter = type === "hunter" && Array.isArray(options.parents) && options.parents.length >= 2;
      if (inheritedHunter && shouldBrakeHunterBirth()) {
        hunterBirthBrakes += 1;
        return null;
      }
      return baseCreateAnimal(type, x, y, options);
    };
    try {
      return baseUpdateHunters(dt);
    } finally {
      LG.createAnimal = baseCreateAnimal;
    }
  };

  const baseUpdateWorld = LG.updateWorld;
  LG.updateWorld = (dt) => {
    const baseAddEvent = LG.addEvent;
    if (typeof baseAddEvent === "function") {
      LG.addEvent = (message, ...rest) => {
        const corrected = message === "连续地表第一次依靠根系与局部种子完成明显春季恢复。 "
          ? "连续地表第一次依靠根系储备完成明显春季恢复；种子发芽按实际指标另行记录。 "
          : message;
        return baseAddEvent(corrected, ...rest);
      };
    }
    let result;
    try {
      result = baseUpdateWorld(dt);
    } finally {
      if (typeof baseAddEvent === "function") LG.addEvent = baseAddEvent;
    }
    promoteSeedGermination(dt);
    return result;
  };

  function diagnostics() {
    const base = typeof LG.getEcologySupervisionDiagnostics === "function"
      ? LG.getEcologySupervisionDiagnostics.__ecologyRebalanceBase?.()
      : null;
    return base;
  }

  const baseCompactSummary = LG.getEcologySupervisionDiagnostics;
  const augmentedCompactSummary = () => {
    const summary = baseCompactSummary();
    const criteria = LG.missionCriteria?.() || {};
    const balance = LG.calculateBalance?.() || {};
    const currentlyStable = Boolean(
      criteria.allPresent
      && criteria.time
      && criteria.minimums
      && (Number(balance.score) || 0) >= 45
    );
    const historicalMilestone = Boolean(s.historicalMissionComplete);
    const reproductionDiagnostics = summary?.reproductionDiagnostics || {};
    return {
      ...summary,
      verdict: {
        ...(summary?.verdict || {}),
        historicalMilestone,
        currentlyStable,
        statusLabel: historicalMilestone
          ? currentlyStable ? "历史里程碑已达成 · 当前生态稳定" : "历史里程碑已达成 · 当前生态已不稳定"
          : currentlyStable ? "当前生态稳定 · 尚未达到历史里程碑" : "当前生态尚未稳定",
      },
      missionStatus: {
        historicalMilestone,
        currentlyStable,
        currentCriteria: { ...criteria },
      },
      reproductionDiagnostics: {
        ...reproductionDiagnostics,
        grazer: {
          ...grazerSnapshot,
          attempts: grazerTotals.attempts,
          successes: grazerTotals.successes,
          evaluations: grazerTotals.evaluations,
          recoveryBirths: grazerTotals.recoveryBirths,
          failureReasons: { ...grazerFailures },
        },
      },
      populationControl: {
        hunterBirthBrakes,
        currentHunterPreyRatio: s.grazers.length / Math.max(1, s.hunters.length),
        requiredHunterPreyRatio: requiredHunterPreyRatio(),
        lowGrazerThreshold: LOW_GRAZER_THRESHOLD,
      },
      seedGerminationDiagnostics: {
        mode: "continuous-grid-supplemental-germination",
        supplementalSeedGerminated,
        publicSeedGerminated: Number(s.vegetationMetrics?.seedGerminated) || 0,
        wordingClaimsGerminationOnlyWhenMeasured: true,
      },
    };
  };
  augmentedCompactSummary.__ecologyRebalanceBase = baseCompactSummary;
  LG.getEcologySupervisionDiagnostics = augmentedCompactSummary;

  const baseSeedWorld = LG.seedWorld;
  if (typeof baseSeedWorld === "function") {
    LG.seedWorld = (...args) => {
      const result = baseSeedWorld.apply(LG, args);
      resetDiagnostics();
      return result;
    };
  }

  LG.getEcologyRebalanceDiagnostics = () => ({
    version: "ecology-rebalance-v1",
    grazer: augmentedCompactSummary().reproductionDiagnostics.grazer,
    populationControl: augmentedCompactSummary().populationControl,
    seedGerminationDiagnostics: augmentedCompactSummary().seedGerminationDiagnostics,
  });
  LG.ecologyRebalanceModel = Object.freeze({
    version: "ecology-rebalance-v1",
    grazerRecoveryWindow: LOW_GRAZER_THRESHOLD,
    hunterPopulationBrake: "dynamic-prey-ratio",
    seedGerminationMode: "continuous-grid-supplemental",
    missionCompletionMode: "historical-and-current-separated",
  });

  resetDiagnostics();

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__ecologyRebalanceWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({ ...baseSnapshot(), compactSummary: augmentedCompactSummary() });
      wrapped.__ecologyRebalanceWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
