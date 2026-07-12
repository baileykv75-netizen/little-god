(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Group behavior requires LittleGod core");
  if (typeof LG.updateGrazers !== "function" || typeof LG.updateHunters !== "function") {
    throw new Error("Group behavior requires simulation.js");
  }

  const CONFIG = Object.freeze({
    grazer: Object.freeze({
      label: "herd",
      radius: 180,
      minimumSize: 3,
      socialityThreshold: 56,
      maxThreatRadiusBonus: 0.24,
      maxCombatBonus: 0.12,
    }),
    hunter: Object.freeze({
      label: "pack",
      radius: 220,
      minimumSize: 2,
      socialityThreshold: 52,
      maxSenseRadiusBonus: 0.16,
      maxCombatBonus: 0.18,
    }),
  });

  let refreshes = 0;
  let benefitedUpdates = 0;

  function population(type) {
    return type === "grazer" ? LG.state.grazers : LG.state.hunters;
  }

  function sociality(animal) {
    return LG.clamp(Number(animal?.traits?.sociality) || 0, 0, 100);
  }

  function componentMembers(seed, candidates, radiusSquared, visited) {
    const component = [];
    const queue = [seed];
    visited.add(seed);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const candidate of candidates) {
        if (visited.has(candidate)) continue;
        if (LG.distanceSquared(current, candidate) > radiusSquared) continue;
        visited.add(candidate);
        queue.push(candidate);
      }
    }
    return component;
  }

  function clearAssignment(animal, type) {
    const threshold = CONFIG[type].socialityThreshold;
    animal.groupBehavior = {
      version: "social-groups-v1",
      type,
      role: sociality(animal) >= threshold ? "ungrouped" : "solitary",
      groupId: null,
      size: 1,
      averageSociality: sociality(animal),
      support: 0,
      bonuses: {},
      year: LG.state.year,
    };
  }

  function assignGroup(type, members) {
    const config = CONFIG[type];
    const ordered = members.slice().sort((a, b) => a.id - b.id);
    const averageSociality = ordered.reduce((sum, animal) => sum + sociality(animal), 0) / ordered.length;
    const sizeFactor = LG.clamp((ordered.length - config.minimumSize + 1) / 4, 0.25, 1);
    const socialFactor = LG.clamp(
      (averageSociality - config.socialityThreshold) / (100 - config.socialityThreshold),
      0,
      1,
    );
    const support = LG.clamp(0.35 + sizeFactor * 0.35 + socialFactor * 0.3, 0, 1);
    const groupId = `${config.label}-${ordered[0].id}`;

    for (const animal of ordered) {
      animal.groupBehavior = {
        version: "social-groups-v1",
        type,
        role: config.label,
        groupId,
        size: ordered.length,
        averageSociality,
        support,
        bonuses: {},
        year: LG.state.year,
      };
    }
    return {
      id: groupId,
      type,
      size: ordered.length,
      averageSociality,
      support,
      memberIds: ordered.map((animal) => animal.id),
    };
  }

  function buildGroups(type) {
    const config = CONFIG[type];
    const animals = population(type);
    for (const animal of animals) clearAssignment(animal, type);

    const candidates = animals.filter((animal) => sociality(animal) >= config.socialityThreshold);
    const visited = new Set();
    const groups = [];
    for (const animal of candidates) {
      if (visited.has(animal)) continue;
      const members = componentMembers(animal, candidates, config.radius ** 2, visited);
      if (members.length >= config.minimumSize) groups.push(assignGroup(type, members));
    }
    return groups;
  }

  function refreshGroups() {
    refreshes += 1;
    return {
      grazers: buildGroups("grazer"),
      hunters: buildGroups("hunter"),
    };
  }

  function groupBonuses(animal, type) {
    const group = animal.groupBehavior;
    if (!group?.groupId || group.role !== CONFIG[type].label) return null;
    if (type === "grazer") {
      return {
        threatRadiusMultiplier: 1 + CONFIG.grazer.maxThreatRadiusBonus * group.support,
        combatMultiplier: 1 + CONFIG.grazer.maxCombatBonus * group.support,
      };
    }
    return {
      senseRadiusMultiplier: 1 + CONFIG.hunter.maxSenseRadiusBonus * group.support,
      combatMultiplier: 1 + CONFIG.hunter.maxCombatBonus * group.support,
    };
  }

  function withTemporaryBenefits(type, update) {
    refreshGroups();
    const snapshots = [];
    for (const animal of population(type)) {
      const derived = animal.derived;
      const bonuses = groupBonuses(animal, type);
      if (!derived || !bonuses) continue;
      snapshots.push({
        animal,
        combatBase: derived.combatBase,
        senseRadius: derived.senseRadius,
        threatRadius: derived.threatRadius,
      });
      derived.combatBase *= bonuses.combatMultiplier;
      if (type === "grazer") derived.threatRadius *= bonuses.threatRadiusMultiplier;
      else derived.senseRadius *= bonuses.senseRadiusMultiplier;
      animal.groupBehavior.bonuses = { ...bonuses };
      benefitedUpdates += 1;
    }

    try {
      return update();
    } finally {
      for (const snapshot of snapshots) {
        snapshot.animal.derived.combatBase = snapshot.combatBase;
        snapshot.animal.derived.senseRadius = snapshot.senseRadius;
        snapshot.animal.derived.threatRadius = snapshot.threatRadius;
      }
    }
  }

  const baseUpdateGrazers = LG.updateGrazers;
  LG.updateGrazers = (dt) => withTemporaryBenefits("grazer", () => baseUpdateGrazers(dt));

  const baseUpdateHunters = LG.updateHunters;
  LG.updateHunters = (dt) => withTemporaryBenefits("hunter", () => baseUpdateHunters(dt));

  LG.refreshSocialGroups = refreshGroups;
  LG.getGroupBehaviorDiagnostics = () => {
    const groups = refreshGroups();
    const allGroups = [...groups.grazers, ...groups.hunters];
    const allAnimals = [...LG.state.grazers, ...LG.state.hunters];
    const groupedAnimals = allAnimals.filter((animal) => Boolean(animal.groupBehavior?.groupId));
    return {
      version: "social-groups-v1",
      grazerHerds: groups.grazers.length,
      hunterPacks: groups.hunters.length,
      groupedAnimals: groupedAnimals.length,
      solitaryAnimals: allAnimals.length - groupedAnimals.length,
      largestGroup: allGroups.reduce((largest, group) => Math.max(largest, group.size), 0),
      averageGroupSize: allGroups.length
        ? allGroups.reduce((sum, group) => sum + group.size, 0) / allGroups.length
        : 0,
      refreshes,
      benefitedUpdates,
      groups: allGroups,
    };
  };

  LG.groupBehaviorModel = Object.freeze({
    version: "social-groups-v1",
    grazerBehavior: "herd-defense-and-warning",
    hunterBehavior: "pack-sensing-and-combat",
    usesSocialityThresholds: true,
    temporaryDerivedBonuses: true,
  });

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__groupBehaviorWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({
        ...baseSnapshot(),
        groupBehavior: LG.getGroupBehaviorDiagnostics(),
      });
      wrapped.__groupBehaviorWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
