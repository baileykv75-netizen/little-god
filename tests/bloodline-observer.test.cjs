const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.children = [];
    this.attributes = {};
    this.parentNode = null;
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  insertBefore(child, reference) {
    child.parentNode = this;
    const index = this.children.indexOf(reference);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  matches(selector) {
    if (selector.startsWith(".")) {
      return this.className.split(/\s+/).includes(selector.slice(1));
    }
    return false;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

const inspectorBody = new FakeElement("div");
const populationSummary = new FakeElement("div");
populationSummary.className = "genesis-population-summary";
inspectorBody.append(populationSummary);

const animal = {
  id: 42,
  arcaneBloodline: {
    name: "aether",
    status: "awakened",
    alleleCount: 3,
    purity: 0.375,
    active: true,
    modifiers: {
      capacityBonus: 2.4,
      stabilityBonus: 1.65,
      combatMultiplier: 1.03,
      energyMultiplier: 1.01875,
    },
  },
  genome: {
    bloodlines: {
      aether: { source: "inherited" },
    },
  },
};

const LittleGod = {
  state: {
    selectedIndividualId: 42,
    grazers: [animal],
    hunters: [],
  },
  arcaneBloodlineModel: { locusCount: 4 },
};

const document = {
  readyState: "complete",
  createElement(tag) { return new FakeElement(tag); },
  querySelector(selector) {
    if (selector === "#genesisInspectorBody") return inspectorBody;
    if (selector === "#genesisInspectorBody .genesis-bloodline-card") {
      return inspectorBody.querySelector(".genesis-bloodline-card");
    }
    return null;
  },
};

class MutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
}

const context = {
  window: {
    LittleGod,
    setInterval() { return 1; },
  },
  document,
  MutationObserver,
  console,
  Object,
  Array,
  Number,
  String,
  Boolean,
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("src/genesis/bloodline-observer-v1.js", "utf8"),
  context,
  { filename: "src/genesis/bloodline-observer-v1.js" },
);

assert.equal(LittleGod.bloodlineObserverModel.version, "bloodline-observer-v1");
assert.equal(LittleGod.bloodlineObserverModel.showsAlleles, true);
assert.equal(LittleGod.bloodlineObserverModel.showsActiveModifiers, true);

const observation = LittleGod.getArcaneBloodlineObservation(animal);
assert.equal(observation.label, "以太血脉");
assert.equal(observation.statusLabel, "觉醒");
assert.equal(observation.alleleCount, 3);
assert.equal(observation.alleleCapacity, 8);
assert.equal(observation.purityPercent, 37.5);
assert.equal(observation.source, "inherited");
assert.equal(observation.capacityBonus, 2.4);
assert.ok(Math.abs(observation.combatBonusPercent - 3) < 1e-9);

assert.equal(inspectorBody.dataset.bloodlineObserverMounted, "true");
const card = inspectorBody.querySelector(".genesis-bloodline-card");
assert.ok(card, "Selected animal bloodline card should be rendered in the inspector");
assert.equal(card.dataset.bloodlineAnimalId, "42");
assert.equal(card.attributes["aria-label"], "以太血脉：觉醒");
assert.equal(inspectorBody.children[0], card,
  "Bloodline card should appear before the population summary");
assert.equal(LittleGod.getBloodlineObserverDiagnostics().mounted, true);
assert.equal(LittleGod.getBloodlineObserverDiagnostics().visible, true);

LittleGod.state.selectedIndividualId = null;
LittleGod.syncBloodlineObserver();
assert.equal(inspectorBody.querySelector(".genesis-bloodline-card"), null,
  "Bloodline card should disappear when no animal is selected");

console.log("bloodline-observer.test: PASS");
