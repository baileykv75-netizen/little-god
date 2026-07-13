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
      retentionRadius: 225,
      minimumSize: 3,
      maximumSize: 8,
      socialityThreshold: 56,
      maxThreatRadiusBonus: 0.24,
      maxCombatBonus: 0.12,
    }),
    hunter: Object.freeze({
      label: "pack",
      radius: 220,
      retentionRadius: 275,
      minimumSize: 2,
      maximumSize: 5,
      socialityThreshold: 52,
      maxSenseRadiusBonus: 0.16,
      maxCombatBonus: 0.18,
    }),
  });

  const persistentGroups = {
    grazer: new Map(),
    hunter: new Map(),
  };
  const nextGroupSerial = { grazer: 1, hunter: 1 };
  const latestGroups = { grazer: [], hunter: [] };
  let refreshes = 0;
  let benefitedUpdates = 0;
  let preservedGroupRefreshes = 0;
  let createdGroups = 0;
  let dissolvedGroups = 0;

  function population(type) {
    return type === "grazer" ? LG.state.grazers : LG.state.hunters;
  }

  function sociality(animal) {
    return LG.clamp(Number(animal?.traits?.sociality) || 0, 0, 100);
  }

  function centerOf(members, fallback = { x: 0, y: 0 }) {
    if (!members.length) return { ...fallback };
    const center = members.reduce((total, animal) => ({
      x: total.x + animal.x,
      y: total.y + animal.y,
    }), { x: 0, y: 0 });
    center.x /= members.length;
    center.y /= members.length;
    return center;
  }

  function distanceToPointSquared(animal, point) {
    const dx = animal.x - point.x;
    const dy = animal.y - point.y;
    return dx * dx + dy * dy;
  }

  function clearAssignment(animal, type) {
    const threshold = CONFIG[type].socialityThreshold;
    animal.groupBehavior = {
      version: "social-groups-v2",
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

  function supportFor(type, members) {
    const config = CONFIG[type];
    const averageSociality = members.reduce((sum, animal) => sum + sociality(animal), 0) / members.length;
    const sizeFactor = LG.clamp(
      (members.length - config.minimumSize + 1) / Math.max(1, config.maximumSize - config.minimumSize + 1),
      0.25,
      1,
    );
    const socialFactor = LG.clamp(
      (averageSociality - config.socialityThreshold) / (100 - config.socialityThreshold),
      0,
      1,
    );
    return {
      averageSociality,
      support: LG.clamp(0.35 + sizeFactor * 0.35 + socialFactor * 0.3, 0, 1),
    };
  }

  function nextGroupId(type) {
    const id = `${CONFIG[type].label}-${nextGroupSerial[type]}`;
    nextGroupSerial[type] += 1;
    return id;
  }

  function createGroupRecord(type, members) {
    createdGroups += 1;
    return {
      id: nextGroupId(type),
      type,
      createdYear: LG.state.year,
      lastSeenYear: LG.state.year,
      center: centerOf(members),
      memberIds: members.map((animal) => animal.id),
    };
  }

  function assignGroup(type, members, record) {
    const config = CONFIG[type];
    const ordered = members.slice().sort((a, b) => a.id - b.id);
    const { averageSociality, support } = supportFor(type, ordered);
    const center = centerOf(ordered, record.center);
    record.lastSeenYear = LG.state.year;
    record.center = center;
    record.memberIds = ordered.map((animal) => animal.id);

    for (const animal of ordered) {
      animal.groupBehavior = {
        version: "social-groups-v2",
        type,
        role: config.label,
        groupId: record.id,
        size: ordered.length,
        averageSociality,
        support,
        bonuses: {},
        year: LG.state.year,
        groupCreatedYear: record.createdYear,
      };
    }

    return {
      id: record.id,
      type,
      size: ordered.length,
      maximumSize: config.maximumSize,
      averageSociality,
      support,
      center,
      createdYear: record.createdYear,
      lifetimeYears: Math.max(0, LG.state.year - record.createdYear),
      memberIds: record.memberIds.slice(),
    };
  }

  function recruitAroundCenter(type, members, available, assigned, initialCenter) {
    const config = CONFIG[type];
    const recruited = members.slice();
    let center = centerOf(recruited, initialCenter);

    while (recruited.length < config.maximumSize) {
      const candidate = [...available.values()]
        .filter((animal) => !assigned.has(animal.id) && !recruited.includes(animal))
        .filter((animal) => distanceToPointSquared(animal, center) <= config.radius ** 2)
        .sort((a, b) => (
          distanceToPointSquared(a, center) - distanceToPointSquared(b, center)
          || a.id - b.id
        ))[0];
      if (!candidate) break;
      recruited.push(candidate);
      center = centerOf(recruited, center);
    }

    return recruited;
  }

  function restorePersistentGroup(type, record, available, assigned) {
    const config = CONFIG[type];
    const previousCenter = record.center;
    const retained = record.memberIds
      .map((id) => available.get(id))
      .filter(Boolean)
      .filter((animal) => !assigned.has(animal.id))
      .filter((animal) => distanceToPointSquared(animal, previousCenter) <= config.retentionRadius ** 2)
      .sort((a, b) => (
        distanceToPointSquared(a, previousCenter) - distanceToPointSquared(b, previousCenter)
        || a.id - b.id
      ))
      .slice(0, config.maximumSize);

    const members = recruitAroundCenter(type, retained, available, assigned, previousCenter);
    if (members.length < config.minimumSize) return null;
    preservedGroupRefreshes += 1;
    return members;
  }

  function formNewGroup(type, seed, available, assigned) {
    const config = CONFIG[type];
    const candidates = [...available.values()]
      .filter((animal) => !assigned.has(animal.id))
      .filter((animal) => LG.distanceSquared(seed, animal) <= config.radius ** 2)
      .sort((a, b) => LG.distanceSquared(seed, a) - LG.distanceSquared(seed, b) || a.id - b.id)
      .slice(0, config.maximumSize);
    return candidates.length >= config.minimumSize ? candidates : null;
  }

  function buildGroups(type) {
    const config = CONFIG[type];
    const animals = population(type);
    for (const animal of animals) clearAssignment(animal, type);

    const candidates = animals
      .filter((animal) => sociality(animal) >= config.socialityThreshold)
      .sort((a, b) => a.id - b.id);
    const available = new Map(candidates.map((animal) => [animal.id, animal]));
    const assigned = new Set();
    const previous = persistentGroups[type];
    const next = new Map();
    const groups = [];

    for (const record of [...previous.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const members = restorePersistentGroup(type, record, available, assigned);
      if (!members) continue;
      for (const animal of members) assigned.add(animal.id);
      next.set(record.id, record);
      groups.push(assignGroup(type, members, record));
    }

    for (const seed of candidates) {
      if (assigned.has(seed.id)) continue;
      const members = formNewGroup(type, seed, available, assigned);
      if (!members) continue;
      const record = createGroupRecord(type, members);
      for (const animal of members) assigned.add(animal.id);
      next.set(record.id, record);
      groups.push(assignGroup(type, members, record));
    }

    dissolvedGroups += Math.max(0, previous.size - next.size);
    persistentGroups[type] = next;
    latestGroups[type] = groups;
    refreshes += 1;
    return groups;
  }

  function refreshGroups() {
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
    buildGroups(type);
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

  function resetPersistentGroups() {
    persistentGroups.grazer = new Map();
    persistentGroups.hunter = new Map();
    latestGroups.grazer = [];
    latestGroups.hunter = [];
    nextGroupSerial.grazer = 1;
    nextGroupSerial.hunter = 1;
  }

  const baseUpdateGrazers = LG.updateGrazers;
  LG.updateGrazers = (dt) => withTemporaryBenefits("grazer", () => baseUpdateGrazers(dt));

  const baseUpdateHunters = LG.updateHunters;
  LG.updateHunters = (dt) => withTemporaryBenefits("hunter", () => baseUpdateHunters(dt));

  const baseSeedWorld = LG.seedWorld;
  if (typeof baseSeedWorld === "function") {
    LG.seedWorld = (...args) => {
      resetPersistentGroups();
      return baseSeedWorld.apply(LG, args);
    };
  }

  LG.refreshSocialGroups = refreshGroups;
  LG.resetSocialGroups = resetPersistentGroups;
  LG.getGroupBehaviorDiagnostics = () => {
    const groups = refreshGroups();
    const allGroups = [...groups.grazers, ...groups.hunters];
    const allAnimals = [...LG.state.grazers, ...LG.state.hunters];
    const groupedAnimals = allAnimals.filter((animal) => Boolean(animal.groupBehavior?.groupId));
    return {
      version: "social-groups-v2",
      grazerHerds: groups.grazers.length,
      hunterPacks: groups.hunters.length,
      groupedAnimals: groupedAnimals.length,
      solitaryAnimals: allAnimals.length - groupedAnimals.length,
      largestGroup: allGroups.reduce((largest, group) => Math.max(largest, group.size), 0),
      averageGroupSize: allGroups.length
        ? allGroups.reduce((sum, group) => sum + group.size, 0) / allGroups.length
        : 0,
      groupSizeCaps: {
        grazer: CONFIG.grazer.maximumSize,
        hunter: CONFIG.hunter.maximumSize,
      },
      refreshes,
      preservedGroupRefreshes,
      createdGroups,
      dissolvedGroups,
      benefitedUpdates,
      groups: allGroups,
    };
  };

  LG.groupBehaviorModel = Object.freeze({
    version: "social-groups-v2",
    grazerBehavior: "herd-defense-and-warning",
    hunterBehavior: "pack-sensing-and-combat",
    usesSocialityThresholds: true,
    temporaryDerivedBonuses: true,
    persistentGroupIds: true,
    centroidBoundedRecruitment: true,
    chainConnectedComponents: false,
    groupSizeCaps: Object.freeze({
      grazer: CONFIG.grazer.maximumSize,
      hunter: CONFIG.hunter.maximumSize,
    }),
    membershipHysteresis: true,
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
