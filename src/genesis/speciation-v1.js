(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Ecotype differentiation requires LittleGod core");
  if (typeof LG.createAnimal !== "function" || typeof LG.chooseLocalMate !== "function") {
    throw new Error("Ecotype differentiation requires attributes and kinship models");
  }

  const SELECTIVITY_THRESHOLD = 55;
  const ECOTYPES = Object.freeze({
    grazer: Object.freeze({
      mobile: Object.freeze({ id: "courser", label: "疾行型" }),
      robust: Object.freeze({ id: "bulwark", label: "厚甲型" }),
      balanced: Object.freeze({ id: "meadow", label: "草原型" }),
      divergenceThreshold: 0.14,
    }),
    hunter: Object.freeze({
      mobile: Object.freeze({ id: "pursuer", label: "追猎型" }),
      robust: Object.freeze({ id: "ambusher", label: "伏击型" }),
      balanced: Object.freeze({ id: "stalker", label: "潜猎型" }),
      divergenceThreshold: 0.12,
    }),
  });

  let evaluatedChoices = 0;
  let sameEcotypeChoices = 0;
  let crossEcotypeChoices = 0;
  let assortativePools = 0;
  let compatibilityFallbacks = 0;

  function normalizedTrait(animal, key) {
    const definition = LG.ATTRIBUTE_SCHEMA?.[animal.type]?.[key];
    const value = Number(animal.traits?.[key]);
    if (!definition || !Number.isFinite(value)) return 0.5;
    return LG.clamp((value - definition.min) / Math.max(1e-6, definition.max - definition.min), 0, 1);
  }

  function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  }

  function ecotypeAxes(animal) {
    if (animal.type === "hunter") {
      return {
        mobile: average([
          normalizedTrait(animal, "agility"),
          normalizedTrait(animal, "endurance"),
          normalizedTrait(animal, "visionRange"),
        ]),
        robust: average([
          normalizedTrait(animal, "musclePower"),
          normalizedTrait(animal, "armor"),
          normalizedTrait(animal, "caution"),
          normalizedTrait(animal, "scentRange"),
        ]),
      };
    }
    return {
      mobile: average([
        normalizedTrait(animal, "agility"),
        normalizedTrait(animal, "endurance"),
        normalizedTrait(animal, "metabolicEfficiency"),
      ]),
      robust: average([
        normalizedTrait(animal, "bodyMass"),
        normalizedTrait(animal, "musclePower"),
        normalizedTrait(animal, "armor"),
        normalizedTrait(animal, "coldTolerance"),
      ]),
    };
  }

  function classifyEcotype(animal) {
    if (!animal || !ECOTYPES[animal.type]) return null;
    const config = ECOTYPES[animal.type];
    const axes = ecotypeAxes(animal);
    const divergence = axes.mobile - axes.robust;
    const profile = divergence >= config.divergenceThreshold
      ? config.mobile
      : divergence <= -config.divergenceThreshold
        ? config.robust
        : config.balanced;
    const result = {
      version: "ecotype-differentiation-v1",
      id: profile.id,
      label: profile.label,
      mobileAxis: axes.mobile,
      robustAxis: axes.robust,
      divergence,
      specialized: profile !== config.balanced,
    };
    animal.ecotype = result;
    return result;
  }

  function refreshEcotypes() {
    const animals = [...(LG.state?.grazers || []), ...(LG.state?.hunters || [])];
    for (const animal of animals) classifyEcotype(animal);
    return animals;
  }

  LG.classifyEcotype = classifyEcotype;
  LG.refreshEcotypes = refreshEcotypes;

  const baseCreateAnimal = LG.createAnimal;
  LG.createAnimal = (...args) => {
    const animal = baseCreateAnimal(...args);
    if (animal) classifyEcotype(animal);
    return animal;
  };

  for (const animal of [...(LG.state?.grazers || []), ...(LG.state?.hunters || [])]) {
    classifyEcotype(animal);
  }

  const baseChooseLocalMate = LG.chooseLocalMate;
  LG.chooseLocalMate = (observer, candidates) => {
    const available = Array.isArray(candidates) ? candidates : [];
    if (!available.length) return null;

    const observerEcotype = classifyEcotype(observer);
    const same = [];
    const different = [];
    for (const candidate of available) {
      const candidateEcotype = classifyEcotype(candidate);
      if (candidateEcotype?.id === observerEcotype?.id) same.push(candidate);
      else different.push(candidate);
    }

    const selectivity = Number(observer.traits?.mateSelectivity) || 0;
    const viableSame = typeof LG.isCloseKin === "function"
      ? same.filter((candidate) => !LG.isCloseKin(observer, candidate))
      : same;
    const shouldAssort = selectivity >= SELECTIVITY_THRESHOLD && viableSame.length > 0;
    const pool = shouldAssort ? same : available;
    if (shouldAssort && different.length) assortativePools += 1;
    if (selectivity >= SELECTIVITY_THRESHOLD && same.length > 0 && viableSame.length === 0 && different.length) {
      compatibilityFallbacks += 1;
    }

    const selected = baseChooseLocalMate(observer, pool);
    if (!selected) return null;

    evaluatedChoices += 1;
    const selectedEcotype = classifyEcotype(selected);
    const sameEcotype = selectedEcotype?.id === observerEcotype?.id;
    if (sameEcotype) sameEcotypeChoices += 1;
    else crossEcotypeChoices += 1;
    observer.ecotypeChoice = {
      observerEcotype: observerEcotype?.id || null,
      selectedMateId: selected.id,
      selectedEcotype: selectedEcotype?.id || null,
      sameEcotype,
      assortativePool: shouldAssort,
      candidateEcotypes: [...new Set(available.map((candidate) => classifyEcotype(candidate)?.id).filter(Boolean))],
      year: LG.state?.year ?? 0,
    };
    return selected;
  };

  LG.getSpeciationDiagnostics = () => {
    const animals = refreshEcotypes();
    const populations = { grazer: {}, hunter: {} };
    let specialized = 0;
    let divergenceTotal = 0;
    for (const animal of animals) {
      const ecotype = animal.ecotype;
      if (!ecotype) continue;
      populations[animal.type][ecotype.id] = (populations[animal.type][ecotype.id] || 0) + 1;
      if (ecotype.specialized) specialized += 1;
      divergenceTotal += Math.abs(ecotype.divergence);
    }
    return {
      version: "ecotype-differentiation-v1",
      population: animals.length,
      populations,
      specialized,
      specializedShare: animals.length ? specialized / animals.length : 0,
      averageAbsoluteDivergence: animals.length ? divergenceTotal / animals.length : 0,
      evaluatedChoices,
      sameEcotypeChoices,
      crossEcotypeChoices,
      assortativePools,
      compatibilityFallbacks,
    };
  };

  const baseSeedWorld = LG.seedWorld;
  if (typeof baseSeedWorld === "function") {
    LG.seedWorld = (...args) => {
      evaluatedChoices = 0;
      sameEcotypeChoices = 0;
      crossEcotypeChoices = 0;
      assortativePools = 0;
      compatibilityFallbacks = 0;
      return baseSeedWorld.apply(LG, args);
    };
  }

  LG.speciationModel = Object.freeze({
    version: "ecotype-differentiation-v1",
    mechanism: "heritable-trait-assortative-mating",
    selectivityThreshold: SELECTIVITY_THRESHOLD,
    preservesCrossEcotypeFallback: true,
    ecotypes: ECOTYPES,
  });

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__speciationWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({
        ...baseSnapshot(),
        speciation: LG.getSpeciationDiagnostics(),
      });
      wrapped.__speciationWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
