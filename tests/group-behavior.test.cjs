const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
let grazerDuringUpdate = null;
let hunterDuringUpdate = null;
const state = { year: 3.5, grazers: [], hunters: [] };

function animal(id, type, x, y, sociality) {
  return {
    id,
    type,
    x,
    y,
    traits: { sociality },
    derived: {
      combatBase: type === "grazer" ? 40 : 60,
      senseRadius: type === "grazer" ? 200 : 260,
      threatRadius: type === "grazer" ? 180 : 0,
    },
  };
}

const LittleGod = {
  state,
  clamp(value, min, max) { return Math.max(min, Math.min(max, value)); },
  distanceSquared(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; },
  updateGrazers() {
    grazerDuringUpdate = {
      combatBase: state.grazers[0].derived.combatBase,
      threatRadius: state.grazers[0].derived.threatRadius,
    };
  },
  updateHunters() {
    hunterDuringUpdate = {
      combatBase: state.hunters[0].derived.combatBase,
      senseRadius: state.hunters[0].derived.senseRadius,
    };
  },
};

state.grazers = [
  animal(1, "grazer", 0, 0, 84),
  animal(2, "grazer", 80, 0, 76),
  animal(3, "grazer", 150, 0, 70),
  animal(4, "grazer", 900, 0, 90),
  animal(5, "grazer", 20, 20, 20),
];
state.hunters = [
  animal(10, "hunter", 0, 400, 82),
  animal(11, "hunter", 120, 400, 68),
  animal(12, "hunter", 700, 400, 90),
];

const window = {
  LittleGod,
  addEventListener(type, listener) {
    if (type === "load") loadListeners.push(listener);
  },
};
const context = { window, console, Object, Array, Number, Set, Math };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/group-behavior-v1.js", "utf8"),
  context,
  { filename: "src/genesis/group-behavior-v1.js" },
);

assert.equal(LittleGod.groupBehaviorModel.version, "social-groups-v1");
assert.equal(LittleGod.groupBehaviorModel.grazerBehavior, "herd-defense-and-warning");
assert.equal(LittleGod.groupBehaviorModel.hunterBehavior, "pack-sensing-and-combat");

const groups = LittleGod.refreshSocialGroups();
assert.equal(groups.grazers.length, 1);
assert.deepEqual(groups.grazers[0].memberIds, [1, 2, 3]);
assert.equal(groups.hunters.length, 1);
assert.deepEqual(groups.hunters[0].memberIds, [10, 11]);
assert.equal(state.grazers[0].groupBehavior.role, "herd");
assert.equal(state.grazers[0].groupBehavior.size, 3);
assert.equal(state.grazers[3].groupBehavior.role, "ungrouped");
assert.equal(state.grazers[4].groupBehavior.role, "solitary");
assert.equal(state.hunters[0].groupBehavior.role, "pack");

LittleGod.updateGrazers(0.1);
assert.ok(grazerDuringUpdate.combatBase > 40,
  "Herd members should receive temporary defensive combat support");
assert.ok(grazerDuringUpdate.threatRadius > 180,
  "Herd members should receive temporary shared-warning range");
assert.equal(state.grazers[0].derived.combatBase, 40,
  "Temporary herd modifiers must not permanently compound");
assert.equal(state.grazers[0].derived.threatRadius, 180);
assert.ok(state.grazers[0].groupBehavior.bonuses.combatMultiplier > 1);

LittleGod.updateHunters(0.1);
assert.ok(hunterDuringUpdate.combatBase > 60,
  "Pack members should receive temporary cooperative combat support");
assert.ok(hunterDuringUpdate.senseRadius > 260,
  "Pack members should receive temporary shared sensing range");
assert.equal(state.hunters[0].derived.combatBase, 60);
assert.equal(state.hunters[0].derived.senseRadius, 260);

const diagnostics = LittleGod.getGroupBehaviorDiagnostics();
assert.equal(diagnostics.version, "social-groups-v1");
assert.equal(diagnostics.grazerHerds, 1);
assert.equal(diagnostics.hunterPacks, 1);
assert.equal(diagnostics.groupedAnimals, 5);
assert.equal(diagnostics.solitaryAnimals, 3);
assert.equal(diagnostics.largestGroup, 3);
assert.equal(diagnostics.averageGroupSize, 2.5);
assert.ok(diagnostics.benefitedUpdates >= 5);

window.LittleGodTelemetry = {
  getSnapshot() { return { version: "base" }; },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.groupBehavior.grazerHerds, 1);
assert.equal(snapshot.groupBehavior.hunterPacks, 1);

console.log("group-behavior.test: PASS");
