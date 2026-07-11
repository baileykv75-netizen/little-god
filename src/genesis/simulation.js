(() => {
  "use strict";

  const LG = window.LittleGod;
  const { state: s, WORLD, PATCH, SPECIES } = LG;

  const statsOf = (animal) => animal.derived || {
    walkSpeed: SPECIES[animal.type].walkSpeed,
    burstSpeed: animal.type === "grazer" ? SPECIES.grazer.sprintSpeed : SPECIES.hunter.chaseSpeed,
    maxEnergy: SPECIES[animal.type].maxEnergy,
    baseDrain: SPECIES[animal.type].baseDrain,
    staminaMax: SPECIES[animal.type].staminaMax,
    staminaRecovery: SPECIES[animal.type].staminaRecovery,
    lifespan: animal.lifespan,
    fertilityMultiplier: 1,
    senseRadius: SPECIES[animal.type].senseRadius,
    threatRadius: SPECIES.grazer.threatRadius,
    mateRange: 220,
    combatBase: 50,
  };

  LG.findNearest = (source, targets, radius, predicate = null) => {
    let nearest = null;
    let bestDistance = radius * radius;
    for (const target of targets) {
      if (predicate && !predicate(target)) continue;
      const distance = LG.distanceSquared(source, target);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = target;
      }
    }
    return nearest;
  };

  function perceivedWithin(source, targets, radius, predicate = null) {
    const radiusSquared = radius * radius;
    return targets.filter((target) => (
      (!predicate || predicate(target)) && LG.distanceSquared(source, target) <= radiusSquared
    ));
  }

  LG.moveAnimal = (animal, desiredAngle, speed, dt) => {
    const turnAbility = 7.2 + (animal.traits?.agility || 50) / 45;
    animal.angle = LG.turnToward(animal.angle, desiredAngle, turnAbility * dt + 0.038);
    animal.x += Math.cos(animal.angle) * speed * dt;
    animal.y += Math.sin(animal.angle) * speed * dt;
    const margin = 12;
    if (animal.x < margin || animal.x > WORLD.width - margin) {
      animal.angle = Math.PI - animal.angle;
      animal.x = LG.clamp(animal.x, margin, WORLD.width - margin);
    }
    if (animal.y < margin || animal.y > WORLD.height - margin) {
      animal.angle = -animal.angle;
      animal.y = LG.clamp(animal.y, margin, WORLD.height - margin);
    }
  };

  LG.wander = (animal, speed, dt) => {
    animal.wanderTimer -= dt;
    if (animal.wanderTimer <= 0) {
      const curiosity = (animal.traits?.curiosity || 50) / 100;
      animal.angle += LG.randomBetween(-0.75 - curiosity * 0.8, 0.75 + curiosity * 0.8);
      animal.wanderTimer = LG.randomBetween(0.035, 0.17);
    }
    LG.moveAnimal(animal, animal.angle, speed, dt);
  };

  LG.localPlantFood = (animal, radius = 175) => {
    const radiusSquared = radius * radius;
    let amount = 0;
    for (const patch of s.patches) {
      if (LG.distanceSquared(animal, patch) <= radiusSquared) amount += patch.green + patch.dry * 0.35;
    }
    return amount;
  };

  LG.reproductionSeasonMultiplier = () => {
    if (!s.rules.fullSeasons) return 1;
    if (s.season === "spring") return 1.3;
    if (s.season === "summer") return 0.95;
    if (s.season === "autumn") return 0.18;
    return 0;
  };

  LG.getSeason = () => {
    if (!s.rules.fullSeasons) return "summer";
    const phase = ((s.year % 1) + 1) % 1;
    if (phase < 0.25) return "spring";
    if (phase < 0.5) return "summer";
    if (phase < 0.75) return "autumn";
    return "winter";
  };

  LG.updateSeason = () => {
    const nextSeason = LG.getSeason();
    if (nextSeason === s.season) return;
    s.season = nextSeason;
    const totals = LG.getResourceTotals();
    if (nextSeason === "spring") s.springBaseline = { year: Math.floor(s.year), green: totals.green };
    if (nextSeason === "winter" && Math.floor(s.year) === 0) {
      LG.addEvent("第一个冬季到来：地表鲜草枯萎，地下根系和种子继续保存生命。 ");
    }
  };

  LG.rolloverLedgerIfNeeded = (previousYear) => {
    const previousWhole = Math.floor(previousYear);
    const currentWhole = Math.floor(s.year);
    if (currentWhole <= previousWhole) return;
    const births = s.ledger.grazerBirths + s.ledger.hunterBirths;
    const deaths = s.ledger.grazerPredationDeaths
      + s.ledger.grazerStarvationDeaths
      + s.ledger.grazerOldAgeDeaths
      + s.ledger.hunterStarvationDeaths
      + s.ledger.hunterOldAgeDeaths;
    if (births > 0 || deaths > 0 || s.ledger.huntAttempts > 0) {
      LG.addEvent(`第${currentWhole}年总结：出生${births}，死亡${deaths}，捕猎${s.ledger.huntSuccesses}/${s.ledger.huntAttempts}，遗传后代${s.ledger.inheritedBirths}。`);
    }
    s.ledger = LG.freshLedger(currentWhole);
  };

  function maybeDisperseSeed(patch, dt) {
    patch.spreadCooldown = Math.max(0, patch.spreadCooldown - dt);
    if (
      s.season !== "autumn"
      || patch.spreadCooldown > 0
      || patch.seeds < 46
      || patch.green < 58
      || patch.rootBiomass < 38
      || s.patches.length >= WORLD.maxPatches
      || Math.random() >= 0.75 * dt
    ) return;

    const angle = LG.randomBetween(0, Math.PI * 2);
    const distance = LG.randomBetween(92, 155);
    const x = LG.clamp(patch.x + Math.cos(angle) * distance, 45, 915);
    const y = LG.clamp(patch.y + Math.sin(angle) * distance, 45, 555);
    if (LG.findPatchNear(x, y, 68)) return;

    patch.seeds -= 16;
    LG.createPatch(x, y, {
      green: 0,
      dry: 0,
      seeds: 16,
      rootBiomass: 8,
      fertility: LG.clamp(patch.fertility * LG.randomBetween(0.85, 1.02), 0.4, 1.2),
      radius: LG.randomBetween(25, 34),
      lineageId: patch.lineageId,
      generation: patch.generation + 1,
    });
    patch.spreadCooldown = 1.5;
    LG.incrementMetric("seedDispersals");
    if (s.lifetime.seedDispersals === 1) {
      LG.addEvent("第一批种子离开母草地，在局部空地建立新的根系。 ");
    }
  }

  function updatePatch(patch, dt) {
    const multiplier = s.rules.growth;
    const rootFactor = 0.58 + patch.rootBiomass / 170;
    const capacity = PATCH.maxGreen * (0.68 + patch.fertility * 0.32) * rootFactor;
    const litter = LG.clamp(patch.dry / PATCH.maxDry, 0, 1);
    const crowding = LG.clamp(1 - patch.green / Math.max(1, capacity), 0, 1)
      * (1 - litter * PATCH.litterSuppression);
    let growthRate = PATCH.mildGrowth;
    if (s.rules.fullSeasons) {
      growthRate = s.season === "spring"
        ? PATCH.springGrowth
        : s.season === "summer"
          ? PATCH.summerGrowth
          : s.season === "autumn"
            ? PATCH.autumnGrowth
            : 0;
    }

    let growthAdded = 0;
    if (s.season === "spring" && patch.green < capacity * 0.72) {
      const rootRecovery = Math.min(
        patch.rootBiomass * 0.18,
        PATCH.springGermination * multiplier * patch.fertility * crowding * dt,
      );
      patch.green += rootRecovery;
      patch.rootBiomass = Math.max(0, patch.rootBiomass - rootRecovery * 0.045);
      growthAdded += rootRecovery;
      LG.incrementMetric("germinatedBiomass", rootRecovery);

      if (patch.seeds > 0 && patch.rootBiomass < 24) {
        const seedRecovery = Math.min(patch.seeds, 8 * multiplier * patch.fertility * dt);
        patch.seeds -= seedRecovery;
        patch.rootBiomass = LG.clamp(patch.rootBiomass + seedRecovery * 0.7, 0, 100);
      }
    }

    if (growthRate > 0 && (patch.green > 0.15 || patch.rootBiomass > 0.5 || patch.seeds > 0.5)) {
      const growth = growthRate * multiplier * patch.fertility * crowding * rootFactor * dt;
      patch.green += growth;
      patch.rootBiomass = LG.clamp(patch.rootBiomass + growth * 0.018, 0, 100);
      growthAdded += growth;
    }

    if (s.season === "autumn" && patch.green > 2) {
      const seedGain = patch.green * PATCH.autumnSeedRate * multiplier * dt;
      patch.seeds = LG.clamp(patch.seeds + seedGain, 0, PATCH.maxSeeds);
      const dryGain = Math.min(patch.green, patch.green * 0.13 * dt);
      patch.green -= dryGain;
      patch.dry = LG.clamp(patch.dry + dryGain, 0, PATCH.maxDry);
    }

    if (s.season === "winter" && s.rules.fullSeasons && patch.green > 0) {
      const withered = Math.min(patch.green, PATCH.winterWither * dt);
      patch.green -= withered;
      patch.dry = LG.clamp(patch.dry + withered * 0.82, 0, PATCH.maxDry);
    }

    const decayRate = s.season === "spring" ? PATCH.dryDecaySpring : PATCH.dryDecayOther;
    const dryDecay = Math.min(patch.dry, patch.dry * decayRate * dt);
    patch.dry -= dryDecay;
    patch.fertility = LG.clamp(
      patch.fertility + dryDecay * PATCH.fertilityGain - growthAdded * PATCH.fertilityCost,
      0.35,
      1.3,
    );

    if (patch.green < 3 && patch.dry < 2) {
      patch.rootBiomass = Math.max(0, patch.rootBiomass - 1.4 * dt);
    }
    patch.seeds = Math.max(0, patch.seeds - patch.seeds * PATCH.seedDecay * dt);
    patch.green = LG.clamp(patch.green, 0, PATCH.maxGreen);
    patch.dry = LG.clamp(patch.dry, 0, PATCH.maxDry);
    maybeDisperseSeed(patch, dt);
    patch.barrenAge = patch.green + patch.dry + patch.seeds + patch.rootBiomass < 0.5
      ? patch.barrenAge + dt
      : 0;
  }

  LG.updatePatches = (dt) => {
    for (let index = s.patches.length - 1; index >= 0; index -= 1) {
      const patch = s.patches[index];
      updatePatch(patch, dt);
      if (patch.barrenAge > 1.5) s.patches.splice(index, 1);
    }
    if (s.springBaseline && s.springRecoveryYear !== s.springBaseline.year && s.season === "spring") {
      const totals = LG.getResourceTotals();
      if (totals.green >= s.springBaseline.green + 65) {
        s.springRecoveryYear = s.springBaseline.year;
        LG.incrementMetric("springRecoveries");
        if (!s.eventFlags.firstSpringRecovery) {
          s.eventFlags.firstSpringRecovery = true;
          LG.addEvent("草地第一次依靠地下根系完成明显春季恢复。 ");
        }
      }
    }
  };

  function chooseFoodPatch(grazer) {
    const senseRadius = statsOf(grazer).senseRadius;
    let best = null;
    let bestScore = -Infinity;
    for (const patch of s.patches) {
      const food = patch.green + patch.dry * 0.38;
      if (food < 1) continue;
      const distance = Math.sqrt(LG.distanceSquared(grazer, patch));
      if (distance > senseRadius) continue;
      const localGrazers = perceivedWithin(patch, s.grazers, patch.radius + 75).length;
      const score = food * 1.22 - distance * 0.24 - localGrazers * 10;
      if (score > bestScore) {
        bestScore = score;
        best = patch;
      }
    }
    return best;
  }

  function localDensityPressure(animal, type) {
    const radius = statsOf(animal).mateRange;
    const localAnimals = perceivedWithin(animal, type === "grazer" ? s.grazers : s.hunters, radius).length;
    if (type === "grazer") {
      const localFood = LG.localPlantFood(animal, radius);
      const carrying = Math.max(3, localFood / 42);
      return LG.clamp(1 - localAnimals / (carrying + 2), 0.08, 1);
    }
    const localPrey = perceivedWithin(animal, s.grazers, statsOf(animal).senseRadius).length;
    const carrying = Math.max(1, localPrey / 6);
    return LG.clamp(1 - localAnimals / (carrying + 1.2), 0.06, 1);
  }

  function oldAgeDeathChance(animal, dt) {
    const derived = statsOf(animal);
    const config = SPECIES[animal.type];
    const elderStart = derived.lifespan * config.elderAgeRatio;
    if (animal.age < elderStart) return false;
    const progress = LG.clamp((animal.age - elderStart) / Math.max(0.1, derived.lifespan - elderStart), 0, 1.5);
    if (animal.age >= derived.lifespan * 1.32) return true;
    const health = animal.energy / derived.maxEnergy;
    return Math.random() < (0.06 + progress * 0.46 + (1 - health) * 0.18) * dt;
  }

  function reproduce(mother, father, type) {
    const config = SPECIES[type];
    if (s.grazers.length + s.hunters.length >= WORLD.maxAnimals) return false;
    const motherStats = statsOf(mother);
    const fatherStats = statsOf(father);
    mother.energy -= config.reproductionCost;
    father.energy -= config.reproductionCost * 0.35;
    mother.reproductionCooldown = config.reproductionCooldown / motherStats.fertilityMultiplier;
    father.reproductionCooldown = config.reproductionCooldown * 0.75 / fatherStats.fertilityMultiplier;
    const child = LG.createAnimal(type, (mother.x + father.x) / 2, (mother.y + father.y) / 2, {
      spread: 12,
      age: 0,
      parents: [mother, father],
      sex: Math.random() < 0.5 ? "female" : "male",
      energy: (motherStats.maxEnergy + fatherStats.maxEnergy) * 0.27,
      reproductionCooldown: config.reproductionCooldown,
      lineageId: mother.lineageId,
    });
    if (!child) return false;
    mother.offspringCount += 1;
    father.offspringCount += 1;
    mother.lastBirthYear = s.year;
    father.lastBirthYear = s.year;
    LG.incrementMetric(type === "grazer" ? "grazerBirths" : "hunterBirths");
    LG.incrementMetric("inheritedBirths");
    s.effects.push({ kind: "birth", x: child.x, y: child.y, age: 0, color: config.color });
    if (!s.eventFlags.firstInheritedBirth) {
      s.eventFlags.firstInheritedBirth = true;
      LG.addEvent(`第一个遗传后代诞生：其属性由双亲等位基因重组并叠加发育环境形成。`);
    }
    if (type === "hunter" && !s.eventFlags.firstHunterBirth) {
      s.eventFlags.firstHunterBirth = true;
      LG.addEvent("猎食兽第一次产生后代，捕食层开始完成代际更新。 ");
    }
    return true;
  }

  function removeAnimal(collection, index, reason) {
    const animal = collection[index];
    if (!animal) return;
    collection.splice(index, 1);
    LG.createCarcass(animal.x, animal.y, animal.type, animal.type === "grazer" ? 26 : 34);
    const prefix = animal.type === "grazer" ? "grazer" : "hunter";
    if (reason === "starvation") LG.incrementMetric(`${prefix}StarvationDeaths`);
    if (reason === "oldAge") LG.incrementMetric(`${prefix}OldAgeDeaths`);
    if (reason === "predation") LG.incrementMetric("grazerPredationDeaths");
  }

  function adultReady(animal, config) {
    return LG.lifeStage(animal) === "adult"
      && animal.energy >= config.reproductionEnergy * 0.78
      && animal.reproductionCooldown <= 0;
  }

  function attemptLocalReproduction(type, dt) {
    const config = SPECIES[type];
    const season = LG.reproductionSeasonMultiplier();
    const population = type === "grazer" ? s.grazers : s.hunters;
    if (population.length < 2) return;
    if (type === "hunter" && population.length >= 4) return;

    const paired = new Set();
    const females = population
      .filter((animal) => animal.sex === "female" && LG.lifeStage(animal) === "adult")
      .sort((a, b) => a.id - b.id);

    for (const female of females) {
      if (paired.has(female.id)) continue;
      const femaleStats = statsOf(female);
      const biologicallyReady = season > 0
        && female.energy >= config.reproductionEnergy * 0.78
        && female.reproductionCooldown <= 0;
      if (!biologicallyReady) {
        female.breedingReadiness = Math.max(0, female.breedingReadiness - dt * 0.22);
        continue;
      }

      if (type === "grazer" && LG.localPlantFood(female, femaleStats.mateRange) < 38) {
        female.breedingReadiness = Math.max(0, female.breedingReadiness - dt * 0.28);
        continue;
      }
      if (type === "hunter") {
        const localPrey = perceivedWithin(female, s.grazers, femaleStats.senseRadius).length;
        const localHunters = Math.max(1, perceivedWithin(female, s.hunters, femaleStats.senseRadius).length);
        if (localPrey / localHunters < 4) {
          female.breedingReadiness = Math.max(0, female.breedingReadiness - dt * 0.3);
          continue;
        }
      }

      const males = perceivedWithin(female, population, femaleStats.mateRange, (animal) => (
        animal.sex === "male"
        && !paired.has(animal.id)
        && adultReady(animal, config)
      ));
      const male = LG.chooseLocalMate(female, males);
      if (!male) {
        female.preferredMateId = null;
        female.breedingReadiness = Math.max(0, female.breedingReadiness - dt * 0.16);
        continue;
      }

      if (type === "hunter" && Math.min(female.lastMealAge, male.lastMealAge) > 3.5) {
        female.breedingReadiness = Math.max(0, female.breedingReadiness - dt * 0.2);
        continue;
      }

      female.preferredMateId = male.id;
      const selectivity = female.traits.mateSelectivity / 100;
      const observedQuality = LG.observedMateScore(female, male) / 100;
      const lowPopulationBoost = population.length < (type === "grazer" ? 14 : 4)
        ? (type === "grazer" ? 2.3 : 2.2)
        : 1;
      const readinessRate = type === "grazer" ? 9 : 3.5;
      const gain = readinessRate
        * s.rules.fertility
        * season
        * femaleStats.fertilityMultiplier
        * Math.sqrt(localDensityPressure(female, type))
        * lowPopulationBoost
        * (0.68 + observedQuality * (0.16 + selectivity * 0.18))
        * dt;
      female.breedingReadiness = Math.min(1.25, female.breedingReadiness + gain);

      if (female.breedingReadiness >= 1 && reproduce(female, male, type)) {
        female.breedingReadiness -= 1;
        female.preferredMateId = null;
        LG.incrementMetric("localMateChoices");
        paired.add(female.id);
        paired.add(male.id);
      }
    }
  }

  LG.updateGrazers = (dt) => {
    const config = SPECIES.grazer;
    const seasonDrain = s.season === "winter" && s.rules.fullSeasons ? config.winterDrain : 1;
    for (let index = s.grazers.length - 1; index >= 0; index -= 1) {
      const grazer = s.grazers[index];
      const derived = statsOf(grazer);
      grazer.age += dt;
      grazer.lastMealAge += dt;
      grazer.energy -= derived.baseDrain * seasonDrain * dt;
      grazer.reproductionCooldown = Math.max(0, grazer.reproductionCooldown - dt);
      const stage = LG.lifeStage(grazer);
      const threat = LG.findNearest(
        grazer,
        s.hunters,
        derived.threatRadius,
        (hunter) => hunter.state !== "rest" && hunter.state !== "feed",
      );

      if (threat && grazer.stamina > 1) {
        const cautionNoise = (100 - grazer.traits.caution) / 500;
        const angle = Math.atan2(grazer.y - threat.y, grazer.x - threat.x)
          + LG.randomBetween(-0.12 - cautionNoise, 0.12 + cautionNoise);
        const stageSpeed = stage === "juvenile" ? 0.82 : stage === "elder" ? 0.84 : 1;
        LG.moveAnimal(grazer, angle, derived.burstSpeed * stageSpeed, dt);
        grazer.stamina = Math.max(0, grazer.stamina - config.staminaDrain * dt);
        grazer.energy -= config.sprintDrain * dt;
      } else {
        grazer.stamina = Math.min(derived.staminaMax, grazer.stamina + derived.staminaRecovery * dt);
        const patch = chooseFoodPatch(grazer);
        if (patch) {
          const angle = Math.atan2(patch.y - grazer.y, patch.x - grazer.x);
          const stageSpeed = stage === "juvenile" ? 0.78 : stage === "elder" ? 0.82 : 1;
          LG.moveAnimal(grazer, angle, derived.walkSpeed * stageSpeed, dt);
          const reach = patch.radius * 0.72 + 9;
          if (LG.distanceSquared(grazer, patch) < reach * reach) {
            let eaten = 0;
            if (patch.green > 4) {
              eaten = Math.min(patch.green, config.eatRate * dt);
              patch.green -= eaten;
              patch.rootBiomass = Math.max(0, patch.rootBiomass - eaten * 0.012);
              grazer.energy = Math.min(derived.maxEnergy, grazer.energy + eaten * config.greenEnergy);
              LG.incrementMetric("greenConsumed", eaten);
            } else if (patch.dry > 0.25) {
              eaten = Math.min(patch.dry, config.eatRate * 0.58 * dt);
              patch.dry -= eaten;
              grazer.energy = Math.min(derived.maxEnergy, grazer.energy + eaten * config.dryEnergy);
              LG.incrementMetric("dryConsumed", eaten);
            }
            if (eaten > 0) grazer.lastMealAge = 0;
          }
        } else {
          LG.wander(grazer, derived.walkSpeed * 0.55, dt);
        }
      }

      if (grazer.energy <= 0) removeAnimal(s.grazers, index, "starvation");
      else if (oldAgeDeathChance(grazer, dt)) removeAnimal(s.grazers, index, "oldAge");
    }
    attemptLocalReproduction("grazer", dt);
  };

  function chooseHunterTarget(hunter) {
    const derived = statsOf(hunter);
    const existing = s.grazers.find((grazer) => grazer.id === hunter.targetId);
    if (existing && LG.distanceSquared(hunter, existing) <= derived.senseRadius ** 2) return existing;

    const visible = perceivedWithin(hunter, s.grazers, derived.senseRadius);
    let best = null;
    let bestScore = -Infinity;
    for (const prey of visible) {
      const distance = Math.sqrt(LG.distanceSquared(hunter, prey));
      const staminaRatio = prey.stamina / statsOf(prey).staminaMax;
      const perceivedWeakness = 100 - LG.currentCombatPower(prey);
      const isolation = perceivedWithin(prey, s.grazers, 80).length <= 2 ? 14 : 0;
      const score = perceivedWeakness * 0.45 + (1 - staminaRatio) * 25 + isolation - distance * 0.08;
      if (score > bestScore) {
        bestScore = score;
        best = prey;
      }
    }
    hunter.targetId = best?.id ?? null;
    return best;
  }

  function consumeCarcass(hunter, carcass, dt) {
    const derived = statsOf(hunter);
    const amount = Math.min(carcass.biomass, 34 * dt);
    carcass.biomass -= amount;
    hunter.energy = Math.min(derived.maxEnergy, hunter.energy + amount * SPECIES.hunter.carrionEnergy);
    hunter.lastMealAge = 0;
  }

  function attemptHunt(hunter, prey) {
    const config = SPECIES.hunter;
    const hunterStats = statsOf(hunter);
    const preyStats = statsOf(prey);
    hunter.attackCooldown = config.attackCooldown;
    LG.incrementMetric("huntAttempts");

    const preyStamina = prey.stamina / preyStats.staminaMax;
    const powerAdvantage = (LG.currentCombatPower(hunter) - LG.currentCombatPower(prey) * 0.74) / 35;
    const success = LG.clamp(
      0.44
        + Math.tanh(powerAdvantage) * 0.11
        - preyStamina * 0.08
        + hunter.consecutiveFailures * 0.04,
      0.25,
      0.68,
    );

    s.effects.push({ kind: "lunge", x: hunter.x, y: hunter.y, age: 0, color: "#8b70b7", angle: hunter.angle });
    if (Math.random() < success) {
      const index = s.grazers.indexOf(prey);
      if (index >= 0) {
        s.grazers.splice(index, 1);
        LG.createCarcass(prey.x, prey.y, "grazer", 18);
        hunter.energy = Math.min(hunterStats.maxEnergy, hunter.energy + config.preyEnergy);
        hunter.lastMealAge = 0;
        hunter.state = "feed";
        hunter.stateTimer = config.feedRest;
        hunter.targetId = null;
        hunter.consecutiveFailures = 0;
        LG.incrementMetric("grazerPredationDeaths");
        LG.incrementMetric("huntSuccesses");
        if (!s.eventFlags.firstHunt) {
          s.eventFlags.firstHunt = true;
          LG.addEvent("猎食兽第一次依据局部感知锁定并成功扑杀猎物。 ");
        }
      }
    } else {
      hunter.consecutiveFailures += 1;
      hunter.state = "rest";
      hunter.stateTimer = config.restAfterMiss;
      LG.incrementMetric("huntFailures");
    }
  }

  LG.updateHunters = (dt) => {
    const config = SPECIES.hunter;
    const seasonDrain = s.season === "winter" && s.rules.fullSeasons ? config.winterDrain : 1;
    for (let index = s.hunters.length - 1; index >= 0; index -= 1) {
      const hunter = s.hunters[index];
      const derived = statsOf(hunter);
      hunter.age += dt;
      hunter.lastMealAge += dt;
      hunter.energy -= derived.baseDrain * seasonDrain * dt;
      hunter.reproductionCooldown = Math.max(0, hunter.reproductionCooldown - dt);
      hunter.attackCooldown = Math.max(0, hunter.attackCooldown - dt);
      const stage = LG.lifeStage(hunter);

      if (hunter.stateTimer > 0) {
        hunter.stateTimer -= dt;
        hunter.stamina = Math.min(derived.staminaMax, hunter.stamina + derived.staminaRecovery * 1.3 * dt);
        if (hunter.stateTimer <= 0) hunter.state = "wander";
      } else {
        const prey = chooseHunterTarget(hunter);
        const carcass = LG.findNearest(hunter, s.carcasses, derived.senseRadius * 0.72, (item) => item.biomass > 1);
        const localPrey = perceivedWithin(hunter, s.grazers, derived.senseRadius).length;
        const localHunters = Math.max(1, perceivedWithin(hunter, s.hunters, derived.senseRadius).length);
        const localPreyRatio = localPrey / localHunters;
        const allowHunt = hunter.energy < derived.maxEnergy * 0.74 && (localPreyRatio > 2.5 || hunter.energy < derived.maxEnergy * 0.3);

        if (carcass && hunter.energy < derived.maxEnergy * 0.48) {
          hunter.state = "scavenge";
          hunter.stamina = Math.min(derived.staminaMax, hunter.stamina + derived.staminaRecovery * dt);
          const angle = Math.atan2(carcass.y - hunter.y, carcass.x - hunter.x);
          LG.moveAnimal(hunter, angle, derived.walkSpeed, dt);
          if (LG.distanceSquared(hunter, carcass) < 21 * 21) consumeCarcass(hunter, carcass, dt);
        } else if (prey && allowHunt && hunter.stamina > 5) {
          hunter.state = "chase";
          const angle = Math.atan2(prey.y - hunter.y, prey.x - hunter.x);
          const stageSpeed = stage === "elder" ? 0.84 : stage === "juvenile" ? 0.8 : 1;
          const distance = Math.sqrt(LG.distanceSquared(hunter, prey));
          const speed = distance < config.lungeDistance ? config.lungeSpeed : derived.burstSpeed;
          LG.moveAnimal(hunter, angle, speed * stageSpeed, dt);
          hunter.stamina = Math.max(0, hunter.stamina - config.staminaDrain * dt);
          hunter.energy -= config.chaseDrain * dt;
          if (LG.distanceSquared(hunter, prey) < 31 * 31 && hunter.attackCooldown <= 0) attemptHunt(hunter, prey);
        } else if (carcass) {
          hunter.state = "scavenge";
          hunter.stamina = Math.min(derived.staminaMax, hunter.stamina + derived.staminaRecovery * dt);
          const angle = Math.atan2(carcass.y - hunter.y, carcass.x - hunter.x);
          LG.moveAnimal(hunter, angle, derived.walkSpeed * 0.9, dt);
          if (LG.distanceSquared(hunter, carcass) < 21 * 21) consumeCarcass(hunter, carcass, dt);
        } else {
          hunter.state = "wander";
          hunter.targetId = null;
          hunter.stamina = Math.min(derived.staminaMax, hunter.stamina + derived.staminaRecovery * dt);
          LG.wander(hunter, derived.walkSpeed * (stage === "elder" ? 0.76 : 1), dt);
        }
      }

      if (hunter.energy <= 0) removeAnimal(s.hunters, index, "starvation");
      else if (oldAgeDeathChance(hunter, dt)) removeAnimal(s.hunters, index, "oldAge");
    }
    attemptLocalReproduction("hunter", dt);
  };

  LG.updateCarcasses = (dt) => {
    for (let index = s.carcasses.length - 1; index >= 0; index -= 1) {
      const carcass = s.carcasses[index];
      carcass.age += dt;
      const decomposed = Math.min(carcass.biomass, Math.max(1.7, carcass.biomass * 1.35) * dt);
      carcass.biomass -= decomposed;
      LG.incrementMetric("carcassDecomposed", decomposed);
      const patch = LG.findNearest(carcass, s.patches, 115);
      if (patch) patch.fertility = LG.clamp(patch.fertility + decomposed * 0.001, 0.35, 1.3);
      if (carcass.biomass <= 0.35 || carcass.age >= carcass.maxAge) s.carcasses.splice(index, 1);
    }
  };

  LG.buildTrendSnapshot = () => {
    const totals = LG.getResourceTotals();
    return {
      year: s.year,
      flora: totals.green,
      grazer: s.grazers.length,
      hunter: s.hunters.length,
    };
  };

  function classifyTrend(current, previous, extinct = false) {
    if (extinct) return "灭绝";
    const difference = current - previous;
    const threshold = Math.max(1.2, Math.abs(previous) * 0.09);
    if (difference > threshold) return "上升";
    if (difference < -threshold) return "下降";
    return "稳定";
  }

  LG.updateTrends = () => {
    if (!s.trendBaseline) s.trendBaseline = LG.buildTrendSnapshot();
    if (s.year - s.trendBaseline.year < WORLD.trendWindowYears) return;
    const current = LG.buildTrendSnapshot();
    s.trendValues = {
      flora: classifyTrend(current.flora, s.trendBaseline.flora, !LG.hasDormantPlantLife()),
      grazer: classifyTrend(current.grazer, s.trendBaseline.grazer, current.grazer === 0),
      hunter: classifyTrend(current.hunter, s.trendBaseline.hunter, current.hunter === 0),
    };
    s.trendBaseline = current;
  };

  LG.missionCriteria = () => {
    const noIntervention = !Number.isFinite(s.lastAnimalPlacementYear) || s.year - s.lastAnimalPlacementYear >= 2;
    const present = LG.getPresence();
    return {
      time: s.coexistenceYears >= WORLD.missionYears,
      grazerBirths: s.lifetime.grazerBirths >= 8,
      hunterBirths: s.lifetime.hunterBirths >= 2,
      hunts: s.lifetime.huntSuccesses >= 5,
      spring: s.lifetime.springRecoveries >= 2,
      noIntervention,
      minimums: s.minimumDuringAttempt.grazers >= 3 && s.minimumDuringAttempt.hunters >= 1,
      allPresent: present.flora && present.grazer && present.hunter,
      inherited: s.lifetime.inheritedBirths >= 4,
    };
  };

  LG.updateMission = (dt) => {
    const present = LG.getPresence();
    const allPresent = present.flora && present.grazer && present.hunter;
    if (allPresent) {
      s.coexistenceYears += dt;
      s.longestCoexistence = Math.max(s.longestCoexistence, s.coexistenceYears);
      s.minimumDuringAttempt.grazers = Math.min(s.minimumDuringAttempt.grazers, s.grazers.length);
      s.minimumDuringAttempt.hunters = Math.min(s.minimumDuringAttempt.hunters, s.hunters.length);
    } else if (s.coexistenceYears > 0) {
      s.coexistenceYears = 0;
      s.minimumDuringAttempt = { grazers: s.grazers.length, hunters: s.hunters.length };
    }

    const criteria = LG.missionCriteria();
    const complete = Object.values(criteria).every(Boolean);
    if (complete && !s.historicalMissionComplete) {
      s.historicalMissionComplete = true;
      LG.addEvent("Genesis初步命题完成：世界已产生局部择偶、基因重组后代和三层生态循环。 ");
      LG.showToast?.("初步命题完成：遗传属性已进入生态循环！", 4200);
    }
  };

  function checkEndangered() {
    if (s.grazers.length > 0 && s.grazers.length <= 3 && !s.eventFlags.grazerEndangered) {
      s.eventFlags.grazerEndangered = true;
      LG.addEvent("食草兽降至濒危线：局部感知范围内可能难以找到异性。 ");
    }
    if (s.grazers.length > 5) s.eventFlags.grazerEndangered = false;
    if (s.hunters.length === 1 && !s.eventFlags.hunterEndangered) {
      s.eventFlags.hunterEndangered = true;
      LG.addEvent("猎食兽只剩1只，已不存在可观察范围内的异性配偶。 ");
    }
    if (s.hunters.length >= 2) s.eventFlags.hunterEndangered = false;
  }

  LG.calculateBalance = () => {
    const totals = LG.getResourceTotals();
    const grazerCount = s.grazers.length;
    const hunterCount = s.hunters.length;
    const plantPresent = LG.hasDormantPlantLife();
    const grazerAges = LG.getAgeStructure(s.grazers);
    const hunterAges = LG.getAgeStructure(s.hunters);

    if (!plantPresent && grazerCount === 0 && hunterCount === 0) return { score: 0, label: "生态崩溃", advice: "世界中已没有植物储备或动物。" };
    if (!plantPresent) return { score: 5, label: "生产者灭绝", advice: "鲜草、枯草、根系和种子库都已耗尽。" };
    if (grazerCount === 0 && hunterCount === 0) return { score: 18, label: "食物网崩解", advice: "植物仍然存在，但两级动物均已灭绝。" };
    if (grazerCount === 0) return { score: 12, label: "猎物断层", advice: "猎食兽仍然存在，但感知范围内不会再出现活体猎物。" };
    if (hunterCount === 0) {
      const score = LG.clamp(35 + Math.min(18, grazerCount) - (s.trendValues.flora === "下降" ? 10 : 0), 20, 55);
      return { score, label: "捕食层缺失", advice: "食草兽和植物仍在运行，但没有猎食兽调节。" };
    }

    const reserve = totals.green + totals.dry * 0.45 + totals.roots * 0.2;
    const reservePerGrazer = reserve / Math.max(1, grazerCount);
    const preyPerHunter = grazerCount / hunterCount;
    const huntRate = s.lifetime.huntAttempts ? s.lifetime.huntSuccesses / s.lifetime.huntAttempts : 0;
    let score = 60;
    if (reservePerGrazer >= 24 && reservePerGrazer <= 78) score += 10;
    else if (reservePerGrazer < 14) score -= 20;
    else if (reservePerGrazer > 120) score -= 4;
    if (preyPerHunter >= 5 && preyPerHunter <= 12) score += 10;
    else if (preyPerHunter < 3.5) score -= 18;
    else if (preyPerHunter > 18) score -= 7;
    if (huntRate >= 0.35 && huntRate <= 0.72) score += 8;
    else if (s.lifetime.huntAttempts >= 4 && huntRate < 0.2) score -= 14;
    if (grazerAges.juvenile > 0 && hunterAges.juvenile > 0) score += 8;
    if (hunterAges.adult === 0 || grazerAges.adult === 0) score -= 18;
    if (s.lifetime.inheritedBirths >= 4) score += 4;
    score = LG.clamp(score, 0, 100);

    if (hunterAges.adult === 0 || s.lifetime.hunterBirths === 0) {
      return {
        score: Math.min(score, 65),
        label: "捕食层断代风险",
        advice: `猎食兽仍有${hunterCount}只，但局部配偶与代际更新不足。`,
      };
    }
    if (reservePerGrazer < 16) return { score, label: "食物压力升高", advice: `每只食草兽可用植物储备约${reservePerGrazer.toFixed(1)}。` };
    return score >= 82
      ? { score, label: "遗传闭环形成", advice: "三层生态存在，个体差异正在通过局部择偶和遗传进入下一代。" }
      : { score, label: "脆弱但完整", advice: "食物网完整，但资源、代际或局部配偶条件仍接近风险区。" };
  };

  LG.updateWorld = (dt) => {
    const previousYear = s.year;
    s.year += dt;
    LG.rolloverLedgerIfNeeded(previousYear);
    LG.updateSeason();
    LG.updatePatches(dt);
    LG.updateGrazers(dt);
    LG.updateHunters(dt);
    LG.updateCarcasses(dt);
    LG.checkPresenceChanges();
    checkEndangered();
    LG.updateMission(dt);
    LG.updateTrends();
  };
})();