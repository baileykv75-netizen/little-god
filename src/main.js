(() => {
  "use strict";

  const WORLD = Object.freeze({
    width: 960,
    height: 600,
    fixedStepMs: 50,
    yearsPerStep: 0.0025,
    maxPatches: 64,
    maxAnimals: 180,
    maxCarcasses: 80,
    missionYears: 3,
    trendWindowYears: 0.25,
  });

  const SEASONS = Object.freeze({
    spring: { label: "春季", start: 0, end: 0.25, color: "#f4dc8b" },
    summer: { label: "夏季", start: 0.25, end: 0.5, color: "#ffe6a6" },
    autumn: { label: "秋季", start: 0.5, end: 0.75, color: "#f6c889" },
    winter: { label: "冬季", start: 0.75, end: 1, color: "#d5effa" },
  });

  const PATCH = Object.freeze({
    maxGreen: 135,
    maxDry: 110,
    maxSeeds: 95,
    springGrowth: 105,
    summerGrowth: 68,
    autumnGrowth: 26,
    mildGrowth: 62,
    springGermination: 36,
    winterWither: 115,
    autumnSeedRate: 0.28,
    seedDecay: 0.018,
    dryDecay: 0.18,
    fertilityRecovery: 0.035,
  });

  const SPECIES = Object.freeze({
    flora: {
      label: "草地",
      placementCount: 1,
      color: "#68ad7d",
    },
    grazer: {
      label: "食草兽",
      placementCount: 3,
      color: "#e9b554",
      moveSpeed: 280,
      maxEnergy: 100,
      baseDrain: 24,
      winterDrain: 1.18,
      eatRate: 54,
      greenEnergy: 1.18,
      dryEnergy: 0.48,
      senseRadius: 245,
      minReproductionAge: 1.2,
      reproductionEnergy: 76,
      reproductionCost: 30,
      reproductionRate: 0.95,
      reproductionCooldown: 0.55,
      lifespan: [5.2, 8.2],
    },
    hunter: {
      label: "猎食兽",
      placementCount: 1,
      color: "#8065ad",
      moveSpeed: 330,
      maxEnergy: 120,
      baseDrain: 28,
      winterDrain: 1.13,
      preyEnergy: 72,
      carrionEnergy: 0.72,
      senseRadius: 300,
      minReproductionAge: 1.8,
      reproductionEnergy: 94,
      reproductionCost: 38,
      reproductionRate: 0.34,
      reproductionCooldown: 1.1,
      attackCooldown: 0.2,
      lifespan: [7, 11],
    },
  });

  const canvas = document.querySelector("#worldCanvas");
  const ctx = canvas.getContext("2d");

  const elements = {
    playToggle: document.querySelector("#playToggle"),
    playIcon: document.querySelector("#playIcon"),
    playLabel: document.querySelector("#playLabel"),
    resetButton: document.querySelector("#resetButton"),
    clearButton: document.querySelector("#clearButton"),
    speedButtons: [...document.querySelectorAll(".speed-button")],
    speciesButtons: [...document.querySelectorAll(".species-button")],
    placementHint: document.querySelector("#placementHint"),
    growthRule: document.querySelector("#growthRule"),
    fertilityRule: document.querySelector("#fertilityRule"),
    seasonsRule: document.querySelector("#seasonsRule"),
    growthValue: document.querySelector("#growthValue"),
    fertilityValue: document.querySelector("#fertilityValue"),
    missionProgress: document.querySelector("#missionProgress"),
    missionYears: document.querySelector("#missionYears"),
    missionState: document.querySelector("#missionState"),
    worldAge: document.querySelector("#worldAge"),
    seasonLabel: document.querySelector("#seasonLabel"),
    pauseBanner: document.querySelector("#pauseBanner"),
    worldToast: document.querySelector("#worldToast"),
    floraCount: document.querySelector("#floraCount"),
    dryCount: document.querySelector("#dryCount"),
    seedCount: document.querySelector("#seedCount"),
    grazerCount: document.querySelector("#grazerCount"),
    hunterCount: document.querySelector("#hunterCount"),
    carcassCount: document.querySelector("#carcassCount"),
    floraTrend: document.querySelector("#floraTrend"),
    grazerTrend: document.querySelector("#grazerTrend"),
    hunterTrend: document.querySelector("#hunterTrend"),
    balanceLabel: document.querySelector("#balanceLabel"),
    balanceFill: document.querySelector("#balanceFill"),
    balanceAdvice: document.querySelector("#balanceAdvice"),
    eventLog: document.querySelector("#eventLog"),
    hudGreen: document.querySelector("#hudGreen"),
    hudDry: document.querySelector("#hudDry"),
    hudSeeds: document.querySelector("#hudSeeds"),
    ledgerYear: document.querySelector("#ledgerYear"),
    grazerBirths: document.querySelector("#grazerBirths"),
    hunterBirths: document.querySelector("#hunterBirths"),
    predationDeaths: document.querySelector("#predationDeaths"),
    starvationDeaths: document.querySelector("#starvationDeaths"),
    oldAgeDeaths: document.querySelector("#oldAgeDeaths"),
    germinatedBiomass: document.querySelector("#germinatedBiomass"),
  };

  function freshLedger(year = 0) {
    return {
      year: Math.floor(year),
      grazerBirths: 0,
      hunterBirths: 0,
      predationDeaths: 0,
      starvationDeaths: 0,
      oldAgeDeaths: 0,
      germinatedBiomass: 0,
      greenConsumed: 0,
      dryConsumed: 0,
      carcassDecomposed: 0,
      huntAttempts: 0,
      huntSuccesses: 0,
    };
  }

  const state = {
    running: false,
    speed: 1,
    selectedSpecies: "flora",
    year: 0,
    coexistenceYears: 0,
    longestCoexistence: 0,
    missionComplete: false,
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
      x: WORLD.width / 2,
      y: WORLD.height / 2,
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
    ledger: freshLedger(),
    lifetime: freshLedger(),
  };

  let lastFrameTime = performance.now();
  let accumulator = 0;
  let lastUiUpdate = 0;
  let toastTimer = null;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function normalizeAngle(angle) {
    let result = angle;
    while (result > Math.PI) result -= Math.PI * 2;
    while (result < -Math.PI) result += Math.PI * 2;
    return result;
  }

  function turnToward(current, target, amount) {
    const difference = normalizeAngle(target - current);
    return current + clamp(difference, -amount, amount);
  }

  function incrementMetric(key, amount = 1) {
    state.ledger[key] += amount;
    state.lifetime[key] += amount;
  }

  function getResourceTotals() {
    return state.patches.reduce((totals, patch) => {
      totals.green += patch.green;
      totals.dry += patch.dry;
      totals.seeds += patch.seeds;
      totals.fertility += patch.fertility;
      return totals;
    }, { green: 0, dry: 0, seeds: 0, fertility: 0 });
  }

  function hasDormantPlantLife() {
    const totals = getResourceTotals();
    return totals.green + totals.dry + totals.seeds > 1;
  }

  function createDecor() {
    state.decor = [];
    const colors = [
      "rgba(239, 231, 178, 0.13)",
      "rgba(91, 151, 121, 0.1)",
      "rgba(99, 153, 172, 0.09)",
      "rgba(255, 255, 255, 0.1)",
    ];

    for (let index = 0; index < 22; index += 1) {
      state.decor.push({
        x: randomBetween(20, WORLD.width - 20),
        y: randomBetween(20, WORLD.height - 20),
        radiusX: randomBetween(28, 96),
        radiusY: randomBetween(18, 60),
        rotation: randomBetween(0, Math.PI),
        color: colors[index % colors.length],
      });
    }
  }

  function createPatch(x, y, options = {}) {
    if (state.patches.length >= WORLD.maxPatches) return null;

    const patch = {
      id: state.nextEntityId++,
      type: "flora",
      x: clamp(x, 42, WORLD.width - 42),
      y: clamp(y, 42, WORLD.height - 42),
      radius: options.radius ?? randomBetween(32, 48),
      green: clamp(options.green ?? randomBetween(72, 105), 0, PATCH.maxGreen),
      dry: clamp(options.dry ?? randomBetween(8, 18), 0, PATCH.maxDry),
      seeds: clamp(options.seeds ?? randomBetween(38, 62), 0, PATCH.maxSeeds),
      fertility: clamp(options.fertility ?? randomBetween(0.78, 1.12), 0.35, 1.35),
      phase: randomBetween(0, Math.PI * 2),
    };

    state.patches.push(patch);
    return patch;
  }

  function findPatchNear(x, y, radius = 58) {
    let nearest = null;
    let nearestDistance = radius * radius;
    for (const patch of state.patches) {
      const currentDistance = (patch.x - x) ** 2 + (patch.y - y) ** 2;
      if (currentDistance < nearestDistance) {
        nearestDistance = currentDistance;
        nearest = patch;
      }
    }
    return nearest;
  }

  function seedPatchAt(x, y) {
    const existing = findPatchNear(x, y, 70);
    if (existing) {
      existing.green = clamp(existing.green + 34, 0, PATCH.maxGreen);
      existing.dry = clamp(existing.dry + 8, 0, PATCH.maxDry);
      existing.seeds = clamp(existing.seeds + 28, 0, PATCH.maxSeeds);
      existing.fertility = clamp(existing.fertility + 0.04, 0.35, 1.35);
      return existing;
    }
    return createPatch(x, y);
  }

  function createAnimal(type, x, y, options = {}) {
    if (state.grazers.length + state.hunters.length >= WORLD.maxAnimals) return null;
    const config = SPECIES[type];
    const spread = options.spread ?? 0;
    const animal = {
      id: state.nextEntityId++,
      type,
      x: clamp(x + randomBetween(-spread, spread), 14, WORLD.width - 14),
      y: clamp(y + randomBetween(-spread, spread), 14, WORLD.height - 14),
      angle: randomBetween(-Math.PI, Math.PI),
      age: options.age ?? randomBetween(0.2, 2.1),
      energy: options.energy ?? randomBetween(config.maxEnergy * 0.68, config.maxEnergy * 0.86),
      lifespan: options.lifespan ?? randomBetween(config.lifespan[0], config.lifespan[1]),
      reproductionCooldown: options.reproductionCooldown ?? randomBetween(0.1, 0.7),
      attackCooldown: 0,
      wanderTimer: randomBetween(0.02, 0.15),
      bobPhase: randomBetween(0, Math.PI * 2),
      lastMealAge: 0,
    };

    if (type === "grazer") state.grazers.push(animal);
    else state.hunters.push(animal);
    return animal;
  }

  function createCarcass(x, y, sourceType, amount = 30) {
    if (state.carcasses.length >= WORLD.maxCarcasses) state.carcasses.shift();
    state.carcasses.push({
      id: state.nextEntityId++,
      x,
      y,
      sourceType,
      biomass: amount,
      age: 0,
      maxAge: 0.7,
    });
  }

  function placeSpecies(type, x, y, announce = true) {
    const config = SPECIES[type];
    let created = 0;

    if (type === "flora") {
      if (seedPatchAt(x, y)) created = 1;
    } else {
      for (let index = 0; index < config.placementCount; index += 1) {
        if (createAnimal(type, x, y, { spread: 25 })) created += 1;
      }
    }

    if (created > 0) {
      state.effects.push({ x, y, age: 0, color: config.color });
      if (announce) {
        showToast(type === "flora" ? "草地已播种或补充" : `投放了 ${created} 只${config.label}`);
      }
      checkPresenceChanges();
      updateUi(true);
      return;
    }

    showToast(type === "flora" ? "草地斑块已达到世界上限" : "动物数量已达到世界上限");
  }

  function seedWorld() {
    state.running = false;
    state.year = 0;
    state.coexistenceYears = 0;
    state.longestCoexistence = 0;
    state.missionComplete = false;
    state.season = "spring";
    state.patches = [];
    state.grazers = [];
    state.hunters = [];
    state.carcasses = [];
    state.effects = [];
    state.events = [];
    state.nextEntityId = 1;
    state.presence = { flora: false, grazer: false, hunter: false };
    state.ledger = freshLedger(0);
    state.lifetime = freshLedger(0);
    createDecor();

    const patchCenters = [
      [150, 135], [340, 105], [570, 135], [790, 120],
      [215, 330], [470, 290], [730, 325],
      [130, 500], [365, 480], [610, 495], [825, 485],
    ];
    for (const [x, y] of patchCenters) {
      createPatch(x + randomBetween(-25, 25), y + randomBetween(-20, 20));
    }

    for (let index = 0; index < 10; index += 1) {
      createAnimal("grazer", randomBetween(110, WORLD.width - 110), randomBetween(90, WORLD.height - 90));
    }

    for (let index = 0; index < 2; index += 1) {
      createAnimal("hunter", randomBetween(140, WORLD.width - 140), randomBetween(110, WORLD.height - 110));
    }

    state.presence = getPresence();
    state.trendBaseline = buildTrendSnapshot();
    state.trendValues = { flora: "稳定", grazer: "稳定", hunter: "稳定" };

    addEvent("新的示范世界被创造：地下种子、鲜草和枯草共同构成草地。", 0);
    addEvent("创世命题：让三层生态连续经历3个完整年份。", 0);
    syncPlaybackControls();
    updateUi(true);
  }

  function clearLife() {
    state.patches = [];
    state.grazers = [];
    state.hunters = [];
    state.carcasses = [];
    state.coexistenceYears = 0;
    state.missionComplete = false;
    state.presence = { flora: false, grazer: false, hunter: false };
    addEvent("所有草地、种子、动物和尸体被移出世界。", state.year);
    showToast("世界已清空，可以重新设计生态");
    updateUi(true);
  }

  function getPresence() {
    return {
      flora: hasDormantPlantLife(),
      grazer: state.grazers.length > 0,
      hunter: state.hunters.length > 0,
    };
  }

  function checkPresenceChanges() {
    const current = getPresence();
    for (const type of ["flora", "grazer", "hunter"]) {
      if (state.presence[type] && !current[type]) {
        const label = type === "flora" ? "草地生态（包括种子库）" : SPECIES[type].label;
        addEvent(`${label}在世界中彻底灭绝。`, state.year);
      } else if (!state.presence[type] && current[type] && state.year > 0.001) {
        const label = type === "flora" ? "草地生态" : SPECIES[type].label;
        addEvent(`${label}重新出现在世界中。`, state.year);
      }
    }
    state.presence = current;
  }

  function getSeason() {
    if (!state.rules.fullSeasons) return "summer";
    const phase = ((state.year % 1) + 1) % 1;
    if (phase < 0.25) return "spring";
    if (phase < 0.5) return "summer";
    if (phase < 0.75) return "autumn";
    return "winter";
  }

  function updateSeason() {
    const nextSeason = getSeason();
    if (nextSeason === state.season) return;
    state.season = nextSeason;
    const totals = getResourceTotals();

    if (nextSeason === "spring") {
      addEvent(`春季到来：地下种子开始萌发，当前种子储备${Math.round(totals.seeds)}。`, state.year);
    } else if (nextSeason === "summer") {
      addEvent("夏季到来：鲜草进入稳定生长期，动物活动增强。", state.year);
    } else if (nextSeason === "autumn") {
      addEvent("秋季到来：植物开始结籽，并逐渐形成枯草储备。", state.year);
    } else {
      addEvent(`冬季到来：鲜草将转为枯草，但${Math.round(totals.seeds)}份种子仍在地下休眠。`, state.year);
    }
  }

  function rolloverLedgerIfNeeded(previousYear) {
    const previousWhole = Math.floor(previousYear);
    const currentWhole = Math.floor(state.year);
    if (currentWhole <= previousWhole) return;
    addEvent(`世界进入第${currentWhole + 1}年。上一年：食草兽出生${state.ledger.grazerBirths}，猎食兽出生${state.ledger.hunterBirths}，被捕食${state.ledger.predationDeaths}，饿死${state.ledger.starvationDeaths}。`, state.year);
    state.ledger = freshLedger(currentWhole);
  }

  function updatePatch(patch, dt) {
    const growthMultiplier = state.rules.growth;
    const capacity = PATCH.maxGreen * (0.72 + patch.fertility * 0.28);
    const crowding = clamp(1 - patch.green / Math.max(1, capacity), 0, 1);
    let growthRate = PATCH.mildGrowth;

    if (state.rules.fullSeasons) {
      if (state.season === "spring") growthRate = PATCH.springGrowth;
      if (state.season === "summer") growthRate = PATCH.summerGrowth;
      if (state.season === "autumn") growthRate = PATCH.autumnGrowth;
      if (state.season === "winter") growthRate = 0;
    }

    if (state.season === "spring" && patch.seeds > 0 && patch.green < capacity * 0.65) {
      const germination = Math.min(
        patch.seeds,
        PATCH.springGermination * growthMultiplier * patch.fertility * crowding * dt,
      );
      patch.seeds -= germination;
      patch.green += germination * 0.92;
      incrementMetric("germinatedBiomass", germination * 0.92);
    }

    if (growthRate > 0 && patch.green > 0.2) {
      patch.green += growthRate * growthMultiplier * patch.fertility * crowding * dt;
    }

    if (state.season === "autumn" && patch.green > 1) {
      const seedGain = patch.green * PATCH.autumnSeedRate * growthMultiplier * dt;
      patch.seeds = clamp(patch.seeds + seedGain, 0, PATCH.maxSeeds);
      const dryGain = Math.min(patch.green, patch.green * 0.16 * dt);
      patch.green -= dryGain;
      patch.dry = clamp(patch.dry + dryGain, 0, PATCH.maxDry);
    }

    if (state.season === "winter" && state.rules.fullSeasons && patch.green > 0) {
      const withered = Math.min(patch.green, PATCH.winterWither * dt);
      patch.green -= withered;
      patch.dry = clamp(patch.dry + withered * 0.88, 0, PATCH.maxDry);
    }

    const dryDecay = Math.min(patch.dry, patch.dry * PATCH.dryDecay * dt);
    patch.dry -= dryDecay;
    patch.fertility = clamp(
      patch.fertility + dryDecay * PATCH.fertilityRecovery * 0.01,
      0.35,
      1.35,
    );
    patch.seeds = Math.max(0, patch.seeds - patch.seeds * PATCH.seedDecay * dt);
    patch.green = clamp(patch.green, 0, PATCH.maxGreen);
    patch.dry = clamp(patch.dry, 0, PATCH.maxDry);
  }

  function updatePatches(dt) {
    for (const patch of state.patches) updatePatch(patch, dt);
  }

  function findNearest(source, targets, radius, predicate = null) {
    let nearest = null;
    let nearestDistance = radius * radius;
    for (const target of targets) {
      if (predicate && !predicate(target)) continue;
      const currentDistance = distanceSquared(source, target);
      if (currentDistance < nearestDistance) {
        nearestDistance = currentDistance;
        nearest = target;
      }
    }
    return nearest;
  }

  function moveAnimal(animal, desiredAngle, speed, dt) {
    animal.angle = turnToward(animal.angle, desiredAngle, 7.2 * dt + 0.035);
    animal.x += Math.cos(animal.angle) * speed * dt;
    animal.y += Math.sin(animal.angle) * speed * dt;

    const margin = 12;
    if (animal.x < margin || animal.x > WORLD.width - margin) {
      animal.angle = Math.PI - animal.angle;
      animal.x = clamp(animal.x, margin, WORLD.width - margin);
    }
    if (animal.y < margin || animal.y > WORLD.height - margin) {
      animal.angle = -animal.angle;
      animal.y = clamp(animal.y, margin, WORLD.height - margin);
    }
  }

  function wander(animal, config, dt) {
    animal.wanderTimer -= dt;
    if (animal.wanderTimer <= 0) {
      animal.angle += randomBetween(-1.35, 1.35);
      animal.wanderTimer = randomBetween(0.025, 0.13);
    }
    moveAnimal(animal, animal.angle, config.moveSpeed * 0.46, dt);
  }

  function localGreenBiomass(animal, radius = 170) {
    const radiusSquared = radius * radius;
    let amount = 0;
    for (const patch of state.patches) {
      if (distanceSquared(animal, patch) <= radiusSquared) amount += patch.green + patch.dry * 0.35;
    }
    return amount;
  }

  function reproductionSeasonMultiplier() {
    if (!state.rules.fullSeasons) return 1;
    if (state.season === "spring") return 1.25;
    if (state.season === "summer") return 0.9;
    if (state.season === "autumn") return 0.28;
    return 0;
  }

  function reproduce(parent, type) {
    const config = SPECIES[type];
    if (state.grazers.length + state.hunters.length >= WORLD.maxAnimals) return false;
    parent.energy -= config.reproductionCost;
    parent.reproductionCooldown = config.reproductionCooldown;
    const child = createAnimal(type, parent.x, parent.y, {
      spread: 16,
      age: 0,
      energy: config.maxEnergy * 0.48,
      reproductionCooldown: config.reproductionCooldown * 0.8,
    });
    if (!child) return false;
    incrementMetric(type === "grazer" ? "grazerBirths" : "hunterBirths");
    return true;
  }

  function removeAnimal(collection, index, reason) {
    const animal = collection[index];
    if (!animal) return;
    collection.splice(index, 1);
    createCarcass(animal.x, animal.y, animal.type, animal.type === "grazer" ? 28 : 36);
    if (reason === "starvation") incrementMetric("starvationDeaths");
    if (reason === "oldAge") incrementMetric("oldAgeDeaths");
    if (reason === "predation") incrementMetric("predationDeaths");
  }

  function chooseFoodPatch(grazer) {
    return findNearest(
      grazer,
      state.patches,
      SPECIES.grazer.senseRadius,
      (patch) => patch.green > 1 || patch.dry > 2,
    );
  }

  function grazerDensityPressure() {
    const totals = getResourceTotals();
    const carryingEstimate = Math.max(8, totals.green / 24 + totals.dry / 48);
    return clamp(1 - state.grazers.length / carryingEstimate, 0.05, 1);
  }

  function updateGrazers(dt) {
    const config = SPECIES.grazer;
    const seasonDrain = state.season === "winter" && state.rules.fullSeasons ? config.winterDrain : 1;

    for (let index = state.grazers.length - 1; index >= 0; index -= 1) {
      const grazer = state.grazers[index];
      grazer.age += dt;
      grazer.lastMealAge += dt;
      grazer.energy -= config.baseDrain * seasonDrain * dt;
      grazer.reproductionCooldown = Math.max(0, grazer.reproductionCooldown - dt);

      const threat = findNearest(grazer, state.hunters, 92);
      if (threat) {
        const fleeAngle = Math.atan2(grazer.y - threat.y, grazer.x - threat.x);
        moveAnimal(grazer, fleeAngle, config.moveSpeed * 1.18, dt);
        grazer.energy -= 3.2 * dt;
      } else {
        const patch = chooseFoodPatch(grazer);
        if (patch) {
          const foodAngle = Math.atan2(patch.y - grazer.y, patch.x - grazer.x);
          moveAnimal(grazer, foodAngle, config.moveSpeed, dt);
          const reach = patch.radius * 0.7 + 9;
          if (distanceSquared(grazer, patch) < reach * reach) {
            let eaten = 0;
            if (patch.green > 0.2) {
              eaten = Math.min(patch.green, config.eatRate * dt);
              patch.green -= eaten;
              grazer.energy = Math.min(config.maxEnergy, grazer.energy + eaten * config.greenEnergy);
              incrementMetric("greenConsumed", eaten);
            } else if (patch.dry > 0.2) {
              eaten = Math.min(patch.dry, config.eatRate * 0.62 * dt);
              patch.dry -= eaten;
              grazer.energy = Math.min(config.maxEnergy, grazer.energy + eaten * config.dryEnergy);
              incrementMetric("dryConsumed", eaten);
            }
            if (eaten > 0) grazer.lastMealAge = 0;
          }
        } else {
          wander(grazer, config, dt);
        }
      }

      const localFood = localGreenBiomass(grazer);
      const canReproduce = grazer.energy >= config.reproductionEnergy
        && grazer.age >= config.minReproductionAge
        && grazer.reproductionCooldown <= 0
        && localFood >= 70
        && state.grazers.length >= 2;
      const reproductionProbability = config.reproductionRate
        * state.rules.fertility
        * reproductionSeasonMultiplier()
        * grazerDensityPressure()
        * dt;

      if (canReproduce && Math.random() < reproductionProbability) reproduce(grazer, "grazer");

      if (grazer.energy <= 0) {
        removeAnimal(state.grazers, index, "starvation");
      } else if (grazer.age >= grazer.lifespan) {
        removeAnimal(state.grazers, index, "oldAge");
      }
    }
  }

  function hunterDensityPressure() {
    const sustainableHunters = Math.max(1, state.grazers.length / 7);
    return clamp(1 - state.hunters.length / (sustainableHunters + 1), 0.03, 1);
  }

  function consumeCarcass(hunter, carcass, dt) {
    const amount = Math.min(carcass.biomass, 38 * dt);
    carcass.biomass -= amount;
    hunter.energy = Math.min(SPECIES.hunter.maxEnergy, hunter.energy + amount * SPECIES.hunter.carrionEnergy);
    hunter.lastMealAge = 0;
  }

  function updateHunters(dt) {
    const config = SPECIES.hunter;
    const seasonDrain = state.season === "winter" && state.rules.fullSeasons ? config.winterDrain : 1;

    for (let index = state.hunters.length - 1; index >= 0; index -= 1) {
      const hunter = state.hunters[index];
      hunter.age += dt;
      hunter.lastMealAge += dt;
      hunter.energy -= config.baseDrain * seasonDrain * dt;
      hunter.reproductionCooldown = Math.max(0, hunter.reproductionCooldown - dt);
      hunter.attackCooldown = Math.max(0, hunter.attackCooldown - dt);

      const prey = findNearest(hunter, state.grazers, config.senseRadius);
      const carcass = findNearest(hunter, state.carcasses, config.senseRadius * 0.75, (item) => item.biomass > 1);

      if (prey) {
        const preyAngle = Math.atan2(prey.y - hunter.y, prey.x - hunter.x);
        moveAnimal(hunter, preyAngle, config.moveSpeed, dt);
        if (distanceSquared(hunter, prey) < 17 * 17 && hunter.attackCooldown <= 0) {
          hunter.attackCooldown = config.attackCooldown;
          incrementMetric("huntAttempts");
          const successChance = clamp(0.25 + (hunter.energy / config.maxEnergy) * 0.2, 0.28, 0.48);
          if (Math.random() < successChance) {
            const preyIndex = state.grazers.indexOf(prey);
            if (preyIndex >= 0) {
              state.grazers.splice(preyIndex, 1);
              createCarcass(prey.x, prey.y, "grazer", 10);
              hunter.energy = Math.min(config.maxEnergy, hunter.energy + config.preyEnergy);
              hunter.lastMealAge = 0;
              incrementMetric("predationDeaths");
              incrementMetric("huntSuccesses");
              state.effects.push({ x: prey.x, y: prey.y, age: 0, color: "#8b70b7" });
            }
          }
        }
      } else if (carcass) {
        const carcassAngle = Math.atan2(carcass.y - hunter.y, carcass.x - hunter.x);
        moveAnimal(hunter, carcassAngle, config.moveSpeed * 0.72, dt);
        if (distanceSquared(hunter, carcass) < 20 * 20) consumeCarcass(hunter, carcass, dt);
      } else {
        wander(hunter, config, dt);
      }

      const preyPerHunter = state.hunters.length > 0 ? state.grazers.length / state.hunters.length : 0;
      const canReproduce = hunter.energy >= config.reproductionEnergy
        && hunter.age >= config.minReproductionAge
        && hunter.reproductionCooldown <= 0
        && preyPerHunter >= 6
        && state.hunters.length >= 2;
      const reproductionProbability = config.reproductionRate
        * state.rules.fertility
        * reproductionSeasonMultiplier()
        * hunterDensityPressure()
        * dt;

      if (canReproduce && Math.random() < reproductionProbability) reproduce(hunter, "hunter");

      if (hunter.energy <= 0) {
        removeAnimal(state.hunters, index, "starvation");
      } else if (hunter.age >= hunter.lifespan) {
        removeAnimal(state.hunters, index, "oldAge");
      }
    }
  }

  function updateCarcasses(dt) {
    for (let index = state.carcasses.length - 1; index >= 0; index -= 1) {
      const carcass = state.carcasses[index];
      carcass.age += dt;
      const decomposed = Math.min(carcass.biomass, Math.max(2, carcass.biomass * 1.55) * dt);
      carcass.biomass -= decomposed;
      incrementMetric("carcassDecomposed", decomposed);

      const patch = findNearest(carcass, state.patches, 115);
      if (patch) {
        patch.fertility = clamp(patch.fertility + decomposed * 0.0008, 0.35, 1.35);
        patch.seeds = clamp(patch.seeds + decomposed * 0.018, 0, PATCH.maxSeeds);
      }

      if (carcass.biomass <= 0.4 || carcass.age >= carcass.maxAge) state.carcasses.splice(index, 1);
    }
  }

  function updateMission(dt) {
    if (state.missionComplete) return;
    const present = getPresence();
    const allPresent = present.flora && present.grazer && present.hunter;
    if (allPresent) {
      state.coexistenceYears += dt;
      state.longestCoexistence = Math.max(state.longestCoexistence, state.coexistenceYears);
      if (state.coexistenceYears >= WORLD.missionYears) {
        state.coexistenceYears = WORLD.missionYears;
        state.missionComplete = true;
        addEvent("创世命题完成：三层生态连续经历了3个完整年份。", state.year);
        showToast("命题完成：这个世界已经跨越三次完整四季！", 4200);
      }
    } else if (state.coexistenceYears > 0) {
      state.coexistenceYears = 0;
    }
  }

  function buildTrendSnapshot() {
    const totals = getResourceTotals();
    return {
      year: state.year,
      flora: totals.green,
      grazer: state.grazers.length,
      hunter: state.hunters.length,
    };
  }

  function classifyTrend(current, previous, extinctionState = false) {
    if (extinctionState) return "灭绝";
    const difference = current - previous;
    const threshold = Math.max(1.5, Math.abs(previous) * 0.1);
    if (difference > threshold) return "上升";
    if (difference < -threshold) return "下降";
    return "稳定";
  }

  function updateTrends() {
    if (!state.trendBaseline) state.trendBaseline = buildTrendSnapshot();
    if (state.year - state.trendBaseline.year < WORLD.trendWindowYears) return;
    const current = buildTrendSnapshot();
    const totals = getResourceTotals();

    if (totals.green <= 0.5 && totals.seeds + totals.dry > 1) {
      state.trendValues.flora = "休眠";
    } else {
      state.trendValues.flora = classifyTrend(current.flora, state.trendBaseline.flora, !hasDormantPlantLife());
    }
    state.trendValues.grazer = classifyTrend(current.grazer, state.trendBaseline.grazer, state.grazers.length === 0);
    state.trendValues.hunter = classifyTrend(current.hunter, state.trendBaseline.hunter, state.hunters.length === 0);
    state.trendBaseline = current;
  }

  function updateWorld(dt) {
    const previousYear = state.year;
    state.year += dt;
    rolloverLedgerIfNeeded(previousYear);
    updateSeason();
    updatePatches(dt);
    updateGrazers(dt);
    updateHunters(dt);
    updateCarcasses(dt);
    updateMission(dt);
    updateTrends();
    checkPresenceChanges();
  }

  function getSubsteps(speed) {
    if (speed >= 12) return 4;
    if (speed >= 4) return 2;
    return 1;
  }

  function addEvent(message, year = state.year) {
    state.events.unshift({
      id: `${Date.now()}-${Math.random()}`,
      year: Math.max(0, year),
      message,
    });
    state.events = state.events.slice(0, 14);
    renderEventLog();
  }

  function renderEventLog() {
    const fragment = document.createDocumentFragment();
    for (const event of state.events) {
      const item = document.createElement("li");
      const time = document.createElement("time");
      time.textContent = `第 ${event.year.toFixed(2)} 年`;
      const text = document.createElement("span");
      text.textContent = event.message;
      item.append(time, text);
      fragment.append(item);
    }
    elements.eventLog.replaceChildren(fragment);
  }

  function showToast(message, duration = 1900) {
    elements.worldToast.textContent = message;
    elements.worldToast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      elements.worldToast.classList.remove("is-visible");
    }, duration);
  }

  function trendText(value) {
    if (value === "上升") return "↗ 上升";
    if (value === "下降") return "↘ 下降";
    if (value === "休眠") return "❄ 休眠待萌发";
    if (value === "灭绝") return "× 已灭绝";
    return "— 稳定";
  }

  function calculateBalance() {
    const totals = getResourceTotals();
    const grazers = state.grazers.length;
    const hunters = state.hunters.length;
    const plantReserve = totals.green + totals.dry * 0.55 + totals.seeds * 0.7;
    const plantLife = hasDormantPlantLife();

    if (!plantLife && grazers === 0 && hunters === 0) {
      return { score: 0, label: "生态崩溃", advice: "世界中已没有草地种子、动物或可恢复资源。" };
    }
    if (!plantLife) {
      return { score: 5, label: "植物系统灭绝", advice: "地下种子库也已耗尽，现有动物只能继续消耗剩余能量。" };
    }
    if (grazers === 0 && hunters > 0) {
      return { score: 18, label: "猎物断层", advice: "猎食兽缺少活体猎物，只能暂时依靠尸体，生态无法长期维持。" };
    }
    if (hunters === 0 && grazers > 0) {
      return { score: 46, label: "失去捕食层", advice: "食草兽失去天敌，需要依靠食物承载力自行回落。" };
    }

    const reservePerGrazer = grazers > 0 ? plantReserve / grazers : plantReserve;
    const preyPerHunter = hunters > 0 ? grazers / hunters : 99;
    const greenTrend = state.trendValues.flora;
    const grazerTrend = state.trendValues.grazer;
    let score = 72;

    if (reservePerGrazer < 16) score -= 34;
    else if (reservePerGrazer < 28) score -= 17;
    else if (reservePerGrazer > 75) score += 6;

    if (hunters > 0 && preyPerHunter < 4.5) score -= 24;
    else if (hunters > 0 && preyPerHunter < 6) score -= 10;

    if (greenTrend === "下降" && grazerTrend === "上升") score -= 18;
    if (state.season === "winter" && totals.dry < Math.max(12, grazers * 2.5)) score -= 14;
    if (totals.seeds > 80) score += 6;

    score = clamp(score, 0, 100);
    if (greenTrend === "下降" && grazerTrend === "上升") {
      return { score, label: "过度啃食正在形成", advice: `鲜草下降而食草兽仍在增长；当前每只食草兽可用储备约${reservePerGrazer.toFixed(1)}。` };
    }
    if (state.season === "winter" && totals.green < 4 && totals.seeds > 1) {
      return { score, label: "冬季休眠", advice: `鲜草暂时很少，但仍有${Math.round(totals.seeds)}份种子和${Math.round(totals.dry)}份枯草等待春季。` };
    }
    if (hunters > 0 && preyPerHunter < 5) {
      return { score, label: "捕食者偏多", advice: `每只猎食兽仅对应${preyPerHunter.toFixed(1)}只食草兽，猎食兽可能先因缺乏猎物而衰退。` };
    }
    if (reservePerGrazer < 22) {
      return { score, label: "食物储备偏低", advice: `每只食草兽可用植物储备约${reservePerGrazer.toFixed(1)}，下一季可能出现饥饿。` };
    }
    if (score >= 82) {
      return { score, label: "具有恢复力", advice: "鲜草、枯草和种子库共同提供缓冲，继续观察种群是否形成周期波动。" };
    }
    return { score, label: "脆弱但可恢复", advice: "生态仍有恢复基础，但某些种群或资源储备正在接近风险区。" };
  }

  function updateUi(force = false) {
    const now = performance.now();
    if (!force && now - lastUiUpdate < 100) return;
    lastUiUpdate = now;

    const totals = getResourceTotals();
    const progress = state.missionComplete ? 100 : (state.coexistenceYears / WORLD.missionYears) * 100;
    const present = getPresence();
    const allPresent = present.flora && present.grazer && present.hunter;
    const balance = calculateBalance();
    const season = SEASONS[state.season];

    elements.worldAge.textContent = `第 ${Math.floor(state.year) + 1} 年 · ${(state.year % 1).toFixed(2)}`;
    elements.seasonLabel.textContent = season.label;
    elements.seasonLabel.style.color = season.color;

    elements.floraCount.textContent = String(Math.round(totals.green));
    elements.dryCount.textContent = String(Math.round(totals.dry));
    elements.seedCount.textContent = String(Math.round(totals.seeds));
    elements.grazerCount.textContent = String(state.grazers.length);
    elements.hunterCount.textContent = String(state.hunters.length);
    elements.carcassCount.textContent = String(state.carcasses.length);
    elements.floraTrend.textContent = trendText(state.trendValues.flora);
    elements.grazerTrend.textContent = trendText(state.trendValues.grazer);
    elements.hunterTrend.textContent = trendText(state.trendValues.hunter);

    elements.hudGreen.textContent = String(Math.round(totals.green));
    elements.hudDry.textContent = String(Math.round(totals.dry));
    elements.hudSeeds.textContent = String(Math.round(totals.seeds));

    elements.missionProgress.style.width = `${clamp(progress, 0, 100)}%`;
    elements.missionYears.textContent = `${state.coexistenceYears.toFixed(1)} / ${WORLD.missionYears} 年`;
    elements.missionState.textContent = state.missionComplete
      ? "命题完成"
      : !state.running && state.year === 0
        ? "等待时间开始"
        : allPresent
          ? "正在跨越四季"
          : "生态链不完整";

    elements.balanceLabel.textContent = balance.label;
    elements.balanceFill.style.width = `${balance.score}%`;
    elements.balanceAdvice.textContent = balance.advice;

    elements.ledgerYear.textContent = `第${state.ledger.year + 1}年`;
    elements.grazerBirths.textContent = String(state.ledger.grazerBirths);
    elements.hunterBirths.textContent = String(state.ledger.hunterBirths);
    elements.predationDeaths.textContent = String(state.ledger.predationDeaths);
    elements.starvationDeaths.textContent = String(state.ledger.starvationDeaths);
    elements.oldAgeDeaths.textContent = String(state.ledger.oldAgeDeaths);
    elements.germinatedBiomass.textContent = String(Math.round(state.ledger.germinatedBiomass));
  }

  function syncPlaybackControls() {
    elements.playToggle.setAttribute("aria-pressed", String(state.running));
    elements.playIcon.textContent = state.running ? "Ⅱ" : "▶";
    elements.playLabel.textContent = state.running ? "暂停时间" : state.year > 0 ? "继续时间" : "开始时间";
    elements.pauseBanner.classList.toggle("is-hidden", state.running);
    elements.pauseBanner.textContent = state.year > 0 ? "时间已暂停" : "时间尚未开始";

    for (const button of elements.speedButtons) {
      const active = Number(button.dataset.speed) === state.speed;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function setRunning(running) {
    state.running = running;
    accumulator = 0;
    lastFrameTime = performance.now();
    syncPlaybackControls();
    updateUi(true);
  }

  function toggleRunning() {
    setRunning(!state.running);
  }

  function selectSpecies(type) {
    state.selectedSpecies = type;
    for (const button of elements.speciesButtons) {
      const active = button.dataset.species === type;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }

    const description = type === "flora"
      ? "点击世界创建草地，已有草地会补充种子与生物量。"
      : type === "grazer"
        ? "点击世界投放3只食草兽。"
        : "点击世界投放1只猎食兽。";
    const label = type === "flora" ? "播种草地" : SPECIES[type].label;
    elements.placementHint.textContent = `已选择${label}：${description}`;
  }

  function canvasCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WORLD.width,
      y: ((event.clientY - rect.top) / rect.height) * WORLD.height,
    };
  }

  function bindEvents() {
    elements.playToggle.addEventListener("click", toggleRunning);

    for (const button of elements.speedButtons) {
      button.addEventListener("click", () => {
        state.speed = Number(button.dataset.speed);
        syncPlaybackControls();
        showToast(`世界速度设为 ${state.speed}×`);
      });
    }

    for (const button of elements.speciesButtons) {
      button.addEventListener("click", () => selectSpecies(button.dataset.species));
    }

    elements.growthRule.addEventListener("input", () => {
      state.rules.growth = Number(elements.growthRule.value);
      elements.growthValue.value = `${state.rules.growth.toFixed(1)}×`;
    });
    elements.growthRule.addEventListener("change", () => {
      addEvent(`世界法则改变：植物生长率调整为${state.rules.growth.toFixed(1)}×。`);
    });

    elements.fertilityRule.addEventListener("input", () => {
      state.rules.fertility = Number(elements.fertilityRule.value);
      elements.fertilityValue.value = `${state.rules.fertility.toFixed(1)}×`;
    });
    elements.fertilityRule.addEventListener("change", () => {
      addEvent(`世界法则改变：动物繁殖倾向调整为${state.rules.fertility.toFixed(1)}×。`);
    });

    elements.seasonsRule.addEventListener("change", () => {
      state.rules.fullSeasons = elements.seasonsRule.checked;
      addEvent(state.rules.fullSeasons
        ? "世界法则改变：完整四季重新生效。"
        : "世界法则改变：季节被关闭，世界保持温和夏季。");
      updateSeason();
      updateUi(true);
    });

    elements.resetButton.addEventListener("click", () => {
      seedWorld();
      showToast("示范世界已重置");
    });
    elements.clearButton.addEventListener("click", clearLife);

    canvas.addEventListener("pointermove", (event) => {
      const point = canvasCoordinates(event);
      state.pointer = { ...point, inside: true };
    });
    canvas.addEventListener("pointerleave", () => {
      state.pointer.inside = false;
    });
    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const point = canvasCoordinates(event);
      state.pointer = { ...point, inside: true };
      placeSpecies(state.selectedSpecies, point.x, point.y);
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && event.target === document.body) {
        event.preventDefault();
        toggleRunning();
      }
    });

    document.addEventListener("visibilitychange", () => {
      lastFrameTime = performance.now();
      accumulator = 0;
    });
  }

  function seasonBackgroundColors() {
    if (state.season === "spring") return ["#badbb6", "#d8e5ae", "#a4ccb2"];
    if (state.season === "summer") return ["#a9d0a4", "#d9df9c", "#91c3aa"];
    if (state.season === "autumn") return ["#c7cf9e", "#e3d4a0", "#b9c49e"];
    return ["#a9c7c5", "#c9d8cd", "#aabfc0"];
  }

  function drawBackground() {
    const [start, middle, end] = seasonBackgroundColors();
    const gradient = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    gradient.addColorStop(0, start);
    gradient.addColorStop(0.55, middle);
    gradient.addColorStop(1, end);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    for (const patch of state.decor) {
      ctx.save();
      ctx.translate(patch.x, patch.y);
      ctx.rotate(patch.rotation);
      ctx.fillStyle = patch.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, patch.radiusX, patch.radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(49, 86, 70, 0.045)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.height);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.width, y);
      ctx.stroke();
    }
  }

  function drawPatch(patch, timestamp) {
    const greenRatio = clamp(patch.green / PATCH.maxGreen, 0, 1);
    const dryRatio = clamp(patch.dry / PATCH.maxDry, 0, 1);
    const dormant = greenRatio < 0.03 && patch.seeds > 1;
    const pulse = 1 + Math.sin(timestamp * 0.0014 + patch.phase) * 0.02;

    ctx.save();
    ctx.translate(patch.x, patch.y);
    ctx.scale(pulse, pulse);

    ctx.fillStyle = `rgba(114, 91, 58, ${0.08 + patch.fertility * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(0, 4, patch.radius, patch.radius * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    if (dryRatio > 0.01) {
      ctx.fillStyle = `rgba(190, 151, 77, ${0.2 + dryRatio * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, patch.radius * (0.72 + dryRatio * 0.2), patch.radius * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (greenRatio > 0.01) {
      ctx.fillStyle = state.season === "winter"
        ? `rgba(91, 143, 108, ${0.25 + greenRatio * 0.55})`
        : `rgba(72, 151, 91, ${0.3 + greenRatio * 0.58})`;
      ctx.beginPath();
      ctx.ellipse(0, -2, patch.radius * (0.58 + greenRatio * 0.34), patch.radius * (0.42 + greenRatio * 0.22), 0, 0, Math.PI * 2);
      ctx.fill();

      const bladeCount = Math.max(3, Math.round(4 + greenRatio * 11));
      ctx.strokeStyle = state.season === "autumn" ? "#6b995f" : "#3d8153";
      ctx.lineWidth = 1.5;
      for (let index = 0; index < bladeCount; index += 1) {
        const angle = (index / bladeCount) * Math.PI * 2 + patch.phase;
        const distance = patch.radius * 0.55 * Math.sqrt((index + 1) / bladeCount);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance * 0.58;
        const height = 5 + greenRatio * 7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 2, y - height * 0.55, x + Math.sin(angle) * 2, y - height);
        ctx.stroke();
      }
    }

    if (dormant) {
      ctx.strokeStyle = "rgba(238, 226, 177, 0.78)";
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, patch.radius * 0.52, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGrazer(animal, timestamp) {
    const bob = Math.sin(timestamp * 0.006 + animal.bobPhase) * 1.2;
    ctx.save();
    ctx.translate(animal.x, animal.y + bob);
    ctx.rotate(animal.angle);
    ctx.fillStyle = "rgba(53, 58, 44, 0.16)";
    ctx.beginPath();
    ctx.ellipse(-1, 7, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e6ad4a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5cc73";
    ctx.beginPath();
    ctx.arc(7, -1, 5.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d08b38";
    ctx.beginPath();
    ctx.ellipse(6, -6, 2.2, 4.5, -0.35, 0, Math.PI * 2);
    ctx.ellipse(10, -5.5, 2.2, 4.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b4038";
    ctx.beginPath();
    ctx.arc(9.5, -2, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHunter(animal, timestamp) {
    const bob = Math.sin(timestamp * 0.007 + animal.bobPhase) * 0.9;
    ctx.save();
    ctx.translate(animal.x, animal.y + bob);
    ctx.rotate(animal.angle);
    ctx.strokeStyle = "#5c4787";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, 2);
    ctx.quadraticCurveTo(-15, 8, -18, 1);
    ctx.stroke();
    ctx.fillStyle = "#7960aa";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-2, -9);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-2, 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f6e7a9";
    ctx.beginPath();
    ctx.arc(6, -2.7, 1.25, 0, Math.PI * 2);
    ctx.arc(6, 2.7, 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCarcass(carcass) {
    const alpha = clamp(carcass.biomass / 30, 0.18, 0.85);
    ctx.save();
    ctx.translate(carcass.x, carcass.y);
    ctx.rotate(carcass.id * 0.73);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = carcass.sourceType === "grazer" ? "#8a6b4f" : "#665672";
    ctx.beginPath();
    ctx.roundRect(-8, -3, 16, 6, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(dtSeconds) {
    for (let index = state.effects.length - 1; index >= 0; index -= 1) {
      const effect = state.effects[index];
      effect.age += dtSeconds;
      const progress = effect.age / 0.7;
      if (progress >= 1) {
        state.effects.splice(index, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 3 - progress * 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 8 + progress * 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlacementPreview() {
    if (!state.pointer.inside) return;
    const config = SPECIES[state.selectedSpecies];
    const radius = state.selectedSpecies === "flora" ? 45 : 26;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.pointer.x, state.pointer.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.restore();
  }

  function render(timestamp, frameDeltaSeconds) {
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    drawBackground();
    for (const patch of state.patches) drawPatch(patch, timestamp);
    for (const carcass of state.carcasses) drawCarcass(carcass);
    for (const grazer of state.grazers) drawGrazer(grazer, timestamp);
    for (const hunter of state.hunters) drawHunter(hunter, timestamp);
    drawEffects(frameDeltaSeconds);
    drawPlacementPreview();
  }

  function gameLoop(timestamp) {
    const elapsed = Math.min(250, timestamp - lastFrameTime);
    const frameDeltaSeconds = elapsed / 1000;
    lastFrameTime = timestamp;

    if (state.running) {
      accumulator += elapsed;
      let safety = 0;
      while (accumulator >= WORLD.fixedStepMs && safety < 5) {
        const substeps = getSubsteps(state.speed);
        const dt = (WORLD.yearsPerStep * state.speed) / substeps;
        for (let step = 0; step < substeps; step += 1) updateWorld(dt);
        accumulator -= WORLD.fixedStepMs;
        safety += 1;
      }
    }

    render(timestamp, frameDeltaSeconds);
    updateUi();
    requestAnimationFrame(gameLoop);
  }

  function telemetrySnapshot() {
    const totals = getResourceTotals();
    return {
      version: "0.2.0",
      worldYear: state.year,
      season: state.season,
      running: state.running,
      speed: state.speed,
      rules: { ...state.rules },
      resources: {
        greenBiomass: totals.green,
        dryBiomass: totals.dry,
        seedBank: totals.seeds,
        averageFertility: state.patches.length > 0 ? totals.fertility / state.patches.length : 0,
        patchCount: state.patches.length,
      },
      populations: {
        grazers: state.grazers.length,
        hunters: state.hunters.length,
        carcasses: state.carcasses.length,
      },
      mission: {
        coexistenceYears: state.coexistenceYears,
        longestCoexistence: state.longestCoexistence,
        complete: state.missionComplete,
      },
      trends: { ...state.trendValues },
      currentYearMetrics: { ...state.ledger },
      lifetimeMetrics: { ...state.lifetime },
      balance: calculateBalance(),
    };
  }

  function initialize() {
    bindEvents();
    selectSpecies("flora");
    seedWorld();
    window.LittleGodTelemetry = { getSnapshot: telemetrySnapshot };
    requestAnimationFrame(gameLoop);
  }

  initialize();
})();
