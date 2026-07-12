const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
let seeded = 0;
let baseCandidates = null;
let nextId = 100;
const LittleGod = {
  state: { year: 4.2, grazers: [], hunters: [] },
  chooseLocalMate(observer, candidates) {
    baseCandidates = candidates.slice();
    return candidates[0] || null;
  },
  createAnimal(type, x, y, options = {}) {
    return {
      id: options.id ?? nextId++,
      type,
      parents: (options.parents || []).map((parent) => parent.id ?? parent),
      generation: options.generation || 0,
    };
  },
  seedWorld() {
    seeded += 1;
    return seeded;
  },
};

const window = {
  LittleGod,
  addEventListener(type, listener) {
    if (type === "load") loadListeners.push(listener);
  },
};

const context = { window, console, Object, Set, Map, Array, Number };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/kinship-v1.js", "utf8"),
  context,
  { filename: "src/genesis/kinship-v1.js" },
);

assert.equal(LittleGod.kinshipModel.version, "pedigree-kinship-v2");
assert.equal(LittleGod.kinshipModel.pedigreeDepth, 2);
assert.equal(LittleGod.kinshipModel.fallbackWhenOnlyHardKinAvailable, "no-mate");
assert.equal(LittleGod.kinshipModel.fallbackWhenOnlyDistantKinAvailable, "allow-first-cousin");

function register(id, parents = [], generation = 0) {
  const animal = { id, type: "grazer", parents, generation };
  LittleGod.registerPedigree(animal);
  return animal;
}

const grandparentA = register(10);
const grandparentB = register(11);
const grandparentC = register(12);
const parent = register(20, [10, 11], 1);
const aunt = register(21, [10, 11], 1);
const halfAunt = register(22, [10, 12], 1);
const otherParent = register(30);
const cousinParent = register(31);
const observer = register(40, [20, 30], 2);
const fullSibling = register(41, [20, 30], 2);
const halfSibling = register(42, [20, 31], 2);
const cousin = register(43, [21, 31], 2);
const halfCousin = register(44, [22, 31], 2);
const unrelated = register(50, [60, 61], 2);

assert.equal(LittleGod.getKinshipRelation(observer, observer), "self");
assert.equal(LittleGod.getKinshipRelation(observer, parent), "parent-child");
assert.equal(LittleGod.getKinshipRelation(observer, fullSibling), "full-sibling");
assert.equal(LittleGod.getKinshipRelation(observer, halfSibling), "half-sibling");
assert.equal(LittleGod.getKinshipRelation(observer, grandparentA), "grandparent");
assert.equal(LittleGod.getKinshipRelation(observer, aunt), "avuncular");
assert.equal(LittleGod.getKinshipRelation(observer, halfAunt), "avuncular");
assert.equal(LittleGod.getKinshipRelation(observer, cousin), "first-cousin");
assert.equal(LittleGod.getKinshipRelation(observer, halfCousin), "first-cousin");
assert.equal(LittleGod.getKinshipRelation(observer, unrelated), "unrelated");
assert.equal(LittleGod.isCloseKin(observer, aunt), true);
assert.equal(LittleGod.isCloseKin(observer, cousin), false,
  "First cousins are avoided when possible but remain a population-survival fallback");

const chosen = LittleGod.chooseLocalMate(observer, [fullSibling, aunt, cousin, unrelated]);
assert.equal(chosen, unrelated,
  "An unrelated mate must be preferred over close or distant relatives");
assert.deepEqual(baseCandidates, [unrelated],
  "The existing mate-quality chooser must receive only unrelated candidates when available");
assert.equal(observer.kinshipChoice.rejected.length, 2);
assert.equal(observer.kinshipChoice.avoided.length, 1);
assert.equal(observer.kinshipChoice.fallbackToDistantKin, false);

const distantFallback = LittleGod.chooseLocalMate(observer, [cousin]);
assert.equal(distantFallback, cousin,
  "A first cousin may be selected only when no unrelated candidate is available");
assert.deepEqual(baseCandidates, [cousin]);
assert.equal(observer.kinshipChoice.fallbackToDistantKin, true);

const blocked = LittleGod.chooseLocalMate(observer, [parent, fullSibling, aunt]);
assert.equal(blocked, null,
  "Reproduction must stop when only hard-blocked close relatives are available");
assert.equal(observer.kinshipChoice.blocked, true);

const createdChild = LittleGod.createAnimal("grazer", 0, 0, {
  id: 70,
  parents: [observer, unrelated],
  generation: 3,
});
assert.deepEqual(LittleGod.getPedigreeRecord(createdChild.id).parents, [observer.id, unrelated.id],
  "New births must be added to the persistent pedigree registry");

let diagnostics = LittleGod.getKinshipDiagnostics();
assert.equal(diagnostics.version, "pedigree-kinship-v2");
assert.equal(diagnostics.pedigreeRecords, 15);
assert.equal(diagnostics.evaluatedCandidates, 8);
assert.equal(diagnostics.rejectedCloseKin, 5);
assert.equal(diagnostics.avoidedDistantKin, 1);
assert.equal(diagnostics.acceptedChoices, 2);
assert.equal(diagnostics.blockedChoices, 1);
assert.equal(diagnostics.fallbackDistantKinChoices, 1);
assert.equal(diagnostics.byRelation["full-sibling"], 2);
assert.equal(diagnostics.byRelation.avuncular, 2);
assert.equal(diagnostics.byRelation["first-cousin"], 2);

window.LittleGodTelemetry = {
  getSnapshot() {
    return { version: "base", worldYear: LittleGod.state.year };
  },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.kinship.version, "pedigree-kinship-v2");
assert.equal(snapshot.kinship.fallbackDistantKinChoices, 1);

LittleGod.seedWorld();
diagnostics = LittleGod.getKinshipDiagnostics();
assert.equal(seeded, 1);
assert.equal(diagnostics.pedigreeRecords, 0);
assert.equal(diagnostics.evaluatedCandidates, 0);
assert.equal(diagnostics.rejectedCloseKin, 0);
assert.equal(diagnostics.blockedChoices, 0);

console.log("kinship.test: PASS");
