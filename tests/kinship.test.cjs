const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
let seeded = 0;
let baseCandidates = null;
const LittleGod = {
  state: { year: 4.2 },
  chooseLocalMate(observer, candidates) {
    baseCandidates = candidates.slice();
    return candidates[0] || null;
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

const context = { window, console, Object, Set, Array };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/kinship-v1.js", "utf8"),
  context,
  { filename: "src/genesis/kinship-v1.js" },
);

assert.equal(LittleGod.kinshipModel.version, "close-kin-avoidance-v1");
assert.equal(LittleGod.kinshipModel.fallbackWhenOnlyKinAvailable, "no-mate");

const observer = { id: 1, parents: [10, 11] };
const fullSibling = { id: 2, parents: [10, 11] };
const halfSibling = { id: 3, parents: [10, 12] };
const parent = { id: 10, parents: [] };
const unrelated = { id: 4, parents: [20, 21] };

assert.equal(LittleGod.getKinshipRelation(observer, observer), "self");
assert.equal(LittleGod.getKinshipRelation(observer, parent), "parent-child");
assert.equal(LittleGod.getKinshipRelation(observer, fullSibling), "full-sibling");
assert.equal(LittleGod.getKinshipRelation(observer, halfSibling), "half-sibling");
assert.equal(LittleGod.getKinshipRelation(observer, unrelated), "unrelated");
assert.equal(LittleGod.isCloseKin(observer, fullSibling), true);
assert.equal(LittleGod.isCloseKin(observer, unrelated), false);

const chosen = LittleGod.chooseLocalMate(observer, [fullSibling, halfSibling, unrelated]);
assert.equal(chosen, unrelated,
  "An unrelated mate must be selected instead of a sibling");
assert.deepEqual(baseCandidates, [unrelated],
  "The existing mate-quality chooser must receive only unrelated candidates");
assert.equal(observer.kinshipChoice.selectedMateId, unrelated.id);
assert.equal(observer.kinshipChoice.rejected.length, 2);
assert.equal(observer.kinshipChoice.blocked, false);

const blocked = LittleGod.chooseLocalMate(observer, [parent, fullSibling]);
assert.equal(blocked, null,
  "Reproduction must stop when only close relatives are available");
assert.equal(observer.kinshipChoice.blocked, true);
assert.equal(observer.kinshipChoice.selectedMateId, null);

let diagnostics = LittleGod.getKinshipDiagnostics();
assert.equal(diagnostics.evaluatedCandidates, 5);
assert.equal(diagnostics.rejectedCloseKin, 4);
assert.equal(diagnostics.acceptedChoices, 1);
assert.equal(diagnostics.blockedChoices, 1);
assert.equal(diagnostics.byRelation["parent-child"], 1);
assert.equal(diagnostics.byRelation["full-sibling"], 2);
assert.equal(diagnostics.byRelation["half-sibling"], 1);

window.LittleGodTelemetry = {
  getSnapshot() {
    return { version: "base", worldYear: LittleGod.state.year };
  },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.kinship.version, "close-kin-avoidance-v1");
assert.equal(snapshot.kinship.blockedChoices, 1);

LittleGod.seedWorld();
diagnostics = LittleGod.getKinshipDiagnostics();
assert.equal(seeded, 1);
assert.equal(diagnostics.evaluatedCandidates, 0);
assert.equal(diagnostics.rejectedCloseKin, 0);
assert.equal(diagnostics.blockedChoices, 0);

console.log("kinship.test: PASS");
