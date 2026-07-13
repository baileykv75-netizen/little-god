const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
let updateSnapshot = null;
let killTargetOnUpdate = false;

function hunter(id, x, y, groupId = null, groupSize = 1) {
  return {
    id,
    type: "hunter",
    x,
    y,
    state: "wander",
    targetId: null,
    attackCooldown: 0,
    derived: { senseRadius: 260 },
    groupBehavior: groupId ? {
      groupId,
      role: "pack",
      size: groupSize,
    } : null,
  };
}

function grazer(id, x, y, stamina = 30) {
  return {
    id,
    type: "grazer",
    x,
    y,
    stamina,
    derived: { staminaMax: 100 },
  };
}

const state = {
  year: 4,
  hunters: [
    hunter(1, 0, 0, "pack-a", 3),
    hunter(2, 24, 0, "pack-a", 3),
    hunter(3, 700, 700, "pack-a", 3),
    hunter(4, 500, 500),
  ],
  grazers: [
    grazer(101, 110, 0, 20),
    grazer(102, 200, 150, 70),
  ],
  ledger: {},
  lifetime: {},
};

const LittleGod = {
  state,
  SPECIES: { hunter: { attackCooldown: 0.16, senseRadius: 260 } },
  distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  },
  currentCombatPower(animal) {
    return animal.id === 101 ? 35 : 65;
  },
  refreshSocialGroups() {
    return true;
  },
  incrementMetric(key, amount = 1) {
    state.ledger[key] = (state.ledger[key] || 0) + amount;
    state.lifetime[key] = (state.lifetime[key] || 0) + amount;
  },
  updateHunters() {
    updateSnapshot = state.hunters.map((entry) => ({
      id: entry.id,
      targetId: entry.targetId,
      coordinated: entry.packHunting?.coordinated === true,
      sharedTargetId: entry.packHunting?.sharedTargetId ?? null,
    }));
    if (killTargetOnUpdate) {
      const targetId = state.hunters[0].targetId;
      state.grazers = state.grazers.filter((entry) => entry.id !== targetId);
    }
  },
  seedWorld() {
    state.year = 0;
    return true;
  },
  getEcologySupervisionDiagnostics() {
    return { version: "base" };
  },
};

const window = {
  LittleGod,
  addEventListener(type, listener) {
    if (type === "load") loadListeners.push(listener);
  },
};
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
  fs.readFileSync("src/genesis/pack-hunting-v1.js", "utf8"),
  context,
  { filename: "src/genesis/pack-hunting-v1.js" },
);

assert.equal(LittleGod.packHuntingModel.version, "shared-pack-target-v2");
assert.equal(LittleGod.packHuntingModel.changesTargetSelection, true);
assert.equal(LittleGod.packHuntingModel.changesBaseHuntProbability, false);
assert.equal(LittleGod.packHuntingModel.minimumSharedObservers, 2);
assert.equal(LittleGod.packHuntingModel.targetRecipients, "current-observers-only");
assert.equal(LittleGod.packHuntingModel.preservesLocalPreyRatioGate, true);

LittleGod.updateHunters(0.1);
assert.equal(updateSnapshot[0].targetId, 101);
assert.equal(updateSnapshot[1].targetId, 101,
  "Both observing pack members should receive the same prey target");
assert.equal(updateSnapshot[0].coordinated, true);
assert.equal(updateSnapshot[1].coordinated, true);
assert.equal(updateSnapshot[2].targetId, null,
  "A distant pack member must not receive a target it cannot sense");
assert.equal(updateSnapshot[2].coordinated, false);
assert.equal(updateSnapshot[2].sharedTargetId, 101,
  "A distant member may know the pack's shared target without being forced to chase it");
assert.equal(updateSnapshot[3].targetId, null,
  "A solitary hunter must not inherit a pack target");

let diagnostics = LittleGod.getPackHuntingDiagnostics();
assert.equal(diagnostics.version, "shared-pack-target-v2");
assert.equal(diagnostics.activePacks, 1);
assert.equal(diagnostics.coordinatedPacks, 1);
assert.equal(diagnostics.membersFollowingSharedTarget, 2);
assert.deepEqual(diagnostics.activeTargets[0].memberIds, [1, 2]);
assert.equal(diagnostics.activeTargets[0].packMemberCount, 3);
assert.equal(diagnostics.targetAcquisitions, 1);
assert.equal(diagnostics.targetSwitches, 0);
assert.equal(diagnostics.activeTargets[0].targetId, 101);
assert.equal(diagnostics.activeTargets[0].observerCount, 2);
assert.equal(diagnostics.hunts.coordinatedPackHuntSuccessRate, null);
assert.ok(diagnostics.definitions.participatingMembers.includes("currently sensing"));

state.hunters[0].state = "chase";
state.hunters[0].attackCooldown = 0.16;
LittleGod.incrementMetric("huntAttempts");
LittleGod.incrementMetric("huntSuccesses");
state.hunters[0].state = "wander";
state.hunters[0].attackCooldown = 0;

diagnostics = LittleGod.getPackHuntingDiagnostics();
assert.equal(diagnostics.hunts.coordinatedPackHunts, 1);
assert.equal(diagnostics.hunts.coordinatedPackHuntSuccesses, 1);
assert.equal(diagnostics.hunts.coordinatedPackHuntSuccessRate, 1);

state.hunters[0].packHunting.coordinated = false;
state.hunters[0].state = "chase";
state.hunters[0].attackCooldown = 0.16;
LittleGod.incrementMetric("huntAttempts");
LittleGod.incrementMetric("huntFailures");
state.hunters[0].state = "wander";
state.hunters[0].attackCooldown = 0;

diagnostics = LittleGod.getPackHuntingDiagnostics();
assert.equal(diagnostics.hunts.uncoordinatedPackHunts, 1);
assert.equal(diagnostics.hunts.uncoordinatedPackHuntSuccesses, 0);
assert.equal(diagnostics.hunts.uncoordinatedPackHuntSuccessRate, 0);

state.hunters[1].x = 900;
LittleGod.updateHunters(0.1);
diagnostics = LittleGod.getPackHuntingDiagnostics();
assert.equal(diagnostics.coordinatedPacks, 0,
  "A shared target requires at least two current observers");
assert.equal(state.hunters[0].targetId, null);
assert.equal(state.hunters[1].targetId, null);
assert.equal(state.hunters[2].targetId, null);
assert.ok(diagnostics.targetLosses >= 1);

state.hunters[1].x = 24;
state.grazers = [grazer(201, 90, 10, 15)];
LittleGod.updateHunters(0.1);
diagnostics = LittleGod.getPackHuntingDiagnostics();
assert.equal(diagnostics.coordinatedPacks, 1);
assert.equal(diagnostics.activeTargets[0].targetId, 201);
assert.deepEqual(diagnostics.activeTargets[0].memberIds, [1, 2]);
assert.equal(diagnostics.targetAcquisitions, 2);

killTargetOnUpdate = true;
LittleGod.updateHunters(0.1);
killTargetOnUpdate = false;
diagnostics = LittleGod.getPackHuntingDiagnostics();
assert.equal(diagnostics.coordinatedPacks, 0,
  "A prey removed during the hunter update must not remain as a phantom shared target");
assert.equal(diagnostics.activeTargets.length, 0);
assert.equal(state.hunters[0].packHunting.coordinated, false);

const compact = LittleGod.getEcologySupervisionDiagnostics();
assert.equal(compact.version, "base");
assert.equal(compact.packCoordination.version, "shared-pack-target-v2");
assert.ok(compact.packCoordination.definitions.successRate.includes("null"));

window.LittleGodTelemetry = {
  getSnapshot() {
    return { version: "telemetry-base" };
  },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "telemetry-base");
assert.equal(snapshot.packCoordination.version, "shared-pack-target-v2");

LittleGod.seedWorld();
diagnostics = LittleGod.getPackHuntingDiagnostics();
assert.equal(diagnostics.updates, 0);
assert.equal(diagnostics.targetAcquisitions, 0);
assert.equal(diagnostics.hunts.coordinatedPackHunts, 0);

console.log("pack-hunting.test: PASS");
