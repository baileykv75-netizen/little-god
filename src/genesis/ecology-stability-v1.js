(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Ecology stability requires LittleGod core");
  if (typeof LG.updateWorld !== "function" || typeof LG.updateHunters !== "function") {
    throw new Error("Ecology stability requires simulation.js");
  }

  const s = LG.state;
  const HUNTER_RATIO_MIN = 1.6;
  const HUNTER_LOW_POP_RATIO_MIN = 1.15;
  const SPRING_GREEN_GAIN_MIN = 24;
  const SPRING_ROOT_RECOVERY_MIN = 24;
  const SPRING_GERMINATION_MIN = 0.35;
  const MAX_HISTORY = 120;

  let hunterFailures;
  let hunterTotals;
  let hunterSnapshot;
  let springHistory;
  let activeSpring;
  let yearlyTimeline;
  let yearBaseline;
  let populations;
  let milestones;
  let previousPresence;

  const blankFailures = () => ({
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
  });

  function lifetimeCounters() {
    return {
      hunterBirths: Number(s.lifetime?.hunterBirths) || 0,
      springRecoveries: Number(s.lifetime?.springRecoveries) || 0,
    };
  }

  function resources() {
    const totals = LG.getResourceTotals();
    return {
      green: totals.green,
      dry: totals.dry,
      seeds: totals.seeds,
      roots: totals.roots,
    };
  }

  function resetDiagnostics() {
    hunterFailures = blankFailures();
    hunterTotals = { evaluations: 0, attempts: 0, successes: 0 };
    hunterSnapshot = {
      adultFemales: 0,
      adultMales: 0,
      energyReady: 0,
      cooldownReady: 0,
      localPreyRatioReady: 0,
      foundMate: 0,
      globalPreyPerHunter: 0,
      requiredPreyPerHunter: HUNTER_RATIO_MIN,
    };
    springHistory = [];
    activeSpring = null;
    yearlyTimeline = [];
    yearBaseline = { year: Math.floor(s.year || 0), lifetime: lifetimeCounters() };
    populations = {
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
      hunters: s.hunters.length > 0,
      grazers: s.grazers.length > 0,
    };
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

  function nearby(source, targets, radius) {
    const limit = radius * radius;
    return targets.filter((target) => LG.distanceSquared(source, target) <= limit);
  }

  function readyMale(animal) {
    return LG.lifeStage(animal) === "adult"
      && animal.energy >= LG.SPECIES.hunter.reproductionEnergy * 0.74
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
    const config = LG.SPECIES.hunter;
    const adults = s.hunters.filter((animal) => LG.lifeStage(animal) === "adult");
    const females = adults.filter((animal) => animal.sex === "female");
    const males = adults.filter((animal) => animal.sex === "male");
    const globalRatio = s.grazers.length / Math.max(1, s.hunters.length);
    const requiredRatio = s.hunters.length <= 3 ? HUNTER_LOW_POP_RATIO_MIN : HUNTER_RATIO_MIN;
    const season = LG.reproductionSeasonMultiplier();

    hunterSnapshot = {
      adultFemales: females.length,
      adultMales: males.length,
      energyReady: females.filter((animal) => animal.energy >= config.reproductionEnergy * 0.74).length,
      cooldownReady: females.filter((animal) => animal.reproductionCooldown <= 0).length,
      localPreyRatioReady: 0,
      foundMate: 0,
      globalPreyPerHunter: globalRatio,
      requiredPreyPerHunter: requiredRatio,
    };

    if (!females.length) hunterFailures.noAdultFemale += 1;
    if (!males.length) hunterFailures.noAdultMale += 1;
    if (season <= 0) {
      hunterFailures.seasonClosed += females.length;
      return false;
    }

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

      const senseRadius = Math.max(260, derived.senseRadius || config.senseRadius);
      const localPrey = nearby(female, s.grazers, senseRadius).length;
      const localHunters = Math.max(1, nearby(female, s.hunters, senseRadius).length);
      const effectiveRatio = Math.max(localPrey / localHunters, globalRatio * 0.72);
      if (effectiveRatio < requiredRatio) {
        hunterFailures.preyRatio += 1;
        continue;
      }
      hunterSnapshot.localPreyRatioReady += 1;

      if (s.hunters.length > 2 && globalRatio < 1.05) {
        hunterFailures.populationPressure += 1;
        continue;
      }

      const mateRange = Math.max(260, derived.mateRange || 220, senseRadius * 0.82);
      const malesInRange = nearby(female, males, mateRange);
      if (!malesInRange.length) {
        hunterFailures.noMateInRange += 1;
        continue;
      }
      const readyMales = malesInRange.filter(readyMale);
      if (!readyMales.length) {
        hunterFailures.mateNotReady += 1;
        continue;
      }
      const male = LG.chooseLocalMate(female, readyMales);
      if (!male) {
        hunterFailures.noMateInRange += 1;
        continue;
      }
      hunterSnapshot.foundMate += 1;

      const recentlyFed = Math.min(female.lastMealAge ?? Infinity, male.lastMealAge ?? Infinity) <= 6;
      const wellProvisioned = female.energy >= derived.maxEnergy * 0.88
        && male.energy >= statsOf(male).maxEnergy * 0.82;
      if (!recentlyFed && !wellProvisioned) {
        hunterFailures.staleMeal += 1;
        continue;
      }

      const gain = 3.8
        * s.rules.fertility
        * season
        * (derived.fertilityMultiplier || 1)
        * LG.clamp(effectiveRatio / 4, 0.45, 1.15)
        * (s.hunters.length <= 3 ? 1.45 : 1)
        * dt;
      female.ecologyBreedingReadiness = Math.min(1.25, (female.ecologyBreedingReadiness || 0) + gain);
      if (female.ecologyBreedingReadiness < 1) {
        hunterFailures.readinessBuilding += 1;
        continue;
      }

      hunterTotals.attempts += 1;
      if (createHunterChild(female, male)) return true;
    }
    return false;
  }

  const positiveDelta = (after, before, key) => Math.max(
    0,
    (Number(after?.[key]) || 0) - (Number(before?.[key]) || 0),
  );

  function beginSpring(year, startResources) {
    activeSpring = {
      year,
      startGreen: startResources.green,
      endGreen: startResources.green,
      greenGain: 0,
      netGreenGain: 0,
      rootRecovery: 0,
      seedGerminated: 0,
      triggeredSpringRecovery: false,
    };
  }

  function finishSpring() {
    if (!activeSpring) return;
    activeSpring.netGreenGain = activeSpring.endGreen - activeSpring.startGreen;
    springHistory.push({ ...activeSpring });
    if (springHistory.length > MAX_HISTORY) springHistory.shift();
    activeSpring = null;
  }

  function updateSpring(beforeResources, afterResources, beforeMetrics, afterMetrics, beforeSeason, afterSeason) {
    if (afterSeason === "spring" && !activeSpring) beginSpring(Math.floor(s.year), beforeResources);
    if (afterSeason === "spring" && activeSpring) {
      const germinated = positiveDelta(afterMetrics, beforeMetrics, "seedGerminated");
      const greenGrowth = positiveDelta(afterMetrics, beforeMetrics, "greenGrowth");
      const seedProduced = positiveDelta(afterMetrics, beforeMetrics, "seedProduced");
      activeSpring.endGreen = afterResources.green;
      activeSpring.greenGain += Math.max(0, afterResources.green - beforeResources.green);
      activeSpring.rootRecovery += Math.max(0, greenGrowth - germinated * 0.38);
      activeSpring.seedGerminated += germinated;

      if (germinated > 0) LG.incrementMetric("germinatedBiomass", germinated * 0.38);
      if (seedProduced > 0) LG.incrementMetric("seedDispersals", seedProduced);

      const recovered = activeSpring.greenGain >= SPRING_GREEN_GAIN_MIN
        || activeSpring.rootRecovery >= SPRING_ROOT_RECOVERY_MIN
        || activeSpring.seedGerminated >= SPRING_GERMINATION_MIN;
      if (recovered && !activeSpring.triggeredSpringRecovery) {
        activeSpring.triggeredSpringRecovery = true;
        if (s.springRecoveryYear !== activeSpring.year) {
          s.springRecoveryYear = activeSpring.year;
          LG.incrementMetric("springRecoveries");
          if (milestones.firstSpringRecoveryYear === null) milestones.firstSpringRecoveryYear = s.year;
          if (!s.eventFlags.firstSpringRecovery) {
            s.eventFlags.firstSpringRecovery = true;
            LG.addEvent("连续地表在整个春季累计完成根系恢复与种子发芽。 ");
          }
        }
      }
    }
    if (beforeSeason === "spring" && afterSeason !== "spring") finishSpring();
  }

  function updateMilestones() {
    populations.maximum.grazers = Math.max(populations.maximum.grazers, s.grazers.length);
    populations.maximum.hunters = Math.max(populations.maximum.hunters, s.hunters.length);
    populations.final = { grazers: s.grazers.length, hunters: s.hunters.length };
    milestones.longestCoexistence = Math.max(milestones.longestCoexistence, Number(s.longestCoexistence) || 0);

    const currentPresence = { grazers: s.grazers.length > 0, hunters: s.hunters.length > 0 };
    if (previousPresence.hunters && !currentPresence.hunters && milestones.hunterExtinctionYear === null) {
      milestones.hunterExtinctionYear = s.year;
    }
    if (previousPresence.grazers && !currentPresence.grazers && milestones.grazerExtinctionYear === null) {
      milestones.grazerExtinctionYear = s.year;
    }
    previousPresence = currentPresence;

    if (milestones.firstHunterBirthYear === null && (s.lifetime?.hunterBirths || 0) > 0) {
      milestones.firstHunterBirthYear = s.year;
    }
    if (milestones.firstSpringRecoveryYear === null && (s.lifetime?.springRecoveries || 0) > 0) {
      milestones.firstSpringRecoveryYear = s.year;
    }
  }

  function recordYear(previousYear, currentYear) {
    if (currentYear <= previousYear) return;
    const totals = resources();
    const lifetime = lifetimeCounters();
    yearlyTimeline.push({
      year: previousYear,
      grazers: s.grazers.length,
      hunters: s.hunters.length,
      green: totals.green,
      dry: totals.dry,
      seeds: totals.seeds,
      roots: totals.roots,
      hunterBirths: lifetime.hunterBirths - yearBaseline.lifetime.hunterBirths,
      springRecoveries: lifetime.springRecoveries - yearBaseline.lifetime.springRecoveries,
    });
    if (yearlyTimeline.length > MAX_HISTORY) yearlyTimeline.shift();
    yearBaseline = { year: currentYear, lifetime };
  }

  function compactSummary() {
    const experiment = LG.getExperimentDiagnostics?.() || {};
    const balance = LG.calculateBalance?.() || { label: "unknown", score: null, advice: null };
    const criteria = LG.missionCriteria?.() || {};
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
        failedCriteria: Object.entries(criteria).filter(([, passed]) => !passed).map(([key]) => key),
      },
      milestones: { ...milestones },
      populationSummary: {
        initial: { ...populations.initial },
        maximum: { ...populations.maximum },
        final: { ...populations.final },
      },
      reproductionDiagnostics: {
        hunter: {
          ...hunterSnapshot,
          attempts: hunterTotals.attempts,
          successes: hunterTotals.successes,
          evaluations: hunterTotals.evaluations,
          failureReasons: { ...hunterFailures },
        },
      },
      springDiagnostics: [
        ...springHistory.map((entry) => ({ ...entry })),
        ...(activeSpring ? [{ ...activeSpring }] : []),
      ],
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
    const previousYear = Math.floor(s.year);
    const beforeSeason = s.season;
    const beforeResources = resources();
    const beforeMetrics = { ...(s.vegetationMetrics || {}) };
    const result = baseUpdateWorld(dt);
    updateSpring(
      beforeResources,
      resources(),
      beforeMetrics,
      { ...(s.vegetationMetrics || {}) },
      beforeSeason,
      s.season,
    );
    updateMilestones();
    recordYear(previousYear, Math.floor(s.year));
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
    hunterPreyRatioMinimum: HUNTER_RATIO_MIN,
    springRecoveryMode: "whole-spring-cumulative",
    seedMetricSource: "continuous-grid-budget",
  });

  resetDiagnostics();

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__ecologyStabilityWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({ ...baseSnapshot(), compactSummary: compactSummary() });
      wrapped.__ecologyStabilityWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
