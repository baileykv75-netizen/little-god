(() => {
  "use strict";

  const LG = window.LittleGod = {};

  LG.WORLD = Object.freeze({
    width: 960,
    height: 600,
    fixedStepMs: 50,
    // 1×下每个完整年份约80秒；4×约20秒；12×约6.7秒。
    yearsPerStep: 0.000625,
    maxPatches: 56,
    maxAnimals: 180,
    maxCarcasses: 80,
    missionYears: 8,
    trendWindowYears: 0.3,
  });

  LG.SEASONS = Object.freeze({
    spring: { label: "春季", color: "#f4dc8b" },
    summer: { label: "夏季", color: "#ffe6a6" },
    autumn: { label: "秋季", color: "#f6c889" },
    winter: { label: "冬季", color: "#d5effa" },
  });

  LG.PATCH = Object.freeze({
    maxGreen: 125,
    maxDry: 82,
    maxSeeds: 82,
    springGrowth: 96,
    summerGrowth: 66,
    autumnGrowth: 24,
    mildGrowth: 55,
    springGermination: 30,
    winterWither: 104,
    autumnSeedRate: 0.34,
    seedDecay: 0.012,
    dryDecaySpring: 1.05,
    dryDecayOther: 0.34,
    fertilityGain: 0.0007,
    fertilityCost: 0.00045,
    litterSuppression: 0.38,
  });

  LG.SPECIES = Object.freeze({
    flora: {
      label: "草地",
      placementCount: 1,
      color: "#68ad7d",
    },
    grazer: {
      label: "食草兽",
      placementCount: 3,
      color: "#e9b554",
      walkSpeed: 185,
      sprintSpeed: 325,
      maxEnergy: 108,
      baseDrain: 11.5,
      sprintDrain: 3.4,
      winterDrain: 1.14,
      eatRate: 42,
      greenEnergy: 1.08,
      dryEnergy: 0.48,
      senseRadius: 320,
      threatRadius: 125,
      staminaMax: 100,
      staminaDrain: 76,
      staminaRecovery: 48,
      minReproductionAge: 1,
      elderAgeRatio: 0.88,
      reproductionEnergy: 56,
      reproductionCost: 14,
      reproductionCooldown: 0.28,
      lifespan: [10, 15],
    },
    hunter: {
      label: "猎食兽",
      placementCount: 1,
      color: "#8065ad",
      walkSpeed: 175,
      chaseSpeed: 370,
      maxEnergy: 132,
      baseDrain: 9.5,
      chaseDrain: 2.4,
      winterDrain: 1.1,
      preyEnergy: 95,
      carrionEnergy: 1,
      senseRadius: 335,
      staminaMax: 110,
      staminaDrain: 58,
      staminaRecovery: 32,
      minReproductionAge: 1.8,
      elderAgeRatio: 0.88,
      reproductionEnergy: 75,
      reproductionCost: 20,
      reproductionCooldown: 0.8,
      lungeDistance: 45,
      lungeSpeed: 510,
      attackCooldown: 0.16,
      restAfterMiss: 0.06,
      feedRest: 0.12,
      lifespan: [14, 20],
    },
  });

  LG.randomBetween = (min, max) => min + Math.random() * (max - min);
  LG.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  LG.distanceSquared = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  LG.normalizeAngle = (angle) => {
    let result = angle;
    while (result > Math.PI) result -= Math.PI * 2;
    while (result < -Math.PI) result += Math.PI * 2;
    return result;
  };
  LG.turnToward = (current, target, amount) => (
    current + LG.clamp(LG.normalizeAngle(target - current), -amount, amount)
  );

  LG.freshLedger = (year = 0) => ({
    year: Math.floor(year),
    grazerBirths: 0,
    hunterBirths: 0,
    grazerPredationDeaths: 0,
    grazerStarvationDeaths: 0,
    grazerOldAgeDeaths: 0,
    hunterStarvationDeaths: 0,
    hunterOldAgeDeaths: 0,
    germinatedBiomass: 0,
    greenConsumed: 0,
    dryConsumed: 0,
    carcassDecomposed: 0,
    huntAttempts: 0,
    huntSuccesses: 0,
    huntFailures: 0,
    seedDispersals: 0,
    springRecoveries: 0,
    inheritedBirths: 0,
    localMateChoices: 0,
  });

  LG.state = {
    running: false,
    speed: 1,
    selectedSpecies: "flora",
    selectedIndividualId: null,
    inspectMode: false,
    year: 0,
    coexistenceYears: 0,
    longestCoexistence: 0,
    historicalMissionComplete: false,
    season: "spring",
    patches: [],
    grazers: [],
    hunters: [],
    carcasses: [],
    rules: {
      growth: 1,
      fertility: 1,
      fullSeasons: true,
    },
    events: [],
    effects: [],
    decor: [],
    pointer: {
      x: LG.WORLD.width / 2,
      y: LG.WORLD.height / 2,
      inside: false,
    },
    nextEntityId: 1,
    presence: {
      flora: false,
      grazer: false,
      hunter: false,
    },
    trendBaseline: null,
    trendValues: {
      flora: "稳定",
      grazer: "稳定",
      hunter: "稳定",
    },
    ledger: LG.freshLedger(),
    lifetime: LG.freshLedger(),
    lastAnimalPlacementYear: -Infinity,
    minimumDuringAttempt: {
      grazers: Infinity,
      hunters: Infinity,
    },
    springBaseline: null,
    springRecoveryYear: -1,
    eventFlags: {
      firstHunt: false,
      firstHunterBirth: false,
      firstSpringRecovery: false,
      grazerEndangered: false,
      hunterEndangered: false,
      firstInheritedBirth: false,
    },
  };

  LG.incrementMetric = (key, amount = 1) => {
    LG.state.ledger[key] += amount;
    LG.state.lifetime[key] += amount;
  };

  LG.getResourceTotals = () => LG.state.patches.reduce((totals, patch) => {
    totals.green += patch.green;
    totals.dry += patch.dry;
    totals.seeds += patch.seeds;
    totals.roots += patch.rootBiomass || 0;
    totals.fertility += patch.fertility;
    return totals;
  }, {
    green: 0,
    dry: 0,
    seeds: 0,
    roots: 0,
    fertility: 0,
  });

  LG.hasDormantPlantLife = () => {
    const totals = LG.getResourceTotals();
    return totals.green + totals.dry + totals.seeds + totals.roots > 1;
  };

  LG.lifeStage = (animal) => {
    const config = LG.SPECIES[animal.type];
    const lifespan = animal.derived?.lifespan || animal.lifespan;
    if (animal.age < config.minReproductionAge) return "juvenile";
    if (animal.age >= lifespan * config.elderAgeRatio) return "elder";
    return "adult";
  };

  LG.getAgeStructure = (list) => {
    const result = { juvenile: 0, adult: 0, elder: 0 };
    for (const animal of list) result[LG.lifeStage(animal)] += 1;
    return result;
  };

  LG.createDecor = () => {
    LG.state.decor = [];
    const colors = [
      "rgba(239,231,178,.13)",
      "rgba(91,151,121,.1)",
      "rgba(99,153,172,.09)",
      "rgba(255,255,255,.1)",
    ];
    for (let index = 0; index < 22; index += 1) {
      LG.state.decor.push({
        x: LG.randomBetween(20, 940),
        y: LG.randomBetween(20, 580),
        radiusX: LG.randomBetween(28, 96),
        radiusY: LG.randomBetween(18, 60),
        rotation: LG.randomBetween(0, Math.PI),
        color: colors[index % colors.length],
      });
    }
  };

  LG.createPatch = (x, y, options = {}) => {
    if (LG.state.patches.length >= LG.WORLD.maxPatches) return null;
    const patch = {
      id: LG.state.nextEntityId++,
      type: "flora",
      x: LG.clamp(x, 42, 918),
      y: LG.clamp(y, 42, 558),
      radius: options.radius ?? LG.randomBetween(32, 47),
      green: LG.clamp(options.green ?? LG.randomBetween(68, 96), 0, LG.PATCH.maxGreen),
      dry: LG.clamp(options.dry ?? LG.randomBetween(7, 15), 0, LG.PATCH.maxDry),
      seeds: LG.clamp(options.seeds ?? LG.randomBetween(34, 54), 0, LG.PATCH.maxSeeds),
      rootBiomass: LG.clamp(options.rootBiomass ?? LG.randomBetween(42, 66), 0, 100),
      fertility: LG.clamp(options.fertility ?? LG.randomBetween(0.82, 1.08), 0.35, 1.3),
      phase: LG.randomBetween(0, Math.PI * 2),
      spreadCooldown: LG.randomBetween(0, 1),
      barrenAge: 0,
      lineageId: options.lineageId || "flora-primordial",
      generation: options.generation || 0,
    };
    LG.state.patches.push(patch);
    return patch;
  };

  LG.findPatchNear = (x, y, radius = 58) => {
    let nearest = null;
    let bestDistance = radius * radius;
    for (const patch of LG.state.patches) {
      const distance = (patch.x - x) ** 2 + (patch.y - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = patch;
      }
    }
    return nearest;
  };

  LG.seedPatchAt = (x, y) => {
    const patch = LG.findPatchNear(x, y, 70);
    if (patch) {
      patch.green = LG.clamp(patch.green + 28, 0, LG.PATCH.maxGreen);
      patch.dry = LG.clamp(patch.dry + 5, 0, LG.PATCH.maxDry);
      patch.seeds = LG.clamp(patch.seeds + 24, 0, LG.PATCH.maxSeeds);
      patch.rootBiomass = LG.clamp(patch.rootBiomass + 12, 0, 100);
      return patch;
    }
    return LG.createPatch(x, y);
  };

  LG.createAnimal = (type, x, y, options = {}) => {
    if (LG.state.grazers.length + LG.state.hunters.length >= LG.WORLD.maxAnimals) return null;
    const config = LG.SPECIES[type];
    const spread = options.spread ?? 0;
    const animal = {
      id: LG.state.nextEntityId++,
      type,
      x: LG.clamp(x + LG.randomBetween(-spread, spread), 14, 946),
      y: LG.clamp(y + LG.randomBetween(-spread, spread), 14, 586),
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

  LG.createCarcass = (x, y, sourceType, amount = 30) => {
    if (LG.state.carcasses.length >= LG.WORLD.maxCarcasses) LG.state.carcasses.shift();
    LG.state.carcasses.push({
      id: LG.state.nextEntityId++,
      x,
      y,
      sourceType,
      biomass: amount,
      age: 0,
      maxAge: 1.35,
    });
  };

  LG.getPresence = () => ({
    flora: LG.hasDormantPlantLife(),
    grazer: LG.state.grazers.length > 0,
    hunter: LG.state.hunters.length > 0,
  });

  LG.addEvent = (message, year = LG.state.year) => {
    LG.state.events.unshift({
      id: `${year.toFixed(4)}-${LG.state.nextEntityId++}`,
      year,
      message,
    });
    if (LG.state.events.length > 14) LG.state.events.length = 14;
    LG.renderEventLog?.();
  };

  LG.checkPresenceChanges = () => {
    const current = LG.getPresence();
    for (const type of ["flora", "grazer", "hunter"]) {
      if (LG.state.presence[type] && !current[type]) {
        LG.addEvent(`${type === "flora" ? "草地生态（包括根系与种子库）" : LG.SPECIES[type].label}在世界中彻底灭绝。`);
      } else if (!LG.state.presence[type] && current[type] && LG.state.year > 0.001) {
        LG.addEvent(`${type === "flora" ? "草地生态" : LG.SPECIES[type].label}重新出现在世界中。`);
      }
    }
    LG.state.presence = current;
  };

  LG.seedWorld = () => {
    const state = LG.state;
    state.running = false;
    state.speed = 1;
    state.year = 0;
    state.coexistenceYears = 0;
    state.longestCoexistence = 0;
    state.historicalMissionComplete = false;
    state.season = "spring";
    state.patches = [];
    state.grazers = [];
    state.hunters = [];
    state.carcasses = [];
    state.effects = [];
    state.events = [];
    state.nextEntityId = 1;
    state.presence = { flora: false, grazer: false, hunter: false };
    state.ledger = LG.freshLedger(0);
    state.lifetime = LG.freshLedger(0);
    state.lastAnimalPlacementYear = -Infinity;
    state.minimumDuringAttempt = { grazers: Infinity, hunters: Infinity };
    state.springBaseline = null;
    state.springRecoveryYear = -1;
    state.selectedIndividualId = null;
    state.eventFlags = {
      firstHunt: false,
      firstHunterBirth: false,
      firstSpringRecovery: false,
      grazerEndangered: false,
      hunterEndangered: false,
      firstInheritedBirth: false,
    };

    LG.createDecor();
    const centers = [
      [150, 135], [340, 105], [570, 135], [790, 120],
      [215, 330], [470, 290], [730, 325],
      [130, 500], [365, 480], [610, 495], [825, 485],
    ];
    for (const [x, y] of centers) {
      LG.createPatch(x + LG.randomBetween(-25, 25), y + LG.randomBetween(-20, 20));
    }

    // 初始种群按近似1:1性别比建立，防止两只创始猎食兽随机为同性。
    for (let index = 0; index < 18; index += 1) {
      LG.createAnimal("grazer", LG.randomBetween(110, 850), LG.randomBetween(90, 520), {
        age: LG.randomBetween(0.35, 2.4),
        sex: index % 2 === 0 ? "female" : "male",
      });
    }
    for (let index = 0; index < 2; index += 1) {
      LG.createAnimal("hunter", 480 + (index === 0 ? -55 : 55), 300 + LG.randomBetween(-35, 35), {
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
    LG.addEvent("Genesis创始世界被创造：每个动物都拥有独立属性、性别、基因型与局部感知。", 0);
    LG.addEvent("右侧可进入个体洞察；观察战力、感知、性格与代际遗传差异。", 0);
  };
})();