(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Pack hunting requires LittleGod core");
  if (typeof LG.updateHunters !== "function" || typeof LG.incrementMetric !== "function") {
    throw new Error("Pack hunting requires simulation.js");
  }

  const MIN_PACK_SIZE = 2;
  const MIN_SHARED_OBSERVERS = 2;
  const targetByPack = new Map();
  let pendingHunt = null;
  let updates = 0;
  let targetAcquisitions = 0;
  let targetSwitches = 0;
  let targetLosses = 0;
  let memberAssignments = 0;
  const huntSamples = {
    coordinated: { attempts: 0, successes: 0 },
    uncoordinatedPack: { attempts: 0, successes: 0 },
  };

  const stableRate = (bucket) => (
    bucket.attempts ? bucket.successes / bucket.attempts : null
  );

  function packGroups() {
    const groups = new Map();
    for (const hunter of LG.state.hunters || []) {
      const group = hunter.groupBehavior;
      if (group?.role !== "pack" || !group.groupId || Number(group.size) < MIN_PACK_SIZE) continue;
      if (!groups.has(group.groupId)) groups.set(group.groupId, []);
      groups.get(group.groupId).push(hunter);
    }
    return [...groups.entries()]
      .map(([groupId, members]) => ({
        groupId,
        members: members.sort((a, b) => a.id - b.id),
      }))
      .filter((pack) => pack.members.length >= MIN_PACK_SIZE);
  }

  function visibleObserverCount(pack, prey) {
    return pack.members.filter((hunter) => {
      const senseRadius = Number(hunter.derived?.senseRadius)
        || Number(LG.SPECIES?.hunter?.senseRadius)
        || 260;
      return LG.distanceSquared(hunter, prey) <= senseRadius * senseRadius;
    }).length;
  }

  function packCenter(pack) {
    const center = pack.members.reduce((sum, hunter) => ({
      x: sum.x + hunter.x,
      y: sum.y + hunter.y,
    }), { x: 0, y: 0 });
    center.x /= pack.members.length;
    center.y /= pack.members.length;
    return center;
  }

  function preyScore(pack, prey, observerCount) {
    const center = packCenter(pack);
    const centerDistance = Math.hypot(prey.x - center.x, prey.y - center.y);
    const staminaMax = Number(prey.derived?.staminaMax) || 1;
    const staminaRatio = Math.max(0, Math.min(1, Number(prey.stamina) / staminaMax));
    const combatPower = typeof LG.currentCombatPower === "function"
      ? Number(LG.currentCombatPower(prey)) || 50
      : 50;
    const nearbyGrazers = (LG.state.grazers || []).filter((candidate) => (
      candidate !== prey && LG.distanceSquared(candidate, prey) <= 85 * 85
    )).length;
    const isolation = nearbyGrazers <= 1 ? 12 : nearbyGrazers <= 3 ? 5 : 0;
    return observerCount * 28
      + (100 - combatPower) * 0.32
      + (1 - staminaRatio) * 18
      + isolation
      - centerDistance * 0.055;
  }

  function chooseSharedTarget(pack) {
    const existing = targetByPack.get(pack.groupId);
    if (existing) {
      const prey = (LG.state.grazers || []).find((candidate) => candidate.id === existing.targetId);
      if (prey && visibleObserverCount(pack, prey) >= MIN_SHARED_OBSERVERS) return prey;
    }

    let best = null;
    let bestScore = -Infinity;
    for (const prey of LG.state.grazers || []) {
      const observerCount = visibleObserverCount(pack, prey);
      if (observerCount < MIN_SHARED_OBSERVERS) continue;
      const score = preyScore(pack, prey, observerCount);
      if (score > bestScore || (score === bestScore && prey.id < best?.id)) {
        best = prey;
        bestScore = score;
      }
    }
    return best;
  }

  function clearMemberCoordination(pack, targetId = null) {
    for (const hunter of pack.members) {
      if (targetId !== null && hunter.targetId === targetId) hunter.targetId = null;
      hunter.packHunting = {
        version: "shared-pack-target-v1",
        coordinated: false,
        packId: pack.groupId,
        targetId: null,
        observerCount: 0,
        memberCount: pack.members.length,
        year: Number(LG.state.year) || 0,
      };
    }
  }

  function assignSharedTarget(pack, prey) {
    const previous = targetByPack.get(pack.groupId);
    if (!prey) {
      if (previous) {
        targetLosses += 1;
        targetByPack.delete(pack.groupId);
      }
      clearMemberCoordination(pack, previous?.targetId ?? null);
      return null;
    }

    const observerCount = visibleObserverCount(pack, prey);
    if (!previous) targetAcquisitions += 1;
    else if (previous.targetId !== prey.id) {
      targetSwitches += 1;
      targetAcquisitions += 1;
    }

    targetByPack.set(pack.groupId, {
      targetId: prey.id,
      acquiredYear: previous?.targetId === prey.id
        ? previous.acquiredYear
        : Number(LG.state.year) || 0,
      observerCount,
      memberIds: pack.members.map((hunter) => hunter.id),
    });

    for (const hunter of pack.members) {
      hunter.targetId = prey.id;
      hunter.packHunting = {
        version: "shared-pack-target-v1",
        coordinated: true,
        packId: pack.groupId,
        targetId: prey.id,
        observerCount,
        memberCount: pack.members.length,
        acquiredYear: targetByPack.get(pack.groupId).acquiredYear,
        year: Number(LG.state.year) || 0,
      };
      memberAssignments += 1;
    }
    return prey;
  }

  function preparePackTargets() {
    if (typeof LG.refreshSocialGroups === "function") LG.refreshSocialGroups();
    const packs = packGroups();
    const activePackIds = new Set(packs.map((pack) => pack.groupId));

    for (const pack of packs) assignSharedTarget(pack, chooseSharedTarget(pack));
    for (const [packId, target] of [...targetByPack.entries()]) {
      if (activePackIds.has(packId)) continue;
      targetByPack.delete(packId);
      targetLosses += 1;
      for (const hunter of LG.state.hunters || []) {
        if (hunter.packHunting?.packId !== packId) continue;
        if (hunter.targetId === target.targetId) hunter.targetId = null;
        hunter.packHunting = null;
      }
    }
    return packs;
  }

  function reconcileAfterUpdate(packs) {
    const livingPreyIds = new Set((LG.state.grazers || []).map((prey) => prey.id));
    for (const pack of packs) {
      const target = targetByPack.get(pack.groupId);
      if (!target || livingPreyIds.has(target.targetId)) continue;
      targetByPack.delete(pack.groupId);
      targetLosses += 1;
      clearMemberCoordination(pack, target.targetId);
    }
  }

  function likelyAttemptingHunter() {
    const attackCooldown = Number(LG.SPECIES?.hunter?.attackCooldown) || 0.16;
    return (LG.state.hunters || [])
      .filter((hunter) => (
        hunter.state === "chase"
        && Number(hunter.attackCooldown) >= attackCooldown * 0.9
      ))
      .sort((a, b) => (
        Number(b.attackCooldown) - Number(a.attackCooldown)
        || a.id - b.id
      ))[0] || null;
  }

  function classifyHuntAttempt() {
    const hunter = likelyAttemptingHunter();
    if (!hunter) return null;
    const inPack = hunter.groupBehavior?.role === "pack"
      && Number(hunter.groupBehavior?.size) >= MIN_PACK_SIZE;
    if (!inPack) return null;
    const coordinated = hunter.packHunting?.coordinated === true
      && hunter.packHunting.targetId === hunter.targetId;
    return {
      hunterId: hunter.id,
      packId: hunter.groupBehavior.groupId,
      targetId: hunter.targetId ?? null,
      mode: coordinated ? "coordinated" : "uncoordinatedPack",
      observerCount: Number(hunter.packHunting?.observerCount) || 0,
      memberCount: Number(hunter.groupBehavior?.size) || 1,
      year: Number(LG.state.year) || 0,
    };
  }

  const baseIncrementMetric = LG.incrementMetric;
  LG.incrementMetric = (key, amount = 1) => {
    const result = baseIncrementMetric(key, amount);
    if (key === "huntAttempts") {
      pendingHunt = classifyHuntAttempt();
      if (pendingHunt) huntSamples[pendingHunt.mode].attempts += amount;
    } else if (key === "huntSuccesses" || key === "huntFailures") {
      if (pendingHunt) {
        if (key === "huntSuccesses") huntSamples[pendingHunt.mode].successes += amount;
        pendingHunt = null;
      }
    }
    return result;
  };

  const baseUpdateHunters = LG.updateHunters;
  LG.updateHunters = (dt) => {
    const packs = preparePackTargets();
    updates += 1;
    const result = baseUpdateHunters(dt);
    reconcileAfterUpdate(packs);
    return result;
  };

  function reset() {
    targetByPack.clear();
    pendingHunt = null;
    updates = 0;
    targetAcquisitions = 0;
    targetSwitches = 0;
    targetLosses = 0;
    memberAssignments = 0;
    huntSamples.coordinated.attempts = 0;
    huntSamples.coordinated.successes = 0;
    huntSamples.uncoordinatedPack.attempts = 0;
    huntSamples.uncoordinatedPack.successes = 0;
  }

  const baseSeedWorld = LG.seedWorld;
  if (typeof baseSeedWorld === "function") {
    LG.seedWorld = (...args) => {
      const result = baseSeedWorld.apply(LG, args);
      reset();
      return result;
    };
  }

  function diagnostics() {
    const packs = packGroups();
    const activeTargets = packs
      .map((pack) => {
        const target = targetByPack.get(pack.groupId);
        if (!target) return null;
        return {
          packId: pack.groupId,
          targetId: target.targetId,
          memberIds: pack.members.map((hunter) => hunter.id),
          observerCount: target.observerCount,
          acquiredYear: target.acquiredYear,
        };
      })
      .filter(Boolean);
    return {
      version: "shared-pack-target-v1",
      activePacks: packs.length,
      coordinatedPacks: activeTargets.length,
      membersFollowingSharedTarget: activeTargets.reduce((sum, target) => sum + target.memberIds.length, 0),
      updates,
      targetAcquisitions,
      targetSwitches,
      targetLosses,
      memberAssignments,
      hunts: {
        coordinatedPackHunts: huntSamples.coordinated.attempts,
        coordinatedPackHuntSuccesses: huntSamples.coordinated.successes,
        coordinatedPackHuntSuccessRate: stableRate(huntSamples.coordinated),
        uncoordinatedPackHunts: huntSamples.uncoordinatedPack.attempts,
        uncoordinatedPackHuntSuccesses: huntSamples.uncoordinatedPack.successes,
        uncoordinatedPackHuntSuccessRate: stableRate(huntSamples.uncoordinatedPack),
      },
      definitions: {
        coordinatedPack: `at least ${MIN_PACK_SIZE} persistent pack members share one prey target`,
        sharedObservation: `at least ${MIN_SHARED_OBSERVERS} pack members can currently sense the prey`,
        successRate: "successful attempts divided by attempts; null when no attempts exist",
      },
      activeTargets,
    };
  }

  const baseCompactSummary = LG.getEcologySupervisionDiagnostics;
  if (typeof baseCompactSummary === "function") {
    LG.getEcologySupervisionDiagnostics = () => ({
      ...baseCompactSummary(),
      packCoordination: diagnostics(),
    });
  }

  LG.getPackHuntingDiagnostics = diagnostics;
  LG.packHuntingModel = Object.freeze({
    version: "shared-pack-target-v1",
    changesTargetSelection: true,
    changesBaseHuntProbability: false,
    minimumPackSize: MIN_PACK_SIZE,
    minimumSharedObservers: MIN_SHARED_OBSERVERS,
    preservesLocalPreyRatioGate: true,
    preservesIndividualEnergyGate: true,
  });

  reset();

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__packHuntingWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({ ...baseSnapshot(), packCoordination: diagnostics() });
      wrapped.__packHuntingWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
