(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Ecology stability requires LittleGod core");
  if (typeof LG.updateWorld !== "function" || typeof LG.updateHunters !== "function") {
    throw new Error("Ecology stability requires simulation.js");
  }

  const HUNTER_PREY_RATIO_MIN = 1.6;
  const HUNTER_LOW_POP_RATIO_MIN = 1.15;
  const SPRING_GREEN_GAIN_THRESHOLD = 24;
  const SPRING_ROOT_RECOVERY_THRESHOLD = 12;
  const SPRING_GERMINATION_THRESHOLD = 0.35;
  const MAX_SPRING_RECORDS = 80;
  const MAX_YEARLY_RECORDS = 120;

  const s = LG.state;
  let hunterFailures;
  let hunterTotals;
  let lastHunterSnapshot;
  let springRecords;
  let currentSpring;
  let yearlyTimeline;
  let yearBaseline;
  let populationSummary;
  let milestones;
  let previousPresence;

  function freshFailures() {
    return {
      seasonClosed: 0,
      noAdultFemale: 0,
      noAdultMale: 0,
      femaleEnergy: 0,
      femaleCooldown: 0,
      preyRatio: 0,
      populationPressure: 0,
      noMateInRange: 0,
      mateNotReady: 0,
      staleMeal: 0,
      readinessBuilding: 0,
      worldCapacity: 0,
      createFailed: 0,
    };
  }

  function lifetimeCopy() {
    return {
      hunterBirths: Number(s.lifetime?.hunterBirths) || 0,
      springRecoveries: Number(s.lifetime?.springRecoveries) || 0,
    };
  }

  function resourceCopy() {
    const totals = LG.getResourceTotals();
    return {
      green: totals.green,
      dry: totals.dry,
      seeds: totals.seeds,
      roots: totals.roots,
    };
  }

  function resetDiagnostics() {
    hunterFailures = freshFailures();
    hunterTotals = { evaluations: 0, attempts: 0, successes: 0 };
    lastHunterSnapshot = {
      adultFemales: 0,
      adultMales: 0,
      energyReady: 0,
      cooldownReady: 0,
      localPreyRatioReady: 0,
      foundMate: 0,
    };
    springRecords = [];
    currentSpring = null;
    yearlyTimeline = [];
    yearBaseline = {
      year: Math.floor(s.year || 0),
      lifetime: lifetimeCopy(),
    };
    populationSummary = {
      initial: { grazers: s.grazers.length, hunters: s.hunters.length },
      maximum: { grazers: s.grazers.length, hunters: s.hunters.length },
      final: { grazers: s.grazers.length, hunters: s.hunters.length },
    };
    milestones = {
      firstHunterBirthYear: null,
      firstSpringRecoveryYear: null,
      hunterExtinctionYear: null,
      grazerExtinctionYear: null,
      longestCoexistence: Number(s.longestCoexistence) || 0,
    };
    previousPresence = {
      grazers: s.grazers.length > 0,
      hunters: s.hunters.length > 0,
    };
  }

  function countNearby(source, targets, radius) {
    const radiusSquared = radius * radius;
    return targets.filter((target) => LG.distanceSquared(source, target) <= radiusSquared);
  }

  function statsOf(animal) {
    const config = LG.SPECIES.hunter;
    return animal.derived || {
      maxEnergy: config.maxEnergy,
      senseRadius: config.senseRadius,
      mateRange: 220,
      fertilityMultiplier: 1,
    };
  }

  function adultReady(animal, energyFactor = 0.74) {
    const derived = statsOf(animal);
    return LG.lifeStage(animal) === "adult"
      && animal.energy >= LG.SPECIES.hunter.reproductionEnergy * energyFactor
      && animal.reproductionCooldown <= 0;
  }

  function createHunterChild(mother, father) {
    const config = LG.SPECIES.hunter;
    if (s.grazers.length + s.hunters.length >= LG.WORLD.maxAnimals) {
      hunterFailures.worldCapacity += 1;
      return false;
    }
    const motherStats = statsOf(mother);
    const fatherStats = statsOf(father);
    const child = LG.createAnimal("hunter", (mother.x + father.x) / 2, (mother.y + father.y) / 2, {
      spread: 14,
      age: 0,
      parents: [mother, father],
      sex: Math.random() < 0.5 ? "female" : "male",
      energy: (motherStats.maxEnergy + fatherStats.maxEnergy) * 0.28,
      reproductionCooldown: config.reproductionCooldown,
      lineageId: mother.lineageId,
    });
    if (!child) {
      hunterFailures.createFailed += 1;
      return false;
    }

    mother.energy -= config.reproductionCost;
    father.energy -= config.reproductionCost * 0.35;
    mother.reproductionCooldown = config.reproductionCooldown / Math.max(0.55, motherStats.fertilityMultiplier || 1);
    father.reproductionCooldown = config.reproductionCooldown * 0.75 / Math.max(0.55, fatherStats.fertilityMultiplier || 1);
    mother.ecologyBreedingReadiness = 0;
    mother.offspringCount = (mother.offspringCount || 0) + 1;
    father.offspringCount = (father.offspringCount || 0) + 1;
    mother.lastBirthYear = s.year;
    father.lastBirthYear = s.year;
    LG.incrementMetric("hunterBirths");
    LG.incrementMetric("inheritedBirths");
    s.effects?.push({ kind: "birth", x: child.x, y: child.y, age: 0, color: config.color });
    hunterTotals.successes += 1;
    if (milestones.firstHunterBirthYear === null) milestones.firstHunterBirthYear = s.year;
    if (!s.eventFlags.firstHunterBirth) {
      s.eventFlags.firstHunterBirth = true;
      LG.addEvent("猎食兽第一次产生后代，捕食层开始完成代际更新。 ");
    }
    return true;
  }

  function evaluateHunterReproduction(dt) {
    const population = s.hunters;
    const config = LG.SPECIES.hunter;
    const season = LG.reproductionSeasonMultiplier();
    const adults = population.filter((animal) => LG.lifeStage(animal) === "adult");
    const females = adults.filter((animal) => animal.sex === "female");
    const males = adults.filter((animal) => animal.sex === "male");
    const globalRatio = s.grazers.length / Math.max(1, population.length);
    const ratioThreshold = population.length <= 3 ? HUNTER_LOW_POP_RATIO_MIN : HUNTER_PREY_RATIO_MIN;

    lastHunterSnapshot = {
      adultFemales: females.length,
      adultMales: males.length,
      energyReady: females.filter((animal) => animal.energy >= config.reproductionEnergy * 0.74).length,
      cooldownReady: females.filter((animal) => animal.reproductionCooldown <= 0).length,
      localPreyRatioReady: 0,
      foundMate: 0,
      globalPreyPerHunter: globalRatio,
      requiredPreyPerHunter: ratioThreshold,
    };

    if (!females.length) hunterFailures.noAdultFemale += 1;
    if (!males.length) hunterFailures.noAdultMale += 1;
    if (season <= 0) {
      if (females.length) hunterFailures.seasonClosed += females.length;
      return false;
    }

    let birth = false;
    for (const female of females) {
      hunterTotals.evaluations += 1;
      const derived = statsOf(female);
      if (female.energy < config.reproductionEnergy * 0.74) {
        hunterFailures.femaleEnergy += 1;
        continue;
      }
      if (female.reproductionCooldown > 0) {
        hunterFailures.femaleCooldown += 1;
        continue;
      }

      const senseRadius = Math.max(derived.senseRadius || config.senseRadius, 260);
      const localPrey = countNearby(female, s.grazers, senseRadius).length;
      const localHunters = Math.max(1, countNearby(female, population, senseRadius).length);
      const localRatio = localPrey / localHunters;
      const effectiveRatio = Math.max(localRatio, globalRatio * 0.72);
      if (effectiveRatio < ratioThreshold) {
        hunterFailures.preyRatio += 1;
        continue;
      }
      lastHunterSnapshot.localPreyRatioReady += 1;

      if (population.length > 2 && globalRatio < 1.05) {
        hunterFailures.populationPressure += 1;
        continue;
      }

      const mateRange = Math.max(260, derived.mateRange || 220, senseRadius * 0.82);
      const nearbyMales = countNearby(female, males, mateRange);
      if (!nearbyMales.length) {
        hunterFailures.noMateInRange += 1;
        continue;
      }
      const readyMales = nearbyMales.filter((male) => adultReady(male));
      if (!readyMales.length) {
        hunterFailures.mateNotReady += 1;
        continue;
      }
      const male = LG.chooseLocalMate(female, readyMales);
      if (!male) {
        hunterFailures.noMateInRange += 1;
        continue;
      }
      lastHunterSnapshot.foundMate += 1;

      const recentlyFed = Math.min(female.lastMealAge ?? Infinity, male.lastMealAge ?? Infinity) <= 6;
      const wellProvisioned = female.energy >= derived.maxEnergy * 0.88
        && male.energy >= statsOf(male).maxEnergy * 0.82;
      if (!recentlyFed && !wellProvisioned) {
        hunterFailures.staleMeal += 1;
        continue;
      }

      const preyFactor = LG.clamp(effectiveRatio / 4, 0.45, 1.15);
      const lowPopulationBoost = population.length <= 3 ? 1.45 : 1;
      const gain = 3.8
        * s.rules.fertility
        * season
        * (derived.fertilityMultiplier || 1)
        * preyFactor
        * lowPopulationBoost
        * dt;
      female.ecologyBreedingReadiness = Math.min(1.25, (female.ecologyBreedingReadiness || 0) + gain);
      if (female.ecologyBreedingReadiness < 1) {
        hunterFailures.readinessBuilding += 1;
        continue;
      }

      hunterTotals.attempts += 1;
      if (createHunterChild(female, male)) {
        birth = true;
        break;
      }
    }
    return birth;
  }

  function metricDelta(after, before, key) {
    return Math.max(0, (Number(after?.[key]) || 0) - (Number(before?.[key]) || 0));
  }

  function startSpring(year, resources, metrics) {
    currentSpring = {
      year,
      startGreen: resources.green,
      endGreen: resources.green,
      greenGain: 0,
      netGreenGain: 0,
      rootRecovery: 0,
      seedGerminated: 0,
      triggeredSpringRecovery: false,
      metricBaseline: { ...metrics },
    };
  }

  function completeSpring() {
    if (!currentSpring) return;
    currentSpring.netGreenGain = currentSpring.endGreen - currentSpring.startGreen;
    delete currentSpring.metricBaseline;
    springRecords.push({ ...currentSpring });
    if (springRecords.length > MAX_SPRING_RECORDS) springRecords.shift();
    currentSpring = null;
  }

  function updateSpringDiagnostics(beforeResources, afterResources, beforeMetrics, afterMetrics, beforeSeason, afterSeason) {
    if (beforeSeason !== "spring" && afterSeason === "spring") {
      startSpring(Math.floor(s.year), afterResources, afterMetrics);
    }
    if (afterSeason === "spring" && !currentSpring) {
      startSpring(Math.floor(s.year), beforeResources, beforeMetrics);
    }
    if (afterSeason === "spring" && currentSpring) {
      const positiveGreen = Math.max(0, afterResources.green - beforeResources.green);
      const germinated = metricDelta(afterMetrics, beforeMetrics, "seedGerminated");
      const greenGrowth = metricDelta(afterMetrics, beforeMetrics, "greenGrowth");
      const rootSupported = Math.max(0, greenGrowth - germinated * 0.38);
      const seedProduced = metricDelta(afterMetrics, beforeMetrics, "seedProduced");

      currentSpring.endGreen = afterResources.green;
      currentSpring.greenGain += positiveGreen;
      currentSpring.rootRecovery += rootSupported;
      currentSpring.seedGerminated += germinated;

      if (germinated > 0) LG.incrementMetric("germinatedBiomass", germinated * 0.38);
      if (seedProduced > 0) LG.incrementMetric("seedDispersals", seedProduced);

      const recovered = currentSpring.greenGain >= SPRING_GREEN_GAIN_THRESHOLD
        || currentSpring.rootRecovery >= SPRING_ROOT_RECOVERY_THRESHOLD
        || currentSpring.seedGerminated >= SPRING_GERMINATION_THRESHOLD;
      if (recovered && !currentSpring.triggeredSpringRecovery) {
        currentSpring.triggeredSpringRecovery = true;
        if (s.springRecoveryYear !== currentSpring.year) {
          s.springRecoveryYear = currentSpring.year;
          LG.incrementMetric("springRecoveries");
          if (milestones.firstSpringRecoveryYear === null) milestones.firstSpringRecoveryYear = s.year;
          if (!s.eventFlags.firstSpringRecovery) {
            s.eventFlags.firstSpringRecovery = true;
            LG.addEvent("连续地表在整个春季累计完成根系恢复与种子发芽。 ");
          }
        }
      }
    }
    if (beforeSeason === "spring" && afterSeason !== "spring") completeSpring();
  }

  function updatePopulationMilestones() {
    populationSummary.maximum.grazers = Math.max(populationSummary.maximum.grazers, s.grazers.length);
    populationSummary.maximum.hunters = Math.max(populationSummary.maximum.hunters, s.hunters.length);
    populationSummary.final = { grazers: s.grazers.length, hunters: s.hunters.length };
    milestones.longestCoexistence = Math.max(milestones.longestCoexistence, Number(s.longestCoexistence) || 0);

    const hunterPresent = s.hunters.length > 0;
    const grazerPresent = s.grazers.length > 0;
    if (previousPresence.hunters && !hunterPresent && milestones.hunterExtinctionYear === null) {
      milestones.hunterExtinctionYear = s.year;
    }
    if (previousPresence.grazers && !grazerPresent && milestones.grazerExtinctionYear === null) {
      milestones.grazerExtinctionYear = s.year;
    }
    previousPresence = { hunters: hunterPresent, grazers: grazerPresent };

    if (milestones.firstHunterBirthYear === null && (s.lifetime?.hunterBirths || 0) > 0) {
      milestones.firstHunterBirthYear = s.year;
    }
    if (milestones.firstSpringRecoveryYear === null && (s.lifetime?.springRecoveries || 0) > 0) {
      milestones.firstSpringRecoveryYear = s.year;
    }
  }

  function recordYearBoundary(previousYear, currentYear) {
    if (currentYear <= previousYear) return;
    const resources = resourceCopy();
    const lifetime = lifetimeCopy();
    yearlyTimeline.push({
      year: previousYear,
      grazers: s.grazers.length,
      hunters: s.hunters.length,
      green: resources.green,
      dry: resources.dry,
      seeds: resources.seeds,
      roots: resources.roots,
      hunterBirths: lifetime.hunterBirths - yearBaseline.lifetime.hunterBirths,
      springRecoveries: lifetime.springRecoveries - yearBaseline.lifetime.springRecoveries,
    });
    if (yearlyTimeline.length > MAX_YEARLY_RECORDS) yearlyTimeline.shift();
    yearBaseline = { year: currentYear, lifetime };
  }

  function compactSummary() {
    const experiment = LG.getExperimentDiagnostics?.() || {};
    const balance = LG.calculateBalance?.() || { label: "unknown" };
    const criteria = LG.missionCriteria?.() || {};
    const failedCriteria = Object.entries(criteria)
      .filter(([, passed]) => !passed)
      .map(([key]) => key);
    const liveSpring = currentSpring ? [{ ...currentSpring, metricBaseline: undefined }] : [];
    return {
      meta: {
        version: "ecology-supervision-v1",
        build: typeof document !== "undefined"
          ? document.querySelector(".build-version")?.textContent?.trim() || null
          : null,
        seed: experiment.seed || null,
        duration: s.year,
      },
      verdict: {
        label: balance.label,
        score: balance.score,
        advice: balance.advice,
        failedCriteria,
      },
      milestones: { ...milestones },
      populationSummary: {
        initial: { ...populationSummary.initial },
        maximum: { ...populationSummary.maximum },
        final: { ...populationSummary.final },
      },
      reproductionDiagnostics: {
        hunter: {
          ...lastHunterSnapshot,
          attempts: hunterTotals.attempts,
          successes: hunterTotals.successes,
          evaluations: hunterTotals.evaluations,
          failureReasons: { ...hunterFailures },
        },
      },
      springDiagnostics: [...springRecords, ...liveSpring],
      yearlyTimeline: yearlyTimeline.map((entry) => ({ ...entry })),
    };
  }

  const baseUpdateHunters = LG.updateHunters;
  LG.updateHunters = (dt) => {
    const birthsBefore = Number(s.lifetime?.hunterBirths) || 0;
    const result = baseUpdateHunters(dt);
    const birthsAfter = Number(s.lifetime?.hunterBirths) || 0;
    if (birthsAfter > birthsBefore && milestones.firstHunterBirthYear === null) {
      milestones.firstHunterBirthYear = s.year;
    }
    if (birthsAfter === birthsBefore) evaluateHunterReproduction(dt);
    return result;
  };

  const baseUpdateWorld = LG.updateWorld;
  LG.updateWorld = (dt) => {
    const previousYearFloor = Math.floor(s.year);
    const beforeSeason = s.season;
    const beforeResources = resourceCopy();
    const beforeMetrics = { ...(s.vegetationMetrics || {}) };
    const result = baseUpdateWorld(dt);
    const afterResources = resourceCopy();
    const afterMetrics = { ...(s.vegetationMetrics || {}) };
    updateSpringDiagnostics(beforeResources, afterResources, beforeMetrics, afterMetrics, beforeSeason, s.season);
    updatePopulationMilestones();
    recordYearBoundary(previousYearFloor, Math.floor(s.year));
    return result;
  };

  const baseSeedWorld = LG.seedWorld;
  LG.seedWorld = (...args) => {
    const result = baseSeedWorld.apply(LG, args);
    resetDiagnostics();
    return result;
  };

  LG.runHunterReproductionCheck = evaluateHunterReproduction;
  LG.getEcologySupervisionDiagnostics = compactSummary;
  LG.ecologyStabilityModel = Object.freeze({
    version: "ecology-stability-v1",
    hunterPopulationHardBanRemoved: true,
    hunterPreyRatioMinimum: HUNTER_PREY_RATIO_MIN,
    springRecoveryMode: "whole-spring-cumulative",
    seedMetricSource: "continuous-grid-budget",
  });

  resetDiagnostics();

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__ecologyStabilityWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({
        ...baseSnapshot(),
        compactSummary: compactSummary(),
      });
      wrapped.__ecologyStabilityWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
