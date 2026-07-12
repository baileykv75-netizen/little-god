(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Hunter mate seeking requires LittleGod core");
  if (typeof LG.updateHunters !== "function" || typeof LG.wander !== "function" || typeof LG.moveAnimal !== "function") {
    throw new Error("Hunter mate seeking requires simulation.js");
  }

  const SEARCH_RADIUS_MULTIPLIER = 1.55;
  const SEARCH_RADIUS_MAX = 720;
  const ENERGY_READY_RATIO = 0.68;
  const MATE_ENERGY_RATIO = 0.62;
  const LOCAL_PREY_RATIO_MIN = 1.15;

  let searches = 0;
  let directedMoves = 0;
  let compatiblePairsInRange = 0;
  let blockedByEnergy = 0;
  let blockedByPrey = 0;
  let blockedBySeason = 0;
  let noCompatibleMate = 0;
  let activeSeekers = 0;
  let lastSeekers = [];

  function statsOf(animal) {
    const config = LG.SPECIES?.hunter || {};
    return animal?.derived || {
      maxEnergy: config.maxEnergy || 100,
      walkSpeed: config.walkSpeed || 45,
      senseRadius: config.senseRadius || 320,
      mateRange: 220,
    };
  }

  function isAdult(animal) {
    return typeof LG.lifeStage === "function" ? LG.lifeStage(animal) === "adult" : animal?.age >= 1;
  }

  function isCompatible(seeker, candidate) {
    if (!candidate || candidate.id === seeker.id || candidate.sex === seeker.sex) return false;
    if (!isAdult(candidate) || candidate.reproductionCooldown > 0) return false;
    const candidateStats = statsOf(candidate);
    if (candidate.energy < candidateStats.maxEnergy * MATE_ENERGY_RATIO) return false;
    if (typeof LG.isCloseKin === "function" && LG.isCloseKin(seeker, candidate)) return false;
    return true;
  }

  function within(source, targets, radius, predicate = null) {
    const radiusSquared = radius * radius;
    return targets.filter((target) => (
      (!predicate || predicate(target))
      && LG.distanceSquared(source, target) <= radiusSquared
    ));
  }

  function nearest(source, targets) {
    let best = null;
    let bestDistance = Infinity;
    for (const target of targets) {
      const distance = LG.distanceSquared(source, target);
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best;
  }

  function canSeek(animal) {
    if (!isAdult(animal) || animal.reproductionCooldown > 0) return false;
    const derived = statsOf(animal);
    if (animal.energy < derived.maxEnergy * ENERGY_READY_RATIO) {
      blockedByEnergy += 1;
      return false;
    }
    if ((animal.stateTimer || 0) > 0 || ["chase", "feed", "scavenge", "rest"].includes(animal.state)) return false;
    return true;
  }

  function buildSearchPlan() {
    const hunters = LG.state?.hunters || [];
    const grazers = LG.state?.grazers || [];
    const season = typeof LG.reproductionSeasonMultiplier === "function"
      ? LG.reproductionSeasonMultiplier()
      : 1;
    const plan = new Map();
    lastSeekers = [];

    if (season <= 0) {
      blockedBySeason += hunters.filter((animal) => isAdult(animal)).length;
      activeSeekers = 0;
      return plan;
    }

    for (const hunter of hunters) {
      if (!canSeek(hunter)) continue;
      const derived = statsOf(hunter);
      const mateRange = Math.max(180, Number(derived.mateRange) || 220);
      const compatibleNearby = within(hunter, hunters, mateRange, (candidate) => isCompatible(hunter, candidate));
      if (compatibleNearby.length) {
        compatiblePairsInRange += 1;
        continue;
      }

      const senseRadius = Math.max(mateRange, Number(derived.senseRadius) || 320);
      const searchRadius = LG.clamp(
        Math.max(mateRange * 1.35, senseRadius * SEARCH_RADIUS_MULTIPLIER),
        mateRange,
        SEARCH_RADIUS_MAX,
      );
      const localHunters = Math.max(1, within(hunter, hunters, senseRadius).length);
      const localPrey = within(hunter, grazers, senseRadius).length;
      if (localPrey / localHunters < LOCAL_PREY_RATIO_MIN) {
        blockedByPrey += 1;
        continue;
      }

      searches += 1;
      const candidates = within(hunter, hunters, searchRadius, (candidate) => isCompatible(hunter, candidate));
      const target = nearest(hunter, candidates);
      if (!target) {
        noCompatibleMate += 1;
        continue;
      }

      plan.set(hunter.id, {
        targetId: target.id,
        searchRadius,
      });
      lastSeekers.push({ seekerId: hunter.id, targetId: target.id, searchRadius });
    }

    activeSeekers = plan.size;
    return plan;
  }

  const baseUpdateHunters = LG.updateHunters;
  LG.updateHunters = (dt) => {
    const plan = buildSearchPlan();
    if (!plan.size) return baseUpdateHunters(dt);

    const baseWander = LG.wander;
    LG.wander = (animal, speed, step) => {
      const instruction = animal?.type === "hunter" ? plan.get(animal.id) : null;
      const target = instruction
        ? (LG.state?.hunters || []).find((candidate) => candidate.id === instruction.targetId)
        : null;
      if (!instruction || !target || !isCompatible(animal, target)) {
        return baseWander(animal, speed, step);
      }

      const angle = Math.atan2(target.y - animal.y, target.x - animal.x);
      LG.moveAnimal(animal, angle, speed * 0.82, step);
      animal.state = "seekMate";
      animal.preferredMateId = target.id;
      animal.mateSeeking = {
        version: "hunter-mate-seeking-v1",
        targetId: target.id,
        searchRadius: instruction.searchRadius,
        year: LG.state?.year ?? 0,
      };
      directedMoves += 1;
      return undefined;
    };

    try {
      return baseUpdateHunters(dt);
    } finally {
      LG.wander = baseWander;
    }
  };

  function diagnostics() {
    return {
      version: "hunter-mate-seeking-v1",
      perceptionMode: "local-sense-radius-only",
      searchRadiusMultiplier: SEARCH_RADIUS_MULTIPLIER,
      searchRadiusMaximum: SEARCH_RADIUS_MAX,
      localPreyRatioMinimum: LOCAL_PREY_RATIO_MIN,
      searches,
      directedMoves,
      compatiblePairsInRange,
      blockedByEnergy,
      blockedByPrey,
      blockedBySeason,
      noCompatibleMate,
      activeSeekers,
      lastSeekers: lastSeekers.map((entry) => ({ ...entry })),
    };
  }

  LG.getHunterMateSeekingDiagnostics = diagnostics;
  LG.hunterMateSeekingModel = Object.freeze({
    version: "hunter-mate-seeking-v1",
    localPerceptionOnly: true,
    replacesWanderOnly: true,
    interruptsHunting: false,
    respectsKinship: true,
    requiresLocalPreySupport: true,
  });

  if (typeof LG.getEcologySupervisionDiagnostics === "function") {
    const baseCompactSummary = LG.getEcologySupervisionDiagnostics;
    LG.getEcologySupervisionDiagnostics = () => {
      const summary = baseCompactSummary();
      const reproductionDiagnostics = summary?.reproductionDiagnostics || {};
      const hunter = reproductionDiagnostics.hunter || {};
      return {
        ...summary,
        reproductionDiagnostics: {
          ...reproductionDiagnostics,
          hunter: {
            ...hunter,
            mateSeeking: diagnostics(),
          },
        },
      };
    };
  }

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__hunterMateSeekingWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => {
        const snapshot = baseSnapshot();
        const compact = snapshot?.compactSummary;
        if (!compact) return { ...snapshot, hunterMateSeeking: diagnostics() };
        const reproductionDiagnostics = compact.reproductionDiagnostics || {};
        return {
          ...snapshot,
          hunterMateSeeking: diagnostics(),
          compactSummary: {
            ...compact,
            reproductionDiagnostics: {
              ...reproductionDiagnostics,
              hunter: {
                ...(reproductionDiagnostics.hunter || {}),
                mateSeeking: diagnostics(),
              },
            },
          },
        };
      };
      wrapped.__hunterMateSeekingWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
