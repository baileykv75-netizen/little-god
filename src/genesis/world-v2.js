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
    maxPatches: 72,
  });

  const { WORLD, PATCH } = LG;

  LG.createDecor = () => {
    LG.state.decor = [];
    const colors = [
      "rgba(239,231,178,.11)",
      "rgba(91,151,121,.08)",
      "rgba(99,153,172,.07)",
      "rgba(255,255,255,.08)",
    ];
    for (let index = 0; index < 42; index += 1) {
      LG.state.decor.push({
        x: LG.randomBetween(30, WORLD.width - 30),
        y: LG.randomBetween(30, WORLD.height - 30),
        radiusX: LG.randomBetween(45, 180),
        radiusY: LG.randomBetween(28, 105),
        rotation: LG.randomBetween(0, Math.PI),
        color: colors[index % colors.length],
      });
    }
  };

  LG.createPatch = (x, y, options = {}) => {
    if (LG.state.patches.length >= WORLD.maxPatches) return null;
    const margin = 42;
    const patch = {
      id: LG.state.nextEntityId++,
      type: "flora",
      x: LG.clamp(x, margin, WORLD.width - margin),
      y: LG.clamp(y, margin, WORLD.height - margin),
      radius: options.radius ?? LG.randomBetween(38, 62),
      green: LG.clamp(options.green ?? LG.randomBetween(68, 96), 0, PATCH.maxGreen),
      dry: LG.clamp(options.dry ?? LG.randomBetween(7, 15), 0, PATCH.maxDry),
      seeds: LG.clamp(options.seeds ?? LG.randomBetween(34, 54), 0, PATCH.maxSeeds),
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

  LG.createAnimal = (type, x, y, options = {}) => {
    if (LG.state.grazers.length + LG.state.hunters.length >= WORLD.maxAnimals) return null;
    const config = LG.SPECIES[type];
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

  function seedHabitat(centerX, centerY, patchCount = 6) {
    for (let index = 0; index < patchCount; index += 1) {
      const angle = (index / patchCount) * Math.PI * 2 + LG.randomBetween(-0.35, 0.35);
      const distance = LG.randomBetween(75, 240);
      LG.createPatch(
        centerX + Math.cos(angle) * distance,
        centerY + Math.sin(angle) * distance,
        { radius: LG.randomBetween(44, 70) },
      );
    }
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
    state.pointer = { x: WORLD.width / 2, y: WORLD.height / 2, inside: false };
    state.eventFlags = {
      firstHunt: false,
      firstHunterBirth: false,
      firstSpringRecovery: false,
      grazerEndangered: false,
      hunterEndangered: false,
      firstInheritedBirth: false,
    };

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
    LG.addEvent("Genesis世界已扩展为2048×1280，并形成四个初始局部栖息区。", 0);
    LG.addEvent("左键动物可直接观察，双击可跟随；滚轮缩放，空格或中键拖动世界。", 0);
  };
})();