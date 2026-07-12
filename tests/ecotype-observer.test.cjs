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
const bloodlineCard = new FakeElement("section");
bloodlineCard.className = "genesis-bloodline-card";
const populationSummary = new FakeElement("div");
populationSummary.className = "genesis-population-summary";
inspectorBody.append(bloodlineCard, populationSummary);

const animal = {
  id: 77,
  type: "grazer",
  traits: { mateSelectivity: 82 },
  ecotypeChoice: {
    selectedMateId: 91,
    selectedEcotype: "courser",
    sameEcotype: true,
    assortativePool: true,
  },
};

const LittleGod = {
  state: {
    selectedIndividualId: 77,
    grazers: [animal],
    hunters: [],
  },
  speciationModel: { selectivityThreshold: 55 },
  classifyEcotype(target) {
    target.ecotype = {
      id: "courser",
      label: "疾行型",
      specialized: true,
      mobileAxis: 0.84,
      robustAxis: 0.39,
      divergence: 0.45,
    };
    return target.ecotype;
  },
};

const document = {
  readyState: "complete",
  createElement(tag) { return new FakeElement(tag); },
  querySelector(selector) {
    if (selector === "#genesisInspectorBody") return inspectorBody;
    if (selector === "#genesisInspectorBody .genesis-ecotype-card") {
      return inspectorBody.querySelector(".genesis-ecotype-card");
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
  fs.readFileSync("src/genesis/ecotype-observer-v1.js", "utf8"),
  context,
  { filename: "src/genesis/ecotype-observer-v1.js" },
);

assert.equal(LittleGod.ecotypeObserverModel.version, "ecotype-observer-v1");
assert.equal(LittleGod.ecotypeObserverModel.showsTraitAxes, true);
assert.equal(LittleGod.ecotypeObserverModel.showsMatePreference, true);

const observation = LittleGod.getEcotypeObservation(animal);
assert.equal(observation.id, "courser");
assert.equal(observation.label, "疾行型");
assert.equal(observation.specialized, true);
assert.equal(observation.mobilePercent, 84);
assert.equal(observation.robustPercent, 39);
assert.equal(observation.divergencePercent, 45);
assert.equal(observation.assortativePreference, true);
assert.equal(observation.lastChoice.selectedMateId, 91);
assert.equal(observation.lastChoice.sameEcotype, true);

assert.equal(inspectorBody.dataset.ecotypeObserverMounted, "true");
const card = inspectorBody.querySelector(".genesis-ecotype-card");
assert.ok(card, "Selected animal ecotype card should be rendered in the inspector");
assert.equal(card.dataset.ecotypeAnimalId, "77");
assert.equal(card.attributes["aria-label"], "生态型：疾行型");
assert.equal(inspectorBody.children[1], card,
  "Ecotype card should coexist with bloodline data and appear before population summary");
assert.equal(LittleGod.getEcotypeObserverDiagnostics().mounted, true);
assert.equal(LittleGod.getEcotypeObserverDiagnostics().visible, true);

LittleGod.state.selectedIndividualId = null;
LittleGod.syncEcotypeObserver();
assert.equal(inspectorBody.querySelector(".genesis-ecotype-card"), null,
  "Ecotype card should disappear when no animal is selected");
assert.equal(inspectorBody.querySelector(".genesis-bloodline-card"), bloodlineCard,
  "Removing ecotype observation must not remove existing bloodline observation");

console.log("ecotype-observer.test: PASS");
