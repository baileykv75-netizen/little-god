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
  seedWorld() { return true; },
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
const context = { window, console, Object, Array, Number, Map, Set, Math };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/group-behavior-v1.js", "utf8"),
  context,
  { filename: "src/genesis/group-behavior-v1.js" },
);

assert.equal(LittleGod.groupBehaviorModel.version, "social-groups-v2");
assert.equal(LittleGod.groupBehaviorModel.grazerBehavior, "herd-defense-and-warning");
assert.equal(LittleGod.groupBehaviorModel.hunterBehavior, "pack-sensing-and-combat");
assert.equal(LittleGod.groupBehaviorModel.persistentGroupIds, true);
assert.equal(LittleGod.groupBehaviorModel.centroidBoundedRecruitment, true);
assert.equal(LittleGod.groupBehaviorModel.chainConnectedComponents, false);
assert.deepEqual(
  JSON.parse(JSON.stringify(LittleGod.groupBehaviorModel.groupSizeCaps)),
  { grazer: 8, hunter: 5 },
);

let groups = LittleGod.refreshSocialGroups();
assert.equal(groups.grazers.length, 1);
assert.deepEqual(groups.grazers[0].memberIds, [1, 2, 3]);
assert.equal(groups.hunters.length, 1);
assert.deepEqual(groups.hunters[0].memberIds, [10, 11]);
assert.equal(state.grazers[0].groupBehavior.role, "herd");
assert.equal(state.grazers[0].groupBehavior.size, 3);
assert.equal(state.grazers[3].groupBehavior.role, "ungrouped");
assert.equal(state.grazers[4].groupBehavior.role, "solitary");
assert.equal(state.hunters[0].groupBehavior.role, "pack");

const initialHerdId = groups.grazers[0].id;
const initialPackId = groups.hunters[0].id;
state.grazers[0].x += 12;
state.grazers[1].x += 9;
state.grazers[2].x += 7;
state.hunters[0].x += 10;
state.hunters[1].x += 14;
groups = LittleGod.refreshSocialGroups();
assert.equal(groups.grazers[0].id, initialHerdId,
  "Small movement should preserve the herd identity");
assert.equal(groups.hunters[0].id, initialPackId,
  "Small movement should preserve the pack identity");

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

state.grazers = state.grazers.filter((entry) => entry.id !== 1);
state.grazers.push(animal(6, "grazer", 105, 28, 81));
groups = LittleGod.refreshSocialGroups();
const continuedHerd = groups.grazers.find((group) => group.memberIds.includes(2));
assert.ok(continuedHerd, "The existing herd should recruit a nearby replacement member");
assert.equal(continuedHerd.id, initialHerdId,
  "A persistent herd must keep its ID after the original lowest-ID member leaves");
assert.deepEqual(continuedHerd.memberIds, [2, 3, 6]);

const diagnostics = LittleGod.getGroupBehaviorDiagnostics();
assert.equal(diagnostics.version, "social-groups-v2");
assert.equal(diagnostics.grazerHerds, 1);
assert.equal(diagnostics.hunterPacks, 1);
assert.equal(diagnostics.groupedAnimals, 5);
assert.equal(diagnostics.solitaryAnimals, 3);
assert.equal(diagnostics.largestGroup, 3);
assert.equal(diagnostics.averageGroupSize, 2.5);
assert.deepEqual(
  JSON.parse(JSON.stringify(diagnostics.groupSizeCaps)),
  { grazer: 8, hunter: 5 },
);
assert.ok(diagnostics.preservedGroupRefreshes >= 2);
assert.ok(diagnostics.benefitedUpdates >= 5);

LittleGod.resetSocialGroups();
state.grazers = Array.from({ length: 12 }, (_, index) => (
  animal(100 + index, "grazer", index * 150, 900, 82)
));
state.hunters = [];
const chainGroups = LittleGod.refreshSocialGroups().grazers;
assert.ok(chainGroups.length > 1,
  "A distance chain must not collapse into one map-spanning herd");
assert.ok(chainGroups.every((group) => group.size <= 8),
  "Every herd must respect the configured member cap");
assert.equal(
  chainGroups.reduce((sum, group) => sum + group.size, 0),
  12,
  "The bounded grouping pass should still classify all eligible chain members",
);
const chainDiagnostics = LittleGod.getGroupBehaviorDiagnostics();
assert.ok(chainDiagnostics.largestGroup <= 8);
assert.equal(chainDiagnostics.groupedAnimals, 12);

window.LittleGodTelemetry = {
  getSnapshot() { return { version: "base" }; },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.groupBehavior.version, "social-groups-v2");
assert.ok(snapshot.groupBehavior.grazerHerds > 1);

console.log("group-behavior.test: PASS");
