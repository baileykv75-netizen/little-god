const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
const state = {
  year: 2.5,
  grazers: [],
  hunters: [],
};
let lastMove = null;

const LittleGod = {
  state,
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  distanceSquared(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  },
  randomBetween(min, max) {
    return (min + max) / 2;
  },
  moveAnimal(animal, desiredAngle, speed, dt) {
    lastMove = { animal, desiredAngle, speed, dt };
  },
};

const window = {
  LittleGod,
  addEventListener(type, listener) {
    if (type === "load") loadListeners.push(listener);
  },
};

const context = { window, console, Object, Number, Math };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/active-traits-v1.js", "utf8"),
  context,
  { filename: "src/genesis/active-traits-v1.js" },
);

assert.equal(LittleGod.activeTraitModel.version, "active-sociality-memory-v1");
assert.equal(LittleGod.activeTraitModel.highTraitBehavior, "cohere");
assert.equal(LittleGod.activeTraitModel.lowTraitBehavior, "avoid");
assert.equal(LittleGod.activeTraitModel.recalledBehavior, "remember");
assert.equal(LittleGod.activeTraitModel.memoryTrait, "memorySpan");

function animal(id, x, y, sociality, memorySpan = 1.5) {
  return {
    id,
    type: "grazer",
    x,
    y,
    angle: Math.PI / 2,
    wanderTimer: 1,
    traits: { sociality, curiosity: 50, memorySpan },
    derived: { senseRadius: 240 },
  };
}

const socialGrazer = animal(1, 0, 0, 90, 1.2);
const socialNeighbor = animal(2, 100, 0, 50);
state.grazers = [socialGrazer, socialNeighbor];
LittleGod.wander(socialGrazer, 20, 0.1);
assert.equal(socialGrazer.activeBehavior.mode, "cohere");
assert.equal(socialGrazer.activeBehavior.neighborCount, 1);
assert.ok(lastMove.desiredAngle < Math.PI / 2,
  "Highly social grazers should turn toward nearby conspecifics");
assert.equal(socialGrazer.observationMemory.socialCenter.x, 100);
assert.equal(socialGrazer.observationMemory.socialCenter.y, 0);
assert.equal(socialGrazer.observationMemory.socialCenter.expiresYear, 3.7);

state.year = 2.8;
state.grazers = [socialGrazer];
socialGrazer.angle = Math.PI / 2;
LittleGod.wander(socialGrazer, 20, 0.1);
assert.equal(socialGrazer.activeBehavior.mode, "remember");
assert.equal(socialGrazer.activeBehavior.memoryActive, true);
assert.equal(socialGrazer.activeBehavior.memoryAge, 0.3);
assert.ok(lastMove.desiredAngle < Math.PI / 2,
  "A social grazer should revisit the remembered herd center after losing sight of peers");

const memoryDiagnostics = LittleGod.getActiveTraitDiagnostics();
assert.equal(memoryDiagnostics.version, "active-sociality-memory-v1");
assert.equal(memoryDiagnostics.memoryTrait, "memorySpan");
assert.equal(memoryDiagnostics.rememberedCount, 1);
assert.equal(memoryDiagnostics.modes.remember, 1);
assert.equal(memoryDiagnostics.averageMemoryAge, 0.3);

state.year = 3.8;
socialGrazer.angle = Math.PI / 2;
LittleGod.wander(socialGrazer, 20, 0.1);
assert.equal(socialGrazer.activeBehavior.mode, "alone");
assert.equal(socialGrazer.activeBehavior.memoryActive, false);
assert.equal(socialGrazer.observationMemory.socialCenter, undefined,
  "Expired observations must be discarded");

const solitaryGrazer = animal(3, 0, 0, 10);
const solitaryNeighbor = animal(4, 100, 0, 50);
state.grazers = [solitaryGrazer, solitaryNeighbor];
LittleGod.wander(solitaryGrazer, 20, 0.1);
assert.equal(solitaryGrazer.activeBehavior.mode, "avoid");
assert.equal(solitaryGrazer.activeBehavior.neighborCount, 1);
assert.ok(lastMove.desiredAngle > Math.PI / 2,
  "Low-sociality grazers should turn away from nearby conspecifics");
assert.equal(solitaryGrazer.observationMemory, undefined,
  "Low-sociality avoidance should not create herd memories");

const loneGrazer = animal(5, 0, 0, 85);
state.grazers = [loneGrazer];
LittleGod.wander(loneGrazer, 20, 0.1);
assert.equal(loneGrazer.activeBehavior.mode, "alone");

const diagnostics = LittleGod.getActiveTraitDiagnostics();
assert.equal(diagnostics.population, 1);
assert.equal(diagnostics.activeCount, 1);
assert.equal(diagnostics.rememberedCount, 0);
assert.equal(diagnostics.modes.alone, 1);
assert.equal(diagnostics.averageSociality, 85);

window.LittleGodTelemetry = {
  getSnapshot() {
    return { version: "base", worldYear: state.year };
  },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.activeTraits.trait, "sociality");
assert.equal(snapshot.activeTraits.memoryTrait, "memorySpan");
assert.equal(snapshot.activeTraits.modes.alone, 1);

console.log("active-traits.test: PASS");
