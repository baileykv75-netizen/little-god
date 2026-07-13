const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

function animal(id, type, x, y, groupId, role, size) {
  return {
    id,
    type,
    x,
    y,
    state: "wander",
    attackCooldown: 0,
    groupBehavior: groupId ? { groupId, role, size } : null,
  };
}

const state = {
  year: 0,
  grazers: [
    animal(1, "grazer", 0, 0, "herd-a", "herd", 4),
    animal(2, "grazer", 20, 0, "herd-a", "herd", 4),
    animal(3, "grazer", 0, 20, "herd-a", "herd", 4),
    animal(4, "grazer", 20, 20, "herd-a", "herd", 4),
  ],
  hunters: [
    animal(10, "hunter", 100, 100, "pack-a", "pack", 2),
    animal(11, "hunter", 120, 100, "pack-a", "pack", 2),
  ],
  ledger: { huntAttempts: 0, huntSuccesses: 0, huntFailures: 0 },
  lifetime: { huntAttempts: 0, huntSuccesses: 0, huntFailures: 0 },
};

const LittleGod = {
  state,
  SPECIES: { hunter: { attackCooldown: 0.16 } },
  incrementMetric(key, amount = 1) {
    state.ledger[key] = (state.ledger[key] || 0) + amount;
    state.lifetime[key] = (state.lifetime[key] || 0) + amount;
  },
  updateWorld(dt) { state.year += dt; },
  seedWorld() { state.year = 0; return true; },
  getEcologySupervisionDiagnostics() { return { version: "base" }; },
};

const window = { LittleGod, addEventListener() {} };
const context = {
  window,
  console,
  Object,
  Array,
  Number,
  String,
  Boolean,
  Map,
  Set,
  Math,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/group-quality-v1.js", "utf8"),
  context,
  { filename: "src/genesis/group-quality-v1.js" },
);

for (let index = 0; index < 7; index += 1) LittleGod.updateWorld(0.1);

state.grazers[0].groupBehavior = { groupId: "herd-left", role: "herd", size: 2 };
state.grazers[1].groupBehavior = { groupId: "herd-left", role: "herd", size: 2 };
state.grazers[2].groupBehavior = { groupId: "herd-right", role: "herd", size: 2 };
state.grazers[3].groupBehavior = { groupId: "herd-right", role: "herd", size: 2 };
LittleGod.updateWorld(0.1);

for (const grazer of state.grazers) {
  grazer.groupBehavior = { groupId: "herd-merged", role: "herd", size: 4 };
}
LittleGod.updateWorld(0.1);

state.hunters[0].state = "chase";
state.hunters[0].attackCooldown = 0.16;
LittleGod.incrementMetric("huntAttempts");
LittleGod.incrementMetric("huntSuccesses");
state.hunters[0].groupBehavior = null;
state.hunters[0].state = "chase";
state.hunters[0].attackCooldown = 0.16;
LittleGod.incrementMetric("huntAttempts");
LittleGod.incrementMetric("huntFailures");

const diagnostics = LittleGod.getGroupQualityDiagnostics();
assert.equal(diagnostics.version, "group-quality-baseline-v1");
assert.equal(diagnostics.observationOnly, true);
assert.ok(diagnostics.grazer.observedGroupTracks >= 2);
assert.ok(diagnostics.grazer.groupLifetimeYears.maximum >= 0.5);
assert.ok(diagnostics.grazer.stableGroupCount >= 1);
assert.ok(diagnostics.grazer.splitCount >= 1);
assert.ok(diagnostics.grazer.mergeCount >= 1);
assert.ok(diagnostics.grazer.averageMemberDistance > 0);
assert.ok(diagnostics.grazer.maximumMemberDistance >= diagnostics.grazer.averageMemberDistance);
assert.ok(diagnostics.grazer.membershipTurnover >= 0);
assert.equal(diagnostics.hunts.packHunts, 1);
assert.equal(diagnostics.hunts.packHuntSuccesses, 1);
assert.equal(diagnostics.hunts.packHuntSuccessRate, 1);
assert.equal(diagnostics.hunts.soloHunts, 1);
assert.equal(diagnostics.hunts.soloHuntSuccesses, 0);
assert.equal(diagnostics.hunts.soloHuntSuccessRate, 0);
assert.equal(diagnostics.hunts.unknownHunts, 0);
assert.ok(diagnostics.definitions.noSampleValue.includes("null"));

const compact = LittleGod.getEcologySupervisionDiagnostics();
assert.equal(compact.version, "base");
assert.equal(compact.groupQuality.version, "group-quality-baseline-v1");
assert.equal(LittleGod.groupQualityModel.changesGroupDecisions, false);
assert.equal(LittleGod.groupQualityModel.changesHuntProbability, false);

console.log("group-quality.test: PASS");
