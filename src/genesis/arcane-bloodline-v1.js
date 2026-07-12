(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Arcane bloodlines require LittleGod core");
  if (typeof LG.createAnimal !== "function" || !LG.state) {
    throw new Error("Arcane bloodlines require attributes.js");
  }

  const LOCUS_COUNT = 4;
  const FOUNDER_ALLELE_RATE = 0.06;
  const MUTATION_RATE = 0.004;
  const STATUS = Object.freeze({
    DORMANT: "dormant",
    CARRIER: "carrier",
    AWAKENED: "awakened",
    EXALTED: "exalted",
  });

  let created = 0;
  let inherited = 0;
  let awakenings = 0;
  let mutations = 0;

  function emptyMarkers() {
    return Array.from({ length: LOCUS_COUNT }, () => [0, 0]);
  }

  function normalizeMarkers(markers) {
    if (!Array.isArray(markers) || markers.length !== LOCUS_COUNT) return emptyMarkers();
    return markers.map((locus) => [
      locus?.[0] ? 1 : 0,
      locus?.[1] ? 1 : 0,
    ]);
  }

  function founderMarkers() {
    return Array.from({ length: LOCUS_COUNT }, () => [
      Math.random() < FOUNDER_ALLELE_RATE ? 1 : 0,
      Math.random() < FOUNDER_ALLELE_RATE ? 1 : 0,
    ]);
  }

  function parentMarkers(parent) {
    return normalizeMarkers(parent?.genome?.bloodlines?.aether?.markers);
  }

  function inheritedMarkers(mother, father) {
    const maternal = parentMarkers(mother);
    const paternal = parentMarkers(father);
    return Array.from({ length: LOCUS_COUNT }, (_, index) => {
      let maternalAllele = maternal[index][Math.random() < 0.5 ? 0 : 1];
      let paternalAllele = paternal[index][Math.random() < 0.5 ? 0 : 1];
      if (Math.random() < MUTATION_RATE) {
        maternalAllele = maternalAllele ? 0 : 1;
        mutations += 1;
      }
      if (Math.random() < MUTATION_RATE) {
        paternalAllele = paternalAllele ? 0 : 1;
        mutations += 1;
      }
      return [maternalAllele, paternalAllele];
    });
  }

  function describe(markers) {
    const alleleCount = markers.flat().reduce((sum, value) => sum + value, 0);
    const purity = alleleCount / (LOCUS_COUNT * 2);
    const status = alleleCount >= 5
      ? STATUS.EXALTED
      : alleleCount >= 2
        ? STATUS.AWAKENED
        : alleleCount === 1
          ? STATUS.CARRIER
          : STATUS.DORMANT;
    return { alleleCount, purity, status };
  }

  function applyBloodline(animal, markers, source) {
    const normalized = normalizeMarkers(markers);
    const description = describe(normalized);
    animal.genome = animal.genome || { bloodlines: {} };
    animal.genome.bloodlines = animal.genome.bloodlines || {};
    animal.genome.bloodlines.aether = {
      markers: normalized,
      alleleCount: description.alleleCount,
      purity: description.purity,
      status: description.status,
      source,
    };

    const active = description.status === STATUS.AWAKENED || description.status === STATUS.EXALTED;
    const capacityBonus = active ? description.alleleCount * 0.8 : 0;
    const stabilityBonus = active ? description.alleleCount * 0.55 : 0;
    const combatMultiplier = active ? 1 + description.purity * 0.08 : 1;
    const energyMultiplier = active ? 1 + description.purity * 0.05 : 1;

    if (animal.traits) {
      animal.traits.arcaneCapacity = LG.clamp(
        (animal.traits.arcaneCapacity || 0) + capacityBonus,
        0,
        100,
      );
      animal.traits.arcaneStability = LG.clamp(
        (animal.traits.arcaneStability || 0) + stabilityBonus,
        0,
        100,
      );
    }
    if (animal.derived) {
      animal.derived.combatBase = LG.clamp(
        (animal.derived.combatBase || 0) * combatMultiplier,
        1,
        100,
      );
      animal.derived.maxEnergy = (animal.derived.maxEnergy || 0) * energyMultiplier;
      animal.energy = Math.min(animal.energy, animal.derived.maxEnergy);
    }
    animal.arcaneEnergy = animal.traits?.arcaneCapacity || animal.arcaneEnergy || 0;
    animal.arcaneBloodline = {
      name: "aether",
      status: description.status,
      alleleCount: description.alleleCount,
      purity: description.purity,
      active,
      modifiers: {
        capacityBonus,
        stabilityBonus,
        combatMultiplier,
        energyMultiplier,
      },
    };

    created += 1;
    if (source === "inherited") inherited += 1;
    if (active) awakenings += 1;
    return animal;
  }

  const baseCreateAnimal = LG.createAnimal;
  LG.createAnimal = (type, x, y, options = {}) => {
    const animal = baseCreateAnimal(type, x, y, options);
    if (!animal) return null;

    const parents = Array.isArray(options.parents) ? options.parents.filter(Boolean) : [];
    const hasParents = parents.length === 2;
    const existing = animal.genome?.bloodlines?.aether?.markers;
    const markers = existing
      ? normalizeMarkers(existing)
      : hasParents
        ? inheritedMarkers(parents[0], parents[1])
        : founderMarkers();
    return applyBloodline(animal, markers, hasParents ? "inherited" : "founder");
  };

  LG.getArcaneBloodlineDiagnostics = () => {
    const animals = [...LG.state.grazers, ...LG.state.hunters];
    const statuses = {
      [STATUS.DORMANT]: 0,
      [STATUS.CARRIER]: 0,
      [STATUS.AWAKENED]: 0,
      [STATUS.EXALTED]: 0,
    };
    let purityTotal = 0;
    let maxAlleles = 0;

    for (const animal of animals) {
      const bloodline = animal.arcaneBloodline;
      if (!bloodline) continue;
      statuses[bloodline.status] += 1;
      purityTotal += bloodline.purity;
      maxAlleles = Math.max(maxAlleles, bloodline.alleleCount);
    }

    return {
      version: "aether-bloodline-v1",
      population: animals.length,
      represented: Object.values(statuses).reduce((sum, value) => sum + value, 0),
      statuses,
      averagePurity: animals.length ? purityTotal / animals.length : 0,
      maxAlleles,
      created,
      inherited,
      awakenings,
      mutations,
    };
  };

  const baseSeedWorld = LG.seedWorld;
  if (typeof baseSeedWorld === "function") {
    LG.seedWorld = (...args) => {
      created = 0;
      inherited = 0;
      awakenings = 0;
      mutations = 0;
      return baseSeedWorld.apply(LG, args);
    };
  }

  LG.arcaneBloodlineModel = Object.freeze({
    version: "aether-bloodline-v1",
    locusCount: LOCUS_COUNT,
    founderAlleleRate: FOUNDER_ALLELE_RATE,
    mutationRate: MUTATION_RATE,
    activeThreshold: 2,
    exaltedThreshold: 5,
    affects: Object.freeze([
      "arcaneCapacity",
      "arcaneStability",
      "combatBase",
      "maxEnergy",
    ]),
  });

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__arcaneBloodlineWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({
        ...baseSnapshot(),
        arcaneBloodline: LG.getArcaneBloodlineDiagnostics(),
      });
      wrapped.__arcaneBloodlineWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
