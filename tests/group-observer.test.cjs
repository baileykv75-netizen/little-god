const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

class FakeClassList {
  constructor(element) { this.element = element; }
  toggle(name, force) {
    const names = new Set(this.element.className.split(/\s+/).filter(Boolean));
    if (force) names.add(name); else names.delete(name);
    this.element.className = [...names].join(" ");
  }
}

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = "";
    this.width = 960;
    this.height = 600;
    this.classList = new FakeClassList(this);
  }
  append(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  getContext() { return context2d; }
}

const drawCalls = [];
const context2d = {
  clearRect(...args) { drawCalls.push(["clearRect", ...args]); },
  save() { drawCalls.push(["save"]); },
  restore() { drawCalls.push(["restore"]); },
  setLineDash(value) { drawCalls.push(["dash", ...value]); },
  beginPath() { drawCalls.push(["beginPath"]); },
  arc(...args) { drawCalls.push(["arc", ...args]); },
  fill() { drawCalls.push(["fill"]); },
  stroke() { drawCalls.push(["stroke"]); },
  fillText(...args) { drawCalls.push(["fillText", ...args]); },
  set fillStyle(value) { this._fillStyle = value; },
  set strokeStyle(value) { this._strokeStyle = value; },
  set lineWidth(value) { this._lineWidth = value; },
  set font(value) { this._font = value; },
  set textAlign(value) { this._textAlign = value; },
  set textBaseline(value) { this._textBaseline = value; },
};

const baseCanvas = new FakeElement("canvas");
const frame = new FakeElement("div");
const cameraControls = new FakeElement("div");
const loadListeners = [];
let rafCallback = null;
let refreshed = 0;
let toast = "";

function animal(id, type, x, y, groupId, role, support) {
  return {
    id,
    type,
    x,
    y,
    groupBehavior: { groupId, role, support },
  };
}

const LittleGod = {
  state: {
    grazers: [
      animal(1, "grazer", 100, 100, "herd-1", "herd", 0.7),
      animal(2, "grazer", 160, 100, "herd-1", "herd", 0.7),
      animal(3, "grazer", 130, 150, "herd-1", "herd", 0.7),
    ],
    hunters: [
      animal(10, "hunter", 500, 400, "pack-10", "pack", 0.8),
      animal(11, "hunter", 560, 420, "pack-10", "pack", 0.8),
    ],
  },
  camera: {
    zoom: 1.2,
    apply(context) { context.save(); context.restore(); },
  },
  refreshSocialGroups() { refreshed += 1; },
  showToast(message) { toast = message; },
};

const document = {
  querySelector(selector) {
    if (selector === "#worldCanvas") return baseCanvas;
    if (selector === ".world-frame") return frame;
    if (selector === "#cameraControls") return cameraControls;
    return null;
  },
  createElement(tag) { return new FakeElement(tag); },
};

const window = {
  LittleGod,
  addEventListener(type, listener) { if (type === "load") loadListeners.push(listener); },
  requestAnimationFrame(callback) { rafCallback = callback; return 1; },
};

const sandbox = { window, document, console, Object, Map, Set, Number, String, Boolean, Math };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync("src/genesis/group-observer-v1.js", "utf8"),
  sandbox,
  { filename: "src/genesis/group-observer-v1.js" },
);

assert.equal(LittleGod.groupObserverModel.version, "group-observer-v1");
assert.equal(LittleGod.groupObserverModel.toggleable, true);
assert.equal(LittleGod.getGroupOverlaySnapshot().groups.length, 2);
assert.deepEqual(LittleGod.getGroupOverlaySnapshot().groups[0].memberIds, [1, 2, 3]);
assert.deepEqual(LittleGod.getGroupOverlaySnapshot().groups[1].memberIds, [10, 11]);

for (const listener of loadListeners) listener();
assert.equal(frame.children.length, 1);
assert.equal(cameraControls.children.length, 1);
assert.equal(typeof rafCallback, "function");
assert.equal(LittleGod.getGroupObserverDiagnostics().mounted, true);

LittleGod.setGroupOverlayEnabled(true);
assert.equal(refreshed, 1);
assert.equal(LittleGod.getGroupObserverDiagnostics().enabled, true);
assert.ok(drawCalls.some((call) => call[0] === "arc"));
assert.ok(drawCalls.some((call) => call[0] === "fillText" && call[1] === "兽群 3"));
assert.ok(drawCalls.some((call) => call[0] === "fillText" && call[1] === "猎群 2"));
assert.equal(cameraControls.children[0].attributes["aria-pressed"], "true");
assert.equal(cameraControls.children[0].textContent, "隐藏群体");

cameraControls.children[0].listeners.get("click")();
assert.equal(LittleGod.getGroupObserverDiagnostics().enabled, false);
assert.equal(toast, "已隐藏群体边界");

console.log("group-observer.test: PASS");
