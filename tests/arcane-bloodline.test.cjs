const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const loadListeners = [];
let randomValues = [];
let nextId = 1;
let seeded = 0;
const customMath = Object.create(Math);
customMath.random = () => randomValues.shift() ?? 0.9;

const LittleGod = {
  state: { grazers: [], hunters: [] },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },
  createAnimal(type, x, y, options = {}) {
    return {
      id: options.id ?? nextId++,
      type,
      x,
      y,
      energy: 80,
      parents: (options.parents || []).map((parent) => parent.id ?? parent),
      traits: {
        arcaneCapacity: 50,
        arcaneStability: 60,
      },
      derived: {
        combatBase: 40,
        maxEnergy: 100,
      },
      genome: {
        bloodlines: {
          primordial: { markers: [[1, 1], [1, 1], [1, 1], [1, 1]], purity: 1 },
        },
      },
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
const context = { window, console, Object, Array, Number, Math: customMath };
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/arcane-bloodline-v1.js", "utf8"),
  context,
  { filename: "src/genesis/arcane-bloodline-v1.js" },
);

assert.equal(LittleGod.arcaneBloodlineModel.version, "aether-bloodline-v1");
assert.equal(LittleGod.arcaneBloodlineModel.activeThreshold, 2);
assert.equal(LittleGod.arcaneBloodlineModel.exaltedThreshold, 5);

randomValues = [0.01, 0.02, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
const awakenedFounder = LittleGod.createAnimal("grazer", 10, 20, { id: 10 });
assert.equal(awakenedFounder.arcaneBloodline.status, "awakened");
assert.equal(awakenedFounder.arcaneBloodline.alleleCount, 2);
assert.equal(awakenedFounder.arcaneBloodline.purity, 0.25);
assert.equal(awakenedFounder.genome.bloodlines.aether.source, "founder");
assert.equal(awakenedFounder.traits.arcaneCapacity, 51.6);
assert.equal(awakenedFounder.traits.arcaneStability, 61.1);
assert.equal(awakenedFounder.derived.combatBase, 40.8);
assert.equal(awakenedFounder.derived.maxEnergy, 101.25);

randomValues = Array(8).fill(0.9);
const dormantFounder = LittleGod.createAnimal("grazer", 30, 40, { id: 11 });
assert.equal(dormantFounder.arcaneBloodline.status, "dormant");
assert.equal(dormantFounder.traits.arcaneCapacity, 50);
assert.equal(dormantFounder.derived.combatBase, 40);

const mother = {
  id: 20,
  genome: { bloodlines: { aether: { markers: [[1, 1], [1, 1], [1, 1], [1, 1]] } } },
};
const father = {
  id: 21,
  genome: { bloodlines: { aether: { markers: [[0, 0], [0, 0], [0, 0], [0, 0]] } } },
};
randomValues = Array(16).fill(0.5);
const inheritedChild = LittleGod.createAnimal("grazer", 50, 60, {
  id: 12,
  parents: [mother, father],
});
assert.equal(inheritedChild.genome.bloodlines.aether.source, "inherited");
assert.equal(inheritedChild.arcaneBloodline.alleleCount, 4);
assert.equal(inheritedChild.arcaneBloodline.status, "awakened");
assert.equal(inheritedChild.arcaneBloodline.purity, 0.5);
assert.deepEqual(inheritedChild.parents, [20, 21]);

LittleGod.state.grazers = [awakenedFounder, dormantFounder, inheritedChild];
let diagnostics = LittleGod.getArcaneBloodlineDiagnostics();
assert.equal(diagnostics.version, "aether-bloodline-v1");
assert.equal(diagnostics.population, 3);
assert.equal(diagnostics.represented, 3);
assert.equal(diagnostics.statuses.dormant, 1);
assert.equal(diagnostics.statuses.awakened, 2);
assert.equal(diagnostics.averagePurity, 0.25);
assert.equal(diagnostics.maxAlleles, 4);
assert.equal(diagnostics.created, 3);
assert.equal(diagnostics.inherited, 1);
assert.equal(diagnostics.awakenings, 2);
assert.equal(diagnostics.mutations, 0);

window.LittleGodTelemetry = {
  getSnapshot() {
    return { version: "base" };
  },
};
for (const listener of loadListeners) listener();
const snapshot = window.LittleGodTelemetry.getSnapshot();
assert.equal(snapshot.version, "base");
assert.equal(snapshot.arcaneBloodline.version, "aether-bloodline-v1");
assert.equal(snapshot.arcaneBloodline.statuses.awakened, 2);

LittleGod.seedWorld();
diagnostics = LittleGod.getArcaneBloodlineDiagnostics();
assert.equal(seeded, 1);
assert.equal(diagnostics.created, 0);
assert.equal(diagnostics.inherited, 0);
assert.equal(diagnostics.awakenings, 0);
assert.equal(diagnostics.mutations, 0);

console.log("arcane-bloodline.test: PASS");
