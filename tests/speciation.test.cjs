const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
const closeKinIds = new Set();
let receivedCandidates = [];
let seeded = 0;
let nextId = 100;

function definition(min = 0, max = 100) {
  return { min, max };
}

const schema = {
  bodyMass: definition(),
  musclePower: definition(),
  armor: definition(),
  agility: definition(),
  endurance: definition(),
  metabolicEfficiency: definition(),
  coldTolerance: definition(),
  visionRange: definition(),
  scentRange: definition(),
  caution: definition(),
  mateSelectivity: definition(),
};

const LittleGod = {
  state: { year: 6.25, grazers: [], hunters: [] },
  ATTRIBUTE_SCHEMA: { grazer: schema, hunter: schema },
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
  isCloseKin(observer, candidate) { return closeKinIds.has(candidate.id); },
  chooseLocalMate(observer, candidates) {
    receivedCandidates = candidates.slice();
    return candidates.find((candidate) => !closeKinIds.has(candidate.id)) || null;
  },
  createAnimal(type, x, y, options = {}) {
    return {
      id: options.id ?? nextId++,
      type,
      x,
      y,
      traits: { ...options.traits },
    };
  },
  seedWorld() {
    seeded += 1;
    return seeded;
  },
};

function grazer(id, traits) {
  return { id, type: "grazer", traits: { ...traits } };
}

const courserTraits = {
  agility: 92,
  endurance: 88,
  metabolicEfficiency: 86,
  bodyMass: 25,
  musclePower: 30,
  armor: 20,
  coldTolerance: 28,
  mateSelectivity: 82,
};
const bulwarkTraits = {
  agility: 28,
  endurance: 35,
  metabolicEfficiency: 32,
  bodyMass: 90,
  musclePower: 86,
  armor: 92,
  coldTolerance: 88,
  mateSelectivity: 80,
};
const meadowTraits = {
  agility: 55,
  endurance: 55,
  metabolicEfficiency: 55,
  bodyMass: 52,
  musclePower: 52,
  armor: 52,
  coldTolerance: 52,
  mateSelectivity: 50,
};

const observer = grazer(1, courserTraits);
const sameCourser = grazer(2, { ...courserTraits, mateSelectivity: 60 });
const closeSame = grazer(3, courserTraits);
const bulwark = grazer(4, bulwarkTraits);
const lowSelectivity = grazer(5, { ...courserTraits, mateSelectivity: 20 });
LittleGod.state.grazers = [observer, sameCourser, closeSame, bulwark, lowSelectivity];

const window = {
  LittleGod,
  addEventListener(type, listener) {
    if (type === "load") loadListeners.push(listener);
  },
};
const context = { window, console, Object, Array, Number, Set, Map, Math };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/speciation-v1.js", "utf8"),
  context,
  { filename: "src/genesis/speciation-v1.js" },
);

assert.equal(LittleGod.speciationModel.version, "ecotype-differentiation-v1");
assert.equal(LittleGod.speciationModel.mechanism, "heritable-trait-assortative-mating");
assert.equal(LittleGod.speciationModel.selectivityThreshold, 55);
assert.equal(LittleGod.classifyEcotype(observer).id, "courser");
assert.equal(LittleGod.classifyEcotype(bulwark).id, "bulwark");

let chosen = LittleGod.chooseLocalMate(observer, [bulwark, sameCourser]);
assert.equal(chosen, sameCourser,
  "High-selectivity animals should prefer viable mates of the same ecotype");
assert.deepEqual(receivedCandidates, [sameCourser],
  "Existing mate quality and kinship logic should receive the assortative pool");
assert.equal(observer.ecotypeChoice.sameEcotype, true);
assert.equal(observer.ecotypeChoice.assortativePool, true);

closeKinIds.add(closeSame.id);
chosen = LittleGod.chooseLocalMate(observer, [closeSame, bulwark]);
assert.equal(chosen, bulwark,
  "Cross-ecotype mating must remain available when same-ecotype candidates are close kin");
assert.deepEqual(receivedCandidates, [closeSame, bulwark]);
assert.equal(observer.ecotypeChoice.sameEcotype, false);
assert.equal(observer.ecotypeChoice.assortativePool, false);

chosen = LittleGod.chooseLocalMate(lowSelectivity, [bulwark, sameCourser]);
assert.equal(chosen, bulwark,
  "Low-selectivity animals should keep the full compatible candidate pool");
assert.deepEqual(receivedCandidates, [bulwark, sameCourser]);
assert.equal(lowSelectivity.ecotypeChoice.sameEcotype, false);

const created = LittleGod.createAnimal("grazer", 10, 20, {
  id: 6,
  traits: meadowTraits,
});
LittleGod.state.grazers.push(created);
assert.equal(created.ecotype.id, "meadow");
assert.equal(created.ecotype.specialized, false);

let diagnostics = LittleGod.getSpeciationDiagnostics();
assert.equal(diagnostics.version, "ecotype-differentiation-v1");
assert.equal(diagnostics.population, 6);
assert.equal(diagnostics.populations.grazer.courser, 4);
assert.equal(diagnostics.populations.grazer.bulwark, 1);
assert.equal(diagnostics.populations.grazer.meadow, 1);
assert.equal(diagnostics.specialized, 5);
assert.equal(diagnostics.evaluatedChoices, 3);
assert.equal(diagnostics.sameEcotypeChoices, 1);
assert.equal(diagnostics.crossEcotypeChoices, 2);
assert.equal(diagnostics.assortativePools, 1);
assert.equal(diagnostics.compatibilityFallbacks, 1);

window.LittleGodTelemetry = {
  getSnapshot() { return { version: "base" }; },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.speciation.version, "ecotype-differentiation-v1");
assert.equal(snapshot.speciation.populations.grazer.courser, 4);

LittleGod.seedWorld();
diagnostics = LittleGod.getSpeciationDiagnostics();
assert.equal(seeded, 1);
assert.equal(diagnostics.evaluatedChoices, 0);
assert.equal(diagnostics.sameEcotypeChoices, 0);
assert.equal(diagnostics.crossEcotypeChoices, 0);
assert.equal(diagnostics.assortativePools, 0);
assert.equal(diagnostics.compatibilityFallbacks, 0);

console.log("speciation.test: PASS");
