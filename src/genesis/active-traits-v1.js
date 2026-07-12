(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Active traits require LittleGod core");
  if (typeof LG.moveAnimal !== "function" || !LG.state) {
    throw new Error("Active traits require simulation.js");
  }

  const { state } = LG;
  const MODE = Object.freeze({
    COHERE: "cohere",
    AVOID: "avoid",
    ROAM: "roam",
    ALONE: "alone",
  });

  function normalizeTrait(value, fallback = 50) {
    return LG.clamp(Number.isFinite(value) ? value : fallback, 0, 100) / 100;
  }

  function angularBlend(from, to, weight) {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * LG.clamp(weight, 0, 1);
  }

  function conspecificsWithin(animal, radius) {
    const population = animal.type === "hunter" ? state.hunters : state.grazers;
    const radiusSquared = radius * radius;
    return population.filter((candidate) => (
      candidate !== animal
      && LG.distanceSquared(animal, candidate) <= radiusSquared
    ));
  }

  function socialDirection(animal, baseAngle) {
    const sociality = normalizeTrait(animal.traits?.sociality);
    const senseRadius = animal.derived?.senseRadius || 180;
    const neighbors = conspecificsWithin(animal, Math.max(70, senseRadius * 0.58));

    if (!neighbors.length) {
      return {
        angle: baseAngle,
        mode: sociality >= 0.58 ? MODE.ALONE : MODE.ROAM,
        neighborCount: 0,
        sociality,
      };
    }

    const center = neighbors.reduce((total, candidate) => ({
      x: total.x + candidate.x,
      y: total.y + candidate.y,
    }), { x: 0, y: 0 });
    center.x /= neighbors.length;
    center.y /= neighbors.length;

    const toward = Math.atan2(center.y - animal.y, center.x - animal.x);
    if (sociality >= 0.58) {
      const weight = 0.16 + (sociality - 0.58) * 0.92;
      return {
        angle: angularBlend(baseAngle, toward, weight),
        mode: MODE.COHERE,
        neighborCount: neighbors.length,
        sociality,
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
      };
    }

    return {
      angle: baseAngle,
      mode: MODE.ROAM,
      neighborCount: neighbors.length,
      sociality,
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
      year: state.year,
    };
    LG.moveAnimal(animal, decision.angle, speed, dt);
  };

  LG.getActiveTraitDiagnostics = () => {
    const animals = [...state.grazers, ...state.hunters];
    const modes = {
      [MODE.COHERE]: 0,
      [MODE.AVOID]: 0,
      [MODE.ROAM]: 0,
      [MODE.ALONE]: 0,
      inactive: 0,
    };
    let socialityTotal = 0;
    let activeCount = 0;

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
    }

    return {
      version: "active-sociality-v1",
      trait: "sociality",
      population: animals.length,
      activeCount,
      averageSociality: animals.length ? socialityTotal / animals.length : 0,
      modes,
    };
  };

  LG.activeTraitModel = Object.freeze({
    version: "active-sociality-v1",
    trait: "sociality",
    affects: "idle-roaming-direction",
    highTraitBehavior: MODE.COHERE,
    lowTraitBehavior: MODE.AVOID,
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
