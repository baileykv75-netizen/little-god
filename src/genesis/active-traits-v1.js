(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Active traits require LittleGod core");
  if (typeof LG.moveAnimal !== "function" || !LG.state) {
    throw new Error("Active traits require simulation.js");
  }

  const { state } = LG;
  const MODE = Object.freeze({
    GROUP: "group-cohere",
    COHERE: "cohere",
    AVOID: "avoid",
    REMEMBER: "remember",
    ROAM: "roam",
    ALONE: "alone",
  });
  const GROUP_SPACING = Object.freeze({
    grazer: Object.freeze({ preferredRadius: 72, separationRadius: 30 }),
    hunter: Object.freeze({ preferredRadius: 88, separationRadius: 38 }),
  });

  function normalizeTrait(value, fallback = 50) {
    return LG.clamp(Number.isFinite(value) ? value : fallback, 0, 100) / 100;
  }

  function stableYears(value) {
    return Math.round(Math.max(0, value) * 1e9) / 1e9;
  }

  function memorySpanYears(animal) {
    return LG.clamp(Number.isFinite(animal.traits?.memorySpan)
      ? animal.traits.memorySpan
      : 1.5, 0.25, 5);
  }

  function angularBlend(from, to, weight) {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * LG.clamp(weight, 0, 1);
  }

  function populationOf(animal) {
    return animal.type === "hunter" ? state.hunters : state.grazers;
  }

  function conspecificsWithin(animal, radius) {
    const radiusSquared = radius * radius;
    return populationOf(animal).filter((candidate) => (
      candidate !== animal
      && LG.distanceSquared(animal, candidate) <= radiusSquared
    ));
  }

  function currentGroupmates(animal) {
    const groupId = animal.groupBehavior?.groupId;
    if (!groupId) return [];
    return populationOf(animal).filter((candidate) => (
      candidate !== animal
      && candidate.groupBehavior?.groupId === groupId
    ));
  }

  function rememberSocialCenter(animal, center) {
    const span = memorySpanYears(animal);
    animal.observationMemory = animal.observationMemory || {};
    animal.observationMemory.socialCenter = {
      x: center.x,
      y: center.y,
      observedYear: stableYears(state.year),
      expiresYear: stableYears(state.year + span),
    };
    return animal.observationMemory.socialCenter;
  }

  function recalledSocialCenter(animal) {
    const memory = animal.observationMemory?.socialCenter;
    if (!memory) return null;
    if (state.year > memory.expiresYear) {
      delete animal.observationMemory.socialCenter;
      return null;
    }
    return memory;
  }

  function groupSteering(animal, baseAngle, groupmates, sociality) {
    const members = [animal, ...groupmates];
    const center = members.reduce((total, candidate) => ({
      x: total.x + candidate.x,
      y: total.y + candidate.y,
    }), { x: 0, y: 0 });
    center.x /= members.length;
    center.y /= members.length;
    rememberSocialCenter(animal, center);

    const spacing = GROUP_SPACING[animal.type] || GROUP_SPACING.grazer;
    let separationX = 0;
    let separationY = 0;
    let separationNeighbors = 0;
    for (const candidate of groupmates) {
      const dx = animal.x - candidate.x;
      const dy = animal.y - candidate.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0 || distance >= spacing.separationRadius) continue;
      const pressure = (spacing.separationRadius - distance) / spacing.separationRadius;
      separationX += (dx / distance) * pressure;
      separationY += (dy / distance) * pressure;
      separationNeighbors += 1;
    }

    const centerDx = center.x - animal.x;
    const centerDy = center.y - animal.y;
    const centerDistance = Math.hypot(centerDx, centerDy);
    const towardCenter = Math.atan2(centerDy, centerDx);
    const separationMagnitude = Math.hypot(separationX, separationY);

    let angle = baseAngle;
    let separationActive = false;
    if (separationMagnitude > 1e-6) {
      angle = angularBlend(baseAngle, Math.atan2(separationY, separationX), 0.5 + sociality * 0.08);
      separationActive = true;
    } else {
      const heading = members.reduce((vector, candidate) => ({
        x: vector.x + Math.cos(candidate.angle || 0),
        y: vector.y + Math.sin(candidate.angle || 0),
      }), { x: 0, y: 0 });
      if (Math.hypot(heading.x, heading.y) > 1e-6) {
        angle = angularBlend(
          angle,
          Math.atan2(heading.y, heading.x),
          0.22 + sociality * 0.14,
        );
      }
      if (centerDistance > spacing.preferredRadius) {
        const excess = LG.clamp(
          (centerDistance - spacing.preferredRadius) / spacing.preferredRadius,
          0,
          1,
        );
        angle = angularBlend(angle, towardCenter, 0.18 + excess * 0.4);
      }
    }

    return {
      angle,
      mode: MODE.GROUP,
      neighborCount: groupmates.length,
      sociality,
      memoryActive: false,
      memoryAge: 0,
      groupId: animal.groupBehavior.groupId,
      groupMemberCount: members.length,
      groupCenterDistance: centerDistance,
      groupCohesionActive: true,
      separationActive,
      separationNeighbors,
    };
  }

  function socialDirection(animal, baseAngle) {
    const sociality = normalizeTrait(animal.traits?.sociality);
    const groupmates = currentGroupmates(animal);
    if (groupmates.length) return groupSteering(animal, baseAngle, groupmates, sociality);

    const senseRadius = animal.derived?.senseRadius || 180;
    const neighbors = conspecificsWithin(animal, Math.max(70, senseRadius * 0.58));

    if (neighbors.length) {
      const center = neighbors.reduce((total, candidate) => ({
        x: total.x + candidate.x,
        y: total.y + candidate.y,
      }), { x: 0, y: 0 });
      center.x /= neighbors.length;
      center.y /= neighbors.length;

      const toward = Math.atan2(center.y - animal.y, center.x - animal.x);
      if (sociality >= 0.58) {
        rememberSocialCenter(animal, center);
        const weight = 0.16 + (sociality - 0.58) * 0.92;
        return {
          angle: angularBlend(baseAngle, toward, weight),
          mode: MODE.COHERE,
          neighborCount: neighbors.length,
          sociality,
          memoryActive: false,
          memoryAge: 0,
          groupId: null,
          groupMemberCount: 0,
          groupCenterDistance: 0,
          groupCohesionActive: false,
          separationActive: false,
          separationNeighbors: 0,
        };
      }

      if (sociality <= 0.38) {
        const away = toward + Math.PI;
        const weight = 0.14 + (0.38 - sociality) * 0.9;
        return {
          angle: angularBlend(baseAngle, away, weight),
          mode: MODE.AVOID,
          neighborCount: neighbors.length,
          sociality,
          memoryActive: false,
          memoryAge: 0,
          groupId: null,
          groupMemberCount: 0,
          groupCenterDistance: 0,
          groupCohesionActive: false,
          separationActive: false,
          separationNeighbors: 0,
        };
      }

      return {
        angle: baseAngle,
        mode: MODE.ROAM,
        neighborCount: neighbors.length,
        sociality,
        memoryActive: false,
        memoryAge: 0,
        groupId: null,
        groupMemberCount: 0,
        groupCenterDistance: 0,
        groupCohesionActive: false,
        separationActive: false,
        separationNeighbors: 0,
      };
    }

    const memory = sociality >= 0.58 ? recalledSocialCenter(animal) : null;
    if (memory) {
      const distanceSquared = (memory.x - animal.x) ** 2 + (memory.y - animal.y) ** 2;
      if (distanceSquared > 18 ** 2) {
        const towardMemory = Math.atan2(memory.y - animal.y, memory.x - animal.x);
        const weight = 0.14 + sociality * 0.24;
        return {
          angle: angularBlend(baseAngle, towardMemory, weight),
          mode: MODE.REMEMBER,
          neighborCount: 0,
          sociality,
          memoryActive: true,
          memoryAge: stableYears(state.year - memory.observedYear),
          groupId: null,
          groupMemberCount: 0,
          groupCenterDistance: 0,
          groupCohesionActive: false,
          separationActive: false,
          separationNeighbors: 0,
        };
      }
      delete animal.observationMemory.socialCenter;
    }

    return {
      angle: baseAngle,
      mode: sociality >= 0.58 ? MODE.ALONE : MODE.ROAM,
      neighborCount: 0,
      sociality,
      memoryActive: false,
      memoryAge: 0,
      groupId: null,
      groupMemberCount: 0,
      groupCenterDistance: 0,
      groupCohesionActive: false,
      separationActive: false,
      separationNeighbors: 0,
    };
  }

  LG.wander = (animal, speed, dt) => {
    const curiosity = normalizeTrait(animal.traits?.curiosity);
    animal.wanderTimer -= dt;
    if (animal.wanderTimer <= 0) {
      const turnRange = 0.42 + curiosity * 1.18;
      animal.angle += LG.randomBetween(-turnRange, turnRange);
      animal.wanderTimer = LG.randomBetween(
        0.055 - curiosity * 0.025,
        0.22 - curiosity * 0.075,
      );
    }

    const decision = socialDirection(animal, animal.angle);
    animal.activeBehavior = {
      mode: decision.mode,
      neighborCount: decision.neighborCount,
      sociality: decision.sociality,
      curiosity,
      memoryActive: decision.memoryActive,
      memoryAge: decision.memoryAge,
      groupId: decision.groupId,
      groupMemberCount: decision.groupMemberCount,
      groupCenterDistance: decision.groupCenterDistance,
      groupCohesionActive: decision.groupCohesionActive,
      separationActive: decision.separationActive,
      separationNeighbors: decision.separationNeighbors,
      year: state.year,
    };
    LG.moveAnimal(animal, decision.angle, speed, dt);
  };

  LG.getActiveTraitDiagnostics = () => {
    const animals = [...state.grazers, ...state.hunters];
    const modes = {
      [MODE.GROUP]: 0,
      [MODE.COHERE]: 0,
      [MODE.AVOID]: 0,
      [MODE.REMEMBER]: 0,
      [MODE.ROAM]: 0,
      [MODE.ALONE]: 0,
      inactive: 0,
    };
    let socialityTotal = 0;
    let activeCount = 0;
    let rememberedCount = 0;
    let memoryAgeTotal = 0;
    let groupCohesionCount = 0;
    let separationCount = 0;
    let groupCenterDistanceTotal = 0;

    for (const animal of animals) {
      const sociality = normalizeTrait(animal.traits?.sociality) * 100;
      socialityTotal += sociality;
      const mode = animal.activeBehavior?.mode;
      if (mode && Object.prototype.hasOwnProperty.call(modes, mode)) {
        modes[mode] += 1;
        activeCount += 1;
      } else {
        modes.inactive += 1;
      }
      if (animal.activeBehavior?.memoryActive) {
        rememberedCount += 1;
        memoryAgeTotal += animal.activeBehavior.memoryAge || 0;
      }
      if (animal.activeBehavior?.groupCohesionActive) {
        groupCohesionCount += 1;
        groupCenterDistanceTotal += animal.activeBehavior.groupCenterDistance || 0;
      }
      if (animal.activeBehavior?.separationActive) separationCount += 1;
    }

    return {
      version: "active-sociality-memory-v2",
      trait: "sociality",
      memoryTrait: "memorySpan",
      population: animals.length,
      activeCount,
      rememberedCount,
      groupCohesionCount,
      separationCount,
      averageGroupCenterDistance: groupCohesionCount
        ? groupCenterDistanceTotal / groupCohesionCount
        : null,
      averageMemoryAge: rememberedCount ? stableYears(memoryAgeTotal / rememberedCount) : 0,
      averageSociality: animals.length ? socialityTotal / animals.length : 0,
      modes,
    };
  };

  LG.activeTraitModel = Object.freeze({
    version: "active-sociality-memory-v2",
    trait: "sociality",
    memoryTrait: "memorySpan",
    affects: "idle-roaming-direction",
    groupedBehavior: MODE.GROUP,
    highTraitBehavior: MODE.COHERE,
    lowTraitBehavior: MODE.AVOID,
    recalledBehavior: MODE.REMEMBER,
    emergencyStatesOverrideCohesion: true,
    groupCohesionOnlyDuringWander: true,
  });

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__activeTraitsWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({
        ...baseSnapshot(),
        activeTraits: LG.getActiveTraitDiagnostics(),
      });
      wrapped.__activeTraitsWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
