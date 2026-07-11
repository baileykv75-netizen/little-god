(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Genesis attributes requires core.js");

  const LOCUS_COUNT = 4;
  const MUTATION_RATE = 0.018;

  const trait = (category, label, unit, mean, sd, min, max, heritability, factors = {}) => ({
    category,
    label,
    unit,
    mean,
    sd,
    min,
    max,
    heritability,
    factors,
  });

  LG.ATTRIBUTE_CATEGORIES = Object.freeze({
    morphology: "形态与结构",
    physiology: "生理与代谢",
    sensory: "感知与认知",
    behavior: "行为与性格",
    arcane: "超凡潜能",
  });

  LG.ATTRIBUTE_SCHEMA = Object.freeze({
    grazer: Object.freeze({
      bodyMass: trait("morphology", "体重", "kg", 45, 7, 26, 72, 0.72, { size: 0.82, vigor: 0.18 }),
      musclePower: trait("morphology", "肌力", "", 52, 8, 25, 82, 0.68, { size: 0.35, athletic: 0.65 }),
      armor: trait("morphology", "体表防护", "", 28, 6, 10, 55, 0.64, { size: 0.38, vigor: 0.26 }),
      agility: trait("morphology", "灵活性", "", 68, 8, 35, 92, 0.66, { athletic: 0.78, size: -0.24 }),
      endurance: trait("physiology", "耐力", "", 66, 8, 35, 92, 0.62, { athletic: 0.48, vigor: 0.55 }),
      metabolicEfficiency: trait("physiology", "代谢效率", "", 62, 7, 35, 88, 0.58, { vigor: 0.66, size: -0.14 }),
      coldTolerance: trait("physiology", "抗寒", "", 48, 8, 20, 82, 0.61, { vigor: 0.38 }),
      lifespan: trait("physiology", "寿命潜力", "年", 12.5, 1.3, 8, 18, 0.55, { vigor: 0.48, fertility: -0.25 }),
      fertility: trait("physiology", "繁殖潜力", "", 62, 8, 28, 90, 0.46, { fertility: 0.78, vigor: 0.18 }),
      visionRange: trait("sensory", "视觉距离", "px", 230, 25, 135, 330, 0.58, { sensory: 0.78 }),
      hearingRange: trait("sensory", "听觉距离", "px", 185, 22, 110, 285, 0.56, { sensory: 0.68 }),
      scentRange: trait("sensory", "嗅觉距离", "px", 145, 20, 75, 245, 0.54, { sensory: 0.52 }),
      perceptionAccuracy: trait("sensory", "判断精度", "", 62, 7, 30, 88, 0.52, { sensory: 0.62, caution: 0.18 }),
      memorySpan: trait("sensory", "记忆跨度", "年", 1.8, 0.4, 0.5, 3.8, 0.48, { sensory: 0.42, curiosity: 0.2 }),
      sociality: trait("behavior", "社会性", "", 58, 16, 4, 96, 0.56, { social: 0.88 }),
      aggression: trait("behavior", "攻击性", "", 25, 8, 3, 62, 0.48, { aggression: 0.72, caution: -0.22 }),
      caution: trait("behavior", "谨慎", "", 68, 10, 25, 96, 0.44, { caution: 0.78, aggression: -0.18 }),
      curiosity: trait("behavior", "好奇", "", 48, 10, 12, 88, 0.42, { curiosity: 0.78, caution: -0.12 }),
      mateSelectivity: trait("behavior", "择偶选择性", "", 55, 10, 15, 90, 0.48, { social: 0.24, caution: 0.22 }),
      arcaneCapacity: trait("arcane", "灵能容量", "", 50, 8, 18, 82, 0.72, { arcane: 0.82, vigor: 0.12 }),
      arcaneStability: trait("arcane", "灵能稳定", "", 58, 7, 25, 88, 0.68, { arcane: 0.62, sensory: 0.18 }),
    }),
    hunter: Object.freeze({
      bodyMass: trait("morphology", "体重", "kg", 70, 10, 38, 112, 0.72, { size: 0.84, vigor: 0.16 }),
      musclePower: trait("morphology", "肌力", "", 72, 8, 38, 96, 0.68, { size: 0.42, athletic: 0.62 }),
      armor: trait("morphology", "体表防护", "", 38, 7, 15, 70, 0.64, { size: 0.36, vigor: 0.3 }),
      agility: trait("morphology", "灵活性", "", 62, 8, 30, 90, 0.66, { athletic: 0.78, size: -0.2 }),
      endurance: trait("physiology", "耐力", "", 70, 8, 38, 94, 0.62, { athletic: 0.42, vigor: 0.62 }),
      metabolicEfficiency: trait("physiology", "代谢效率", "", 54, 7, 28, 82, 0.58, { vigor: 0.62, size: -0.18 }),
      coldTolerance: trait("physiology", "抗寒", "", 55, 8, 25, 86, 0.61, { vigor: 0.42 }),
      lifespan: trait("physiology", "寿命潜力", "年", 17, 1.8, 11, 24, 0.55, { vigor: 0.5, fertility: -0.24 }),
      fertility: trait("physiology", "繁殖潜力", "", 45, 7, 18, 72, 0.46, { fertility: 0.78, vigor: 0.16 }),
      visionRange: trait("sensory", "视觉距离", "px", 255, 28, 150, 365, 0.58, { sensory: 0.74 }),
      hearingRange: trait("sensory", "听觉距离", "px", 220, 25, 130, 325, 0.56, { sensory: 0.68 }),
      scentRange: trait("sensory", "嗅觉距离", "px", 270, 30, 155, 390, 0.54, { sensory: 0.8 }),
      perceptionAccuracy: trait("sensory", "判断精度", "", 72, 7, 38, 94, 0.52, { sensory: 0.68, caution: 0.14 }),
      memorySpan: trait("sensory", "记忆跨度", "年", 2.8, 0.5, 0.8, 5, 0.48, { sensory: 0.46, curiosity: 0.2 }),
      sociality: trait("behavior", "社会性", "", 45, 18, 2, 98, 0.56, { social: 0.9 }),
      aggression: trait("behavior", "攻击性", "", 70, 10, 28, 98, 0.48, { aggression: 0.78, caution: -0.16 }),
      caution: trait("behavior", "谨慎", "", 52, 10, 14, 90, 0.44, { caution: 0.76, aggression: -0.16 }),
      curiosity: trait("behavior", "好奇", "", 55, 10, 16, 92, 0.42, { curiosity: 0.8, caution: -0.1 }),
      mateSelectivity: trait("behavior", "择偶选择性", "", 65, 10, 20, 96, 0.48, { social: 0.2, aggression: 0.2, caution: 0.16 }),
      arcaneCapacity: trait("arcane", "灵能容量", "", 55, 8, 20, 88, 0.72, { arcane: 0.84, vigor: 0.1 }),
      arcaneStability: trait("arcane", "灵能稳定", "", 60, 7, 26, 90, 0.68, { arcane: 0.64, sensory: 0.16 }),
    }),
  });

  function normalRandom() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  LG.normalRandom = normalRandom;

  function factorSet() {
    return {
      size: normalRandom(),
      athletic: normalRandom(),
      vigor: normalRandom(),
      sensory: normalRandom(),
      social: normalRandom(),
      aggression: normalRandom(),
      caution: normalRandom(),
      curiosity: normalRandom(),
      fertility: normalRandom(),
      arcane: normalRandom(),
    };
  }

  function correlatedZ(definition, factors) {
    let total = 0;
    let squaredWeight = 0;
    for (const [key, weight] of Object.entries(definition.factors)) {
      total += factors[key] * weight;
      squaredWeight += weight * weight;
    }
    const residualWeight = Math.sqrt(Math.max(0.08, 1 - Math.min(0.92, squaredWeight)));
    return total + normalRandom() * residualWeight;
  }

  function makeFounderLoci(definition, z) {
    const geneticSd = definition.sd * Math.sqrt(definition.heritability);
    const desiredEffect = geneticSd * z;
    const effects = Array.from({ length: LOCUS_COUNT * 2 }, () => normalRandom() * geneticSd * 0.09);
    const correction = (desiredEffect - effects.reduce((sum, value) => sum + value, 0)) / effects.length;
    return Array.from({ length: LOCUS_COUNT }, (_, index) => [
      effects[index * 2] + correction,
      effects[index * 2 + 1] + correction,
    ]);
  }

  function geneticValue(definition, loci) {
    return definition.mean + loci.flat().reduce((sum, effect) => sum + effect, 0);
  }

  function founderGenome(type) {
    const schema = LG.ATTRIBUTE_SCHEMA[type];
    const factors = factorSet();
    const traits = {};
    const developmentNoise = {};
    for (const [key, definition] of Object.entries(schema)) {
      const z = correlatedZ(definition, factors);
      traits[key] = makeFounderLoci(definition, z);
      const environmentalSd = definition.sd * Math.sqrt(1 - definition.heritability);
      developmentNoise[key] = normalRandom() * environmentalSd;
    }
    return {
      version: 1,
      traits,
      developmentNoise,
      ancestry: { primordial: 1 },
      bloodlines: {
        primordial: {
          markers: Array.from({ length: LOCUS_COUNT }, () => [1, 1]),
          purity: 1,
        },
      },
      mutationCount: 0,
    };
  }

  function inheritGenome(type, mother, father) {
    const schema = LG.ATTRIBUTE_SCHEMA[type];
    const traits = {};
    const developmentNoise = {};
    let mutationCount = 0;

    for (const [key, definition] of Object.entries(schema)) {
      const motherLoci = mother.genome.traits[key];
      const fatherLoci = father.genome.traits[key];
      traits[key] = [];
      for (let locusIndex = 0; locusIndex < LOCUS_COUNT; locusIndex += 1) {
        let maternalAllele = motherLoci[locusIndex][Math.random() < 0.5 ? 0 : 1];
        let paternalAllele = fatherLoci[locusIndex][Math.random() < 0.5 ? 0 : 1];
        if (Math.random() < MUTATION_RATE) {
          maternalAllele += normalRandom() * definition.sd * 0.07;
          mutationCount += 1;
        }
        if (Math.random() < MUTATION_RATE) {
          paternalAllele += normalRandom() * definition.sd * 0.07;
          mutationCount += 1;
        }
        traits[key].push([maternalAllele, paternalAllele]);
      }
      const environmentalSd = definition.sd * Math.sqrt(1 - definition.heritability);
      developmentNoise[key] = normalRandom() * environmentalSd;
    }

    const ancestryKeys = new Set([
      ...Object.keys(mother.genome.ancestry || {}),
      ...Object.keys(father.genome.ancestry || {}),
    ]);
    const ancestry = {};
    for (const key of ancestryKeys) {
      ancestry[key] = ((mother.genome.ancestry?.[key] || 0) + (father.genome.ancestry?.[key] || 0)) / 2;
    }

    const primordialMarkers = mother.genome.bloodlines.primordial.markers.map((locus, index) => [
      locus[Math.random() < 0.5 ? 0 : 1],
      father.genome.bloodlines.primordial.markers[index][Math.random() < 0.5 ? 0 : 1],
    ]);
    const primordialPurity = primordialMarkers.flat().reduce((sum, value) => sum + value, 0) / (LOCUS_COUNT * 2);

    return {
      version: 1,
      traits,
      developmentNoise,
      ancestry,
      bloodlines: {
        primordial: {
          markers: primordialMarkers,
          purity: primordialPurity,
        },
      },
      mutationCount: (mother.genome.mutationCount || 0) + (father.genome.mutationCount || 0) + mutationCount,
    };
  }

  function derivePhenotype(type, genome) {
    const schema = LG.ATTRIBUTE_SCHEMA[type];
    const phenotype = {};
    const breedingValues = {};
    for (const [key, definition] of Object.entries(schema)) {
      const inherited = geneticValue(definition, genome.traits[key]);
      breedingValues[key] = LG.clamp(inherited, definition.min, definition.max);
      phenotype[key] = LG.clamp(inherited + genome.developmentNoise[key], definition.min, definition.max);
    }
    return { phenotype, breedingValues };
  }

  function deriveOperationalStats(type, phenotype) {
    const config = LG.SPECIES[type];
    const schema = LG.ATTRIBUTE_SCHEMA[type];
    const massRatio = phenotype.bodyMass / schema.bodyMass.mean;
    const agilityRatio = phenotype.agility / schema.agility.mean;
    const enduranceRatio = phenotype.endurance / schema.endurance.mean;
    const metabolismRatio = phenotype.metabolicEfficiency / schema.metabolicEfficiency.mean;
    const fertilityRatio = phenotype.fertility / schema.fertility.mean;

    const walkSpeed = config.walkSpeed * LG.clamp(0.52 + agilityRatio * 0.62 - (massRatio - 1) * 0.16, 0.72, 1.28);
    const burstBase = type === "grazer" ? config.sprintSpeed : config.chaseSpeed;
    const burstSpeed = burstBase * LG.clamp(0.42 + agilityRatio * 0.42 + enduranceRatio * 0.2 - (massRatio - 1) * 0.12, 0.72, 1.3);
    const maxEnergy = config.maxEnergy * LG.clamp(Math.pow(massRatio, 0.34) * (0.6 + metabolismRatio * 0.4), 0.72, 1.35);
    const baseDrain = config.baseDrain * LG.clamp(Math.pow(massRatio, 0.72) / Math.max(0.55, metabolismRatio), 0.7, 1.45);
    const staminaMax = config.staminaMax * LG.clamp(0.45 + enduranceRatio * 0.55, 0.72, 1.32);
    const staminaRecovery = config.staminaRecovery * LG.clamp(0.4 + enduranceRatio * 0.36 + metabolismRatio * 0.24, 0.7, 1.35);
    const senseRadius = phenotype.visionRange * 0.44 + phenotype.hearingRange * 0.22 + phenotype.scentRange * 0.34;
    const mateRange = LG.clamp(senseRadius * (0.72 + phenotype.sociality / 250), 120, 360);

    const rawCombat = (
      phenotype.musclePower * 0.23
      + phenotype.agility * 0.17
      + phenotype.endurance * 0.15
      + phenotype.armor * 0.1
      + phenotype.perceptionAccuracy * 0.1
      + phenotype.aggression * 0.08
      + phenotype.arcaneCapacity * 0.07
      + LG.clamp(phenotype.bodyMass / schema.bodyMass.mean * 55, 25, 85) * 0.1
    );

    return {
      walkSpeed,
      burstSpeed,
      maxEnergy,
      baseDrain,
      staminaMax,
      staminaRecovery,
      lifespan: phenotype.lifespan,
      fertilityMultiplier: LG.clamp(fertilityRatio, 0.55, 1.55),
      senseRadius,
      threatRadius: LG.clamp(senseRadius * (0.42 + phenotype.caution / 260), 85, 185),
      mateRange,
      combatBase: LG.clamp(rawCombat, 1, 100),
    };
  }

  function decorateAnimal(animal, options = {}) {
    const parents = options.parents || [];
    const hasParents = parents.length === 2 && parents.every((parent) => parent?.genome);
    animal.genome = options.genome || (hasParents
      ? inheritGenome(animal.type, parents.find((parent) => parent.sex === "female") || parents[0], parents.find((parent) => parent.sex === "male") || parents[1])
      : founderGenome(animal.type));
    animal.generation = hasParents
      ? Math.max(...parents.map((parent) => parent.generation || 0)) + 1
      : (options.generation || 0);
    animal.parents = hasParents ? parents.map((parent) => parent.id) : (animal.parents || []);
    animal.lineageId = hasParents ? parents[0].lineageId : (options.lineageId || animal.lineageId);

    const derived = derivePhenotype(animal.type, animal.genome);
    animal.traits = derived.phenotype;
    animal.breedingValues = derived.breedingValues;
    animal.derived = deriveOperationalStats(animal.type, animal.traits);
    animal.lifespan = animal.derived.lifespan;
    animal.energy = LG.clamp(options.energy ?? animal.energy, 0, animal.derived.maxEnergy);
    animal.stamina = LG.clamp(options.stamina ?? animal.stamina, 0, animal.derived.staminaMax);
    animal.arcaneEnergy = animal.traits.arcaneCapacity;
    animal.mateChoiceHistory = [];
    animal.offspringCount = animal.offspringCount || 0;
    animal.lastBirthYear = -Infinity;
    return animal;
  }

  LG.founderGenome = founderGenome;
  LG.inheritGenome = inheritGenome;
  LG.derivePhenotype = derivePhenotype;
  LG.deriveOperationalStats = deriveOperationalStats;

  const baseCreateAnimal = LG.createAnimal;
  LG.createAnimal = (type, x, y, options = {}) => {
    const animal = baseCreateAnimal(type, x, y, options);
    if (!animal) return null;
    return decorateAnimal(animal, options);
  };

  LG.currentCombatPower = (animal) => {
    const energyFactor = LG.clamp(animal.energy / Math.max(1, animal.derived.maxEnergy), 0.25, 1);
    const staminaFactor = LG.clamp(animal.stamina / Math.max(1, animal.derived.staminaMax), 0.25, 1);
    const stage = LG.lifeStage(animal);
    const ageFactor = stage === "juvenile" ? 0.68 : stage === "elder" ? 0.78 : 1;
    return animal.derived.combatBase * (0.5 + energyFactor * 0.28 + staminaFactor * 0.22) * ageFactor;
  };

  LG.observedMateScore = (observer, candidate) => {
    const distance = Math.sqrt(LG.distanceSquared(observer, candidate));
    const accuracy = observer.traits.perceptionAccuracy / 100;
    const distanceNoise = LG.clamp(distance / Math.max(1, observer.derived.mateRange), 0, 1);
    const healthSignal = (
      candidate.energy / candidate.derived.maxEnergy * 45
      + candidate.stamina / candidate.derived.staminaMax * 25
      + candidate.derived.combatBase * 0.3
    );
    const visibleMass = candidate.traits.bodyMass / LG.ATTRIBUTE_SCHEMA[candidate.type].bodyMass.mean * 50;
    const offspringSignal = Math.min(12, candidate.offspringCount * 2.5);
    const noise = normalRandom() * (18 * (1 - accuracy) + 10 * distanceNoise);
    const score = healthSignal * 0.55 + visibleMass * 0.25 + offspringSignal + noise;
    return LG.clamp(score, 0, 100);
  };

  LG.chooseLocalMate = (observer, candidates) => {
    if (!candidates.length) return null;
    const selectivity = observer.traits.mateSelectivity / 100;
    const scored = candidates.map((candidate) => ({
      candidate,
      score: LG.observedMateScore(observer, candidate),
    }));
    const temperature = LG.clamp(22 - selectivity * 15, 5, 20);
    const maxScore = Math.max(...scored.map((item) => item.score));
    const weights = scored.map((item) => Math.exp((item.score - maxScore) / temperature));
    const total = weights.reduce((sum, value) => sum + value, 0);
    let draw = Math.random() * total;
    for (let index = 0; index < scored.length; index += 1) {
      draw -= weights[index];
      if (draw <= 0) return scored[index].candidate;
    }
    return scored.at(-1).candidate;
  };

  LG.populationTraitSummary = (animals, keys = ["bodyMass", "musclePower", "agility", "endurance", "sociality", "perceptionAccuracy"]) => {
    const result = {};
    for (const key of keys) {
      const values = animals.map((animal) => animal.traits?.[key]).filter(Number.isFinite);
      if (!values.length) continue;
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      result[key] = {
        mean,
        sd: Math.sqrt(variance),
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }
    const powers = animals.map((animal) => LG.currentCombatPower(animal));
    if (powers.length) {
      const mean = powers.reduce((sum, value) => sum + value, 0) / powers.length;
      const variance = powers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / powers.length;
      result.combatPower = { mean, sd: Math.sqrt(variance), min: Math.min(...powers), max: Math.max(...powers) };
    }
    return result;
  };

  function formatValue(value, definition) {
    const digits = definition.unit === "年" || definition.unit === "kg" ? 1 : 0;
    return `${value.toFixed(digits)}${definition.unit ? ` ${definition.unit}` : ""}`;
  }

  function findAnimalById(id) {
    return [...LG.state.grazers, ...LG.state.hunters].find((animal) => animal.id === id) || null;
  }

  function nearestAnimal(point, radius = 34) {
    let nearest = null;
    let best = radius * radius;
    for (const animal of [...LG.state.grazers, ...LG.state.hunters]) {
      const distance = (animal.x - point.x) ** 2 + (animal.y - point.y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = animal;
      }
    }
    return nearest;
  }

  function canvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * LG.WORLD.width,
      y: ((event.clientY - rect.top) / rect.height) * LG.WORLD.height,
    };
  }

  function categoryRows(animal, category) {
    const schema = LG.ATTRIBUTE_SCHEMA[animal.type];
    return Object.entries(schema)
      .filter(([, definition]) => definition.category === category)
      .map(([key, definition]) => `<span>${definition.label}<strong>${formatValue(animal.traits[key], definition)}</strong></span>`)
      .join("");
  }

  function renderInspector(panel, marker) {
    const animal = findAnimalById(LG.state.selectedIndividualId);
    if (!animal) {
      LG.state.selectedIndividualId = null;
      marker.hidden = true;
      panel.innerHTML = `<p class="genesis-empty">开启观察模式后点击动物，或直接右键点击动物。</p>`;
      return;
    }

    const collection = animal.type === "grazer" ? LG.state.grazers : LG.state.hunters;
    const summary = LG.populationTraitSummary(collection);
    const sexLabel = animal.sex === "female" ? "雌性" : "雄性";
    const stageLabel = { juvenile: "幼体", adult: "成年", elder: "老年" }[LG.lifeStage(animal)];
    const purity = animal.genome.bloodlines.primordial.purity * 100;

    panel.innerHTML = `
      <div class="genesis-individual-head">
        <div><strong>${LG.SPECIES[animal.type].label} #${animal.id}</strong><small>${sexLabel} · ${stageLabel} · 第${animal.generation}代</small></div>
        <span class="genesis-power">战力 ${LG.currentCombatPower(animal).toFixed(1)}</span>
      </div>
      <div class="genesis-key-grid">
        <span>年龄<strong>${animal.age.toFixed(1)} / ${animal.derived.lifespan.toFixed(1)}年</strong></span>
        <span>感知半径<strong>${animal.derived.senseRadius.toFixed(0)} px</strong></span>
        <span>能量<strong>${animal.energy.toFixed(0)} / ${animal.derived.maxEnergy.toFixed(0)}</strong></span>
        <span>原初血脉<strong>${purity.toFixed(1)}%</strong></span>
      </div>
      ${Object.entries(LG.ATTRIBUTE_CATEGORIES).map(([category, label]) => `
        <details class="genesis-trait-group" ${category === "morphology" || category === "behavior" ? "open" : ""}>
          <summary>${label}</summary>
          <div class="genesis-trait-grid">${categoryRows(animal, category)}</div>
        </details>
      `).join("")}
      <div class="genesis-population-summary">
        <strong>当前种群分布</strong>
        <span>战力 ${summary.combatPower?.mean.toFixed(1) || "—"} ± ${summary.combatPower?.sd.toFixed(1) || "—"}</span>
        <span>体重 ${summary.bodyMass?.mean.toFixed(1) || "—"} ± ${summary.bodyMass?.sd.toFixed(1) || "—"} kg</span>
        <span>社会性 ${summary.sociality?.mean.toFixed(1) || "—"} ± ${summary.sociality?.sd.toFixed(1) || "—"}</span>
      </div>
    `;

    const worldFrame = document.querySelector(".world-frame");
    if (worldFrame) {
      marker.hidden = false;
      marker.style.left = `${animal.x / LG.WORLD.width * 100}%`;
      marker.style.top = `${animal.y / LG.WORLD.height * 100}%`;
    }
  }

  function initializeInspector() {
    const canvas = document.querySelector("#worldCanvas");
    const controls = document.querySelector(".compact-actions");
    const journal = document.querySelector(".journal-panel");
    const worldFrame = document.querySelector(".world-frame");
    const worldHud = document.querySelector(".world-hud.top-left");
    if (!canvas || !controls || !journal || !worldFrame) return;

    const inspectButton = document.createElement("button");
    inspectButton.id = "genesisInspectToggle";
    inspectButton.className = "ghost-button genesis-inspect-button";
    inspectButton.type = "button";
    inspectButton.textContent = "观察个体";
    controls.prepend(inspectButton);

    const missionChecklist = document.querySelector(".mission-checklist");
    if (missionChecklist && !document.querySelector("#missionInherited")) {
      const inheritedItem = document.createElement("li");
      inheritedItem.id = "missionInherited";
      inheritedItem.textContent = "遗传后代 0 / 4";
      missionChecklist.append(inheritedItem);
    }

    const inspectorSection = document.createElement("section");
    inspectorSection.className = "genesis-inspector";
    inspectorSection.innerHTML = `
      <div class="section-heading compact">
        <span class="section-icon" aria-hidden="true">⌖</span>
        <div><p class="eyebrow">GENESIS OBSERVER</p><h2>个体属性与遗传</h2></div>
      </div>
      <div id="genesisInspectorBody"></div>
    `;
    const chronicle = journal.querySelector(".chronicle-section");
    journal.insertBefore(inspectorSection, chronicle || null);
    const inspectorBody = inspectorSection.querySelector("#genesisInspectorBody");

    const marker = document.createElement("div");
    marker.className = "genesis-selection-marker";
    marker.hidden = true;
    worldFrame.append(marker);

    if (worldHud) {
      const seasonDetail = document.createElement("div");
      seasonDetail.className = "genesis-season-detail";
      seasonDetail.innerHTML = `<span id="genesisSeasonPhase">初期</span><i><b id="genesisSeasonProgress"></b></i>`;
      worldHud.append(seasonDetail);
    }

    const rootHud = document.createElement("span");
    rootHud.innerHTML = `根系 <strong id="hudRoots">0</strong>`;
    document.querySelector(".resource-hud")?.append(rootHud);

    inspectButton.addEventListener("click", () => {
      LG.state.inspectMode = !LG.state.inspectMode;
      inspectButton.classList.toggle("is-active", LG.state.inspectMode);
      inspectButton.textContent = LG.state.inspectMode ? "退出观察" : "观察个体";
      LG.showToast?.(LG.state.inspectMode ? "观察模式：点击动物查看个体属性" : "已返回生命投放模式");
    });

    for (const button of document.querySelectorAll(".species-button")) {
      button.addEventListener("click", () => {
        LG.state.inspectMode = false;
        inspectButton.classList.remove("is-active");
        inspectButton.textContent = "观察个体";
      });
    }

    canvas.addEventListener("pointerdown", (event) => {
      if (!LG.state.inspectMode) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const animal = nearestAnimal(canvasPoint(canvas, event));
      LG.state.selectedIndividualId = animal?.id || null;
      if (!animal) LG.showToast?.("观察范围内没有动物");
      renderInspector(inspectorBody, marker);
    }, true);

    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const animal = nearestAnimal(canvasPoint(canvas, event));
      LG.state.selectedIndividualId = animal?.id || null;
      if (!animal) LG.showToast?.("右键位置附近没有动物");
      renderInspector(inspectorBody, marker);
    });

    window.setInterval(() => {
      renderInspector(inspectorBody, marker);
      const phase = ((LG.state.year % 1) + 1) % 1;
      const withinSeason = (phase % 0.25) / 0.25;
      const phaseLabel = withinSeason < 1 / 3 ? "初期" : withinSeason < 2 / 3 ? "中期" : "后期";
      const phaseText = document.querySelector("#genesisSeasonPhase");
      const phaseBar = document.querySelector("#genesisSeasonProgress");
      if (phaseText) phaseText.textContent = phaseLabel;
      if (phaseBar) phaseBar.style.width = `${withinSeason * 100}%`;
      const totals = LG.getResourceTotals();
      const rootValue = document.querySelector("#hudRoots");
      if (rootValue) rootValue.textContent = Math.round(totals.roots);
      const inheritedItem = document.querySelector("#missionInherited");
      if (inheritedItem) {
        const complete = LG.state.lifetime.inheritedBirths >= 4;
        inheritedItem.textContent = `遗传后代 ${LG.state.lifetime.inheritedBirths} / 4`;
        inheritedItem.classList.toggle("is-complete", complete);
        inheritedItem.classList.toggle("is-pending", !complete);
      }
      const criteria = LG.missionCriteria?.();
      if (criteria) {
        const values = Object.values(criteria);
        const progress = values.filter(Boolean).length / values.length * 100;
        const progressBar = document.querySelector("#missionProgress");
        if (progressBar) progressBar.style.width = `${progress}%`;
      }
    }, 250);
  }

  initializeInspector();

  window.addEventListener("load", () => {
    const telemetry = window.LittleGodTelemetry;
    if (!telemetry?.getSnapshot) return;
    const baseSnapshot = telemetry.getSnapshot;
    telemetry.getSnapshot = () => {
      const snapshot = baseSnapshot();
      return {
        ...snapshot,
        version: "0.4.0-genesis.1",
        resources: {
          ...snapshot.resources,
          rootBiomass: LG.getResourceTotals().roots,
        },
        genesis: {
          attributeModelVersion: 1,
          inheritedBirths: LG.state.lifetime.inheritedBirths,
          localMateChoices: LG.state.lifetime.localMateChoices,
          selectedIndividualId: LG.state.selectedIndividualId,
          populations: {
            grazers: LG.populationTraitSummary(LG.state.grazers),
            hunters: LG.populationTraitSummary(LG.state.hunters),
          },
        },
      };
    };
  });
})();