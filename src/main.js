(() => {
  "use strict";

  const WORLD = Object.freeze({
    width: 960,
    height: 600,
    fixedStepMs: 50,
    yearsPerStep: 0.08,
    maxFlora: 350,
    maxAnimals: 220,
    missionYears: 300,
    seasonLength: 80,
    winterStart: 60,
  });

  const SPECIES = Object.freeze({
    flora: {
      label: "萌芽",
      placementCount: 8,
      color: "#68ad7d",
    },
    grazer: {
      label: "食草兽",
      placementCount: 4,
      color: "#e9b554",
      moveSpeed: 14,
      energyDrain: 1.05,
      maxEnergy: 132,
      reproductionEnergy: 100,
      reproductionChance: 0.036,
      reproductionCooldown: 12,
      minReproductionAge: 8,
      foodEnergy: 30,
      senseRadius: 210,
    },
    hunter: {
      label: "猎食兽",
      placementCount: 2,
      color: "#8065ad",
      moveSpeed: 16.5,
      energyDrain: 1.18,
      maxEnergy: 166,
      reproductionEnergy: 126,
      reproductionChance: 0.022,
      reproductionCooldown: 16,
      minReproductionAge: 11,
      foodEnergy: 58,
      senseRadius: 270,
    },
  });

  const canvas = document.querySelector("#worldCanvas");
  const ctx = canvas.getContext("2d");

  const elements = {
    playToggle: document.querySelector("#playToggle"),
    playIcon: document.querySelector("#playIcon"),
    playLabel: document.querySelector("#playLabel"),
    resetButton: document.querySelector("#resetButton"),
    clearButton: document.querySelector("#clearButton"),
    speedButtons: [...document.querySelectorAll(".speed-button")],
    speciesButtons: [...document.querySelectorAll(".species-button")],
    placementHint: document.querySelector("#placementHint"),
    growthRule: document.querySelector("#growthRule"),
    fertilityRule: document.querySelector("#fertilityRule"),
    seasonsRule: document.querySelector("#seasonsRule"),
    growthValue: document.querySelector("#growthValue"),
    fertilityValue: document.querySelector("#fertilityValue"),
    missionProgress: document.querySelector("#missionProgress"),
    missionYears: document.querySelector("#missionYears"),
    missionState: document.querySelector("#missionState"),
    worldAge: document.querySelector("#worldAge"),
    seasonLabel: document.querySelector("#seasonLabel"),
    pauseBanner: document.querySelector("#pauseBanner"),
    worldToast: document.querySelector("#worldToast"),
    floraCount: document.querySelector("#floraCount"),
    grazerCount: document.querySelector("#grazerCount"),
    hunterCount: document.querySelector("#hunterCount"),
    floraTrend: document.querySelector("#floraTrend"),
    grazerTrend: document.querySelector("#grazerTrend"),
    hunterTrend: document.querySelector("#hunterTrend"),
    balanceLabel: document.querySelector("#balanceLabel"),
    balanceFill: document.querySelector("#balanceFill"),
    balanceAdvice: document.querySelector("#balanceAdvice"),
    eventLog: document.querySelector("#eventLog"),
  };

  const state = {
    running: false,
    speed: 1,
    selectedSpecies: "flora",
    year: 0,
    coexistenceYears: 0,
    missionComplete: false,
    season: "mild",
    flora: [],
    grazers: [],
    hunters: [],
    rules: {
      growth: 1,
      fertility: 1,
      harshSeasons: true,
    },
    events: [],
    effects: [],
    decor: [],
    pointer: {
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      inside: false,
    },
    plantGrowthBudget: 0,
    nextEntityId: 1,
    lastMilestone: 0,
    presence: {
      flora: false,
      grazer: false,
      hunter: false,
    },
    trendBaseline: {
      year: 0,
      flora: 0,
      grazer: 0,
      hunter: 0,
    },
    trendValues: {
      flora: "稳定",
      grazer: "稳定",
      hunter: "稳定",
    },
  };

  let lastFrameTime = performance.now();
  let accumulator = 0;
  let lastUiUpdate = 0;
  let toastTimer = null;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function normalizeAngle(angle) {
    let result = angle;
    while (result > Math.PI) result -= Math.PI * 2;
    while (result < -Math.PI) result += Math.PI * 2;
    return result;
  }

  function turnToward(current, target, amount) {
    const difference = normalizeAngle(target - current);
    return current + clamp(difference, -amount, amount);
  }

  function createDecor() {
    state.decor = [];
    const colors = [
      "rgba(239, 231, 178, 0.15)",
      "rgba(91, 151, 121, 0.12)",
      "rgba(99, 153, 172, 0.11)",
      "rgba(255, 255, 255, 0.12)",
    ];

    for (let index = 0; index < 24; index += 1) {
      state.decor.push({
        x: randomBetween(20, WORLD.width - 20),
        y: randomBetween(20, WORLD.height - 20),
        radiusX: randomBetween(28, 96),
        radiusY: randomBetween(18, 60),
        rotation: randomBetween(0, Math.PI),
        color: colors[index % colors.length],
      });
    }
  }

  function createFlora(x, y, options = {}) {
    if (state.flora.length >= WORLD.maxFlora) return null;

    const spread = options.spread ?? 0;
    const flora = {
      id: state.nextEntityId++,
      type: "flora",
      x: clamp(x + randomBetween(-spread, spread), 10, WORLD.width - 10),
      y: clamp(y + randomBetween(-spread, spread), 10, WORLD.height - 10),
      size: randomBetween(4.5, 7.5),
      phase: randomBetween(0, Math.PI * 2),
    };

    state.flora.push(flora);
    return flora;
  }

  function createAnimal(type, x, y, options = {}) {
    const totalAnimals = state.grazers.length + state.hunters.length;
    if (totalAnimals >= WORLD.maxAnimals) return null;

    const spread = options.spread ?? 0;
    const isGrazer = type === "grazer";
    const animal = {
      id: state.nextEntityId++,
      type,
      x: clamp(x + randomBetween(-spread, spread), 14, WORLD.width - 14),
      y: clamp(y + randomBetween(-spread, spread), 14, WORLD.height - 14),
      angle: randomBetween(-Math.PI, Math.PI),
      age: options.age ?? randomBetween(0, 18),
      energy: options.energy ?? (isGrazer ? randomBetween(76, 96) : randomBetween(92, 112)),
      lifespan: isGrazer ? randomBetween(118, 168) : randomBetween(132, 186),
      reproductionCooldown: randomBetween(0, 7),
      wanderTimer: randomBetween(1, 7),
      bobPhase: randomBetween(0, Math.PI * 2),
    };

    if (isGrazer) state.grazers.push(animal);
    else state.hunters.push(animal);
    return animal;
  }

  function placeSpecies(type, x, y, announce = true) {
    const config = SPECIES[type];
    let created = 0;

    for (let index = 0; index < config.placementCount; index += 1) {
      const entity = type === "flora"
        ? createFlora(x, y, { spread: 28 })
        : createAnimal(type, x, y, { spread: 24 });
      if (entity) created += 1;
    }

    if (created > 0) {
      state.effects.push({ x, y, age: 0, color: config.color });
      if (announce) {
        showToast(`投放了 ${created} 个${config.label}`);
      }
      checkPresenceChanges();
      updateUi(true);
      return;
    }

    showToast(type === "flora" ? "萌芽数量已达到世界上限" : "动物数量已达到世界上限");
  }

  function seedWorld() {
    state.running = false;
    state.year = 0;
    state.coexistenceYears = 0;
    state.missionComplete = false;
    state.season = "mild";
    state.flora = [];
    state.grazers = [];
    state.hunters = [];
    state.effects = [];
    state.events = [];
    state.plantGrowthBudget = 0;
    state.nextEntityId = 1;
    state.lastMilestone = 0;
    state.presence = { flora: false, grazer: false, hunter: false };
    createDecor();

    for (let patch = 0; patch < 7; patch += 1) {
      const patchX = randomBetween(90, WORLD.width - 90);
      const patchY = randomBetween(80, WORLD.height - 80);
      for (let plant = 0; plant < 9; plant += 1) {
        createFlora(patchX, patchY, { spread: 50 });
      }
    }

    for (let index = 0; index < 14; index += 1) {
      createAnimal("grazer", randomBetween(80, WORLD.width - 80), randomBetween(70, WORLD.height - 70));
    }

    for (let index = 0; index < 4; index += 1) {
      createAnimal("hunter", randomBetween(80, WORLD.width - 80), randomBetween(70, WORLD.height - 70));
    }

    state.presence = getPresence();
    state.trendBaseline = {
      year: 0,
      flora: state.flora.length,
      grazer: state.grazers.length,
      hunter: state.hunters.length,
    };
    state.trendValues = { flora: "稳定", grazer: "稳定", hunter: "稳定" };

    addEvent("一个新的示范世界被创造。三类生命正在等待时间开始。", 0);
    addEvent("创世命题：让三类生命连续共存300年。", 0);
    syncPlaybackControls();
    updateUi(true);
  }

  function clearLife() {
    state.flora = [];
    state.grazers = [];
    state.hunters = [];
    state.coexistenceYears = 0;
    state.missionComplete = false;
    state.plantGrowthBudget = 0;
    state.presence = { flora: false, grazer: false, hunter: false };
    addEvent("所有生命被移出世界，时间与法则保持不变。", state.year);
    showToast("世界已清空，可以重新设计生态");
    updateUi(true);
  }

  function getPresence() {
    return {
      flora: state.flora.length > 0,
      grazer: state.grazers.length > 0,
      hunter: state.hunters.length > 0,
    };
  }

  function checkPresenceChanges() {
    const current = getPresence();

    for (const type of ["flora", "grazer", "hunter"]) {
      if (state.presence[type] && !current[type]) {
        addEvent(`${SPECIES[type].label}在世界中灭绝。`, state.year);
      } else if (!state.presence[type] && current[type] && state.year > 0.01) {
        addEvent(`${SPECIES[type].label}重新出现在世界中。`, state.year);
      }
    }

    state.presence = current;
  }

  function getSeason() {
    if (!state.rules.harshSeasons) return "mild";
    const seasonYear = state.year % WORLD.seasonLength;
    return seasonYear >= WORLD.winterStart ? "winter" : "mild";
  }

  function updateSeason() {
    const nextSeason = getSeason();
    if (nextSeason === state.season) return;

    state.season = nextSeason;
    if (nextSeason === "winter") {
      addEvent("严冬降临：植物生长减缓，动物消耗增加。", state.year);
    } else {
      addEvent("严冬结束，世界重新进入温和季。", state.year);
    }
  }

  function growFlora(dt) {
    if (state.flora.length === 0 || state.flora.length >= WORLD.maxFlora) return;

    const winterMultiplier = state.season === "winter" ? 0.2 : 1;
    const crowding = Math.pow(1 - state.flora.length / WORLD.maxFlora, 1.25);
    const colonyStrength = 0.55 + Math.min(state.flora.length, 120) / 75;
    state.plantGrowthBudget += dt * 0.68 * state.rules.growth * winterMultiplier * crowding * colonyStrength;

    let safety = 0;
    while (state.plantGrowthBudget >= 1 && state.flora.length < WORLD.maxFlora && safety < 10) {
      const parent = state.flora[Math.floor(Math.random() * state.flora.length)];
      createFlora(parent.x, parent.y, { spread: randomBetween(10, 30) });
      state.plantGrowthBudget -= 1;
      safety += 1;
    }
  }

  function findNearest(source, targets, radius) {
    let nearest = null;
    let nearestDistance = radius * radius;

    for (const target of targets) {
      const currentDistance = distanceSquared(source, target);
      if (currentDistance < nearestDistance) {
        nearestDistance = currentDistance;
        nearest = target;
      }
    }

    return nearest;
  }

  function moveAnimal(animal, desiredAngle, speed, dt) {
    animal.angle = turnToward(animal.angle, desiredAngle, 1.8 * dt + 0.08);
    animal.x += Math.cos(animal.angle) * speed * dt;
    animal.y += Math.sin(animal.angle) * speed * dt;

    const margin = 12;
    if (animal.x < margin || animal.x > WORLD.width - margin) {
      animal.angle = Math.PI - animal.angle;
      animal.x = clamp(animal.x, margin, WORLD.width - margin);
    }
    if (animal.y < margin || animal.y > WORLD.height - margin) {
      animal.angle = -animal.angle;
      animal.y = clamp(animal.y, margin, WORLD.height - margin);
    }
  }

  function wander(animal, config, dt) {
    animal.wanderTimer -= dt;
    if (animal.wanderTimer <= 0) {
      animal.angle += randomBetween(-1.3, 1.3);
      animal.wanderTimer = randomBetween(2, 8);
    }
    moveAnimal(animal, animal.angle, config.moveSpeed * 0.62, dt);
  }

  function reproduce(parent, type) {
    const config = SPECIES[type];
    const parentCollection = type === "grazer" ? state.grazers : state.hunters;
    if (state.grazers.length + state.hunters.length >= WORLD.maxAnimals) return false;

    const childEnergy = parent.energy * 0.42;
    parent.energy *= 0.56;
    parent.reproductionCooldown = config.reproductionCooldown;

    const child = createAnimal(type, parent.x, parent.y, {
      spread: 13,
      age: 0,
      energy: childEnergy,
    });

    if (!child) return false;
    child.reproductionCooldown = config.reproductionCooldown * 0.7;
    parentCollection[parentCollection.length - 1] = child;
    return true;
  }

  function updateGrazers(dt) {
    const config = SPECIES.grazer;
    const winterDrain = state.season === "winter" ? 1.42 : 1;

    for (let index = state.grazers.length - 1; index >= 0; index -= 1) {
      const grazer = state.grazers[index];
      grazer.age += dt;
      grazer.energy -= config.energyDrain * winterDrain * dt;
      grazer.reproductionCooldown = Math.max(0, grazer.reproductionCooldown - dt);

      const threat = state.hunters.length > 0 ? findNearest(grazer, state.hunters, 76) : null;
      if (threat) {
        const fleeAngle = Math.atan2(grazer.y - threat.y, grazer.x - threat.x);
        moveAnimal(grazer, fleeAngle, config.moveSpeed * 1.28, dt);
        grazer.energy -= 0.18 * dt;
      } else {
        const food = state.flora.length > 0 ? findNearest(grazer, state.flora, config.senseRadius) : null;
        if (food) {
          const foodAngle = Math.atan2(food.y - grazer.y, food.x - grazer.x);
          moveAnimal(grazer, foodAngle, config.moveSpeed, dt);

          if (distanceSquared(grazer, food) < 130) {
            const foodIndex = state.flora.indexOf(food);
            if (foodIndex >= 0) {
              state.flora.splice(foodIndex, 1);
              grazer.energy = Math.min(config.maxEnergy, grazer.energy + config.foodEnergy);
            }
          }
        } else {
          wander(grazer, config, dt);
        }
      }

      const canReproduce = grazer.energy >= config.reproductionEnergy
        && grazer.age >= config.minReproductionAge
        && grazer.reproductionCooldown <= 0;

      if (canReproduce && Math.random() < config.reproductionChance * state.rules.fertility * dt) {
        reproduce(grazer, "grazer");
      }

      if (grazer.energy <= 0 || grazer.age >= grazer.lifespan) {
        state.grazers.splice(index, 1);
      }
    }
  }

  function updateHunters(dt) {
    const config = SPECIES.hunter;
    const winterDrain = state.season === "winter" ? 1.34 : 1;

    for (let index = state.hunters.length - 1; index >= 0; index -= 1) {
      const hunter = state.hunters[index];
      hunter.age += dt;
      hunter.energy -= config.energyDrain * winterDrain * dt;
      hunter.reproductionCooldown = Math.max(0, hunter.reproductionCooldown - dt);

      const prey = state.grazers.length > 0 ? findNearest(hunter, state.grazers, config.senseRadius) : null;
      if (prey) {
        const preyAngle = Math.atan2(prey.y - hunter.y, prey.x - hunter.x);
        moveAnimal(hunter, preyAngle, config.moveSpeed, dt);

        if (distanceSquared(hunter, prey) < 165) {
          const preyIndex = state.grazers.indexOf(prey);
          if (preyIndex >= 0) {
            state.grazers.splice(preyIndex, 1);
            hunter.energy = Math.min(config.maxEnergy, hunter.energy + config.foodEnergy);
            state.effects.push({ x: prey.x, y: prey.y, age: 0, color: "#8b70b7" });
          }
        }
      } else {
        wander(hunter, config, dt);
      }

      const canReproduce = hunter.energy >= config.reproductionEnergy
        && hunter.age >= config.minReproductionAge
        && hunter.reproductionCooldown <= 0;

      if (canReproduce && Math.random() < config.reproductionChance * state.rules.fertility * dt) {
        reproduce(hunter, "hunter");
      }

      if (hunter.energy <= 0 || hunter.age >= hunter.lifespan) {
        state.hunters.splice(index, 1);
      }
    }
  }

  function updateMission(dt) {
    const allPresent = state.flora.length > 0 && state.grazers.length > 0 && state.hunters.length > 0;

    if (state.missionComplete) return;

    if (allPresent) {
      state.coexistenceYears += dt;
      if (state.coexistenceYears >= WORLD.missionYears) {
        state.coexistenceYears = WORLD.missionYears;
        state.missionComplete = true;
        addEvent("创世命题完成：三类生命连续共存了300年。", state.year);
        showToast("创世命题完成！这个世界证明了长期共存的可能。", 4200);
      }
    } else if (state.coexistenceYears > 0) {
      state.coexistenceYears = 0;
    }
  }

  function updateMilestones() {
    const milestone = Math.floor(state.year / 50) * 50;
    if (milestone <= 0 || milestone <= state.lastMilestone) return;

    state.lastMilestone = milestone;
    addEvent(`世界度过了第${milestone}年。`, state.year);
  }

  function updateTrends() {
    if (state.year - state.trendBaseline.year < 10) return;

    const current = {
      flora: state.flora.length,
      grazer: state.grazers.length,
      hunter: state.hunters.length,
    };

    for (const type of ["flora", "grazer", "hunter"]) {
      const difference = current[type] - state.trendBaseline[type];
      const threshold = Math.max(2, state.trendBaseline[type] * 0.12);
      state.trendValues[type] = difference > threshold ? "上升" : difference < -threshold ? "下降" : "稳定";
    }

    state.trendBaseline = {
      year: state.year,
      ...current,
    };
  }

  function updateWorld(dt) {
    state.year += dt;
    updateSeason();
    growFlora(dt);
    updateGrazers(dt);
    updateHunters(dt);
    updateMission(dt);
    updateMilestones();
    updateTrends();
    checkPresenceChanges();
  }

  function getSubsteps(speed) {
    if (speed >= 12) return 4;
    if (speed >= 4) return 2;
    return 1;
  }

  function addEvent(message, year = state.year) {
    state.events.unshift({
      id: `${Date.now()}-${Math.random()}`,
      year: Math.max(0, year),
      message,
    });
    state.events = state.events.slice(0, 9);
    renderEventLog();
  }

  function renderEventLog() {
    const fragment = document.createDocumentFragment();
    for (const event of state.events) {
      const item = document.createElement("li");
      const time = document.createElement("time");
      time.textContent = `第 ${Math.floor(event.year)} 年`;
      const text = document.createElement("span");
      text.textContent = event.message;
      item.append(time, text);
      fragment.append(item);
    }
    elements.eventLog.replaceChildren(fragment);
  }

  function showToast(message, duration = 1900) {
    elements.worldToast.textContent = message;
    elements.worldToast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      elements.worldToast.classList.remove("is-visible");
    }, duration);
  }

  function trendText(value) {
    if (value === "上升") return "↗ 上升";
    if (value === "下降") return "↘ 下降";
    return "— 稳定";
  }

  function calculateBalance() {
    const flora = state.flora.length;
    const grazers = state.grazers.length;
    const hunters = state.hunters.length;
    const presentCount = Number(flora > 0) + Number(grazers > 0) + Number(hunters > 0);

    if (presentCount === 0) {
      return {
        score: 0,
        label: "寂静世界",
        advice: "投放生命后开始时间，观察它们如何彼此影响。",
      };
    }

    let score = (presentCount / 3) * 45;
    const plantPerGrazer = grazers > 0 ? flora / grazers : 0;
    const grazerPerHunter = hunters > 0 ? grazers / hunters : 0;

    if (flora > 0 && grazers > 0) {
      score += plantPerGrazer >= 2.5 && plantPerGrazer <= 18 ? 25 : 8;
    }
    if (grazers > 0 && hunters > 0) {
      score += grazerPerHunter >= 2.5 && grazerPerHunter <= 9 ? 25 : 8;
    }
    if (presentCount === 3) score += 5;
    score = clamp(score, 0, 100);

    if (flora === 0) {
      return { score, label: "生产者灭绝", advice: "先补充萌芽，否则食草兽会很快耗尽能量。" };
    }
    if (grazers === 0 && hunters > 0) {
      return { score, label: "猎物断层", advice: "猎食兽失去食物，补充食草兽或等待猎食兽自然减少。" };
    }
    if (hunters === 0 && grazers > 0) {
      return { score, label: "缺少捕食者", advice: "食草兽可能迅速消耗萌芽，可少量投放猎食兽。" };
    }
    if (hunters > Math.max(2, grazers * 0.42)) {
      return { score, label: "捕食压力过高", advice: "猎食兽比例过高，食草兽有灭绝风险。" };
    }
    if (grazers > Math.max(10, flora * 0.7)) {
      return { score, label: "啃食压力过高", advice: "食草兽正在快速消耗萌芽，可提高资源繁盛度。" };
    }
    if (score >= 88) {
      return { score, label: "生态稳定", advice: "三层食物关系较平衡，继续观察季节变化是否会打破稳定。" };
    }
    if (presentCount === 3) {
      return { score, label: "脆弱共存", advice: "三类生命仍在共存，但比例容易因冬季或繁殖波动而失衡。" };
    }
    return { score, label: "生态不完整", advice: "补齐缺失物种，才能开始累计共存年限。" };
  }

  function updateUi(force = false) {
    const now = performance.now();
    if (!force && now - lastUiUpdate < 100) return;
    lastUiUpdate = now;

    const flora = state.flora.length;
    const grazers = state.grazers.length;
    const hunters = state.hunters.length;
    const progress = state.missionComplete ? 100 : (state.coexistenceYears / WORLD.missionYears) * 100;
    const allPresent = flora > 0 && grazers > 0 && hunters > 0;
    const balance = calculateBalance();

    elements.worldAge.textContent = `第 ${Math.floor(state.year)} 年`;
    elements.seasonLabel.textContent = state.season === "winter" ? "严冬" : "温和季";
    elements.seasonLabel.style.color = state.season === "winter" ? "#d5effa" : "#f6dc9a";

    elements.floraCount.textContent = String(flora);
    elements.grazerCount.textContent = String(grazers);
    elements.hunterCount.textContent = String(hunters);
    elements.floraTrend.textContent = trendText(state.trendValues.flora);
    elements.grazerTrend.textContent = trendText(state.trendValues.grazer);
    elements.hunterTrend.textContent = trendText(state.trendValues.hunter);

    elements.missionProgress.style.width = `${clamp(progress, 0, 100)}%`;
    elements.missionYears.textContent = `${Math.floor(state.coexistenceYears)} / ${WORLD.missionYears} 年`;
    elements.missionState.textContent = state.missionComplete
      ? "命题完成"
      : allPresent
        ? "正在累计"
        : "等待三类生命";

    elements.balanceLabel.textContent = balance.label;
    elements.balanceFill.style.width = `${balance.score}%`;
    elements.balanceAdvice.textContent = balance.advice;
  }

  function syncPlaybackControls() {
    elements.playToggle.setAttribute("aria-pressed", String(state.running));
    elements.playIcon.textContent = state.running ? "Ⅱ" : "▶";
    elements.playLabel.textContent = state.running ? "暂停时间" : state.year > 0 ? "继续时间" : "开始时间";
    elements.pauseBanner.classList.toggle("is-hidden", state.running);
    elements.pauseBanner.textContent = state.year > 0 ? "时间已暂停" : "时间尚未开始";

    for (const button of elements.speedButtons) {
      const active = Number(button.dataset.speed) === state.speed;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function setRunning(running) {
    state.running = running;
    accumulator = 0;
    lastFrameTime = performance.now();
    syncPlaybackControls();
  }

  function toggleRunning() {
    setRunning(!state.running);
  }

  function selectSpecies(type) {
    state.selectedSpecies = type;
    const config = SPECIES[type];

    for (const button of elements.speciesButtons) {
      const active = button.dataset.species === type;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }

    const description = type === "flora"
      ? "点击世界投放一片植物。"
      : type === "grazer"
        ? "点击世界投放一小群食草兽。"
        : "点击世界投放一对猎食兽。";
    elements.placementHint.textContent = `已选择${config.label}：${description}`;
  }

  function canvasCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WORLD.width,
      y: ((event.clientY - rect.top) / rect.height) * WORLD.height,
    };
  }

  function bindEvents() {
    elements.playToggle.addEventListener("click", toggleRunning);

    for (const button of elements.speedButtons) {
      button.addEventListener("click", () => {
        state.speed = Number(button.dataset.speed);
        syncPlaybackControls();
        showToast(`世界速度设为 ${state.speed}×`);
      });
    }

    for (const button of elements.speciesButtons) {
      button.addEventListener("click", () => selectSpecies(button.dataset.species));
    }

    elements.growthRule.addEventListener("input", () => {
      state.rules.growth = Number(elements.growthRule.value);
      elements.growthValue.value = `${state.rules.growth.toFixed(1)}×`;
    });
    elements.growthRule.addEventListener("change", () => {
      addEvent(`世界法则改变：资源繁盛度调整为${state.rules.growth.toFixed(1)}×。`);
    });

    elements.fertilityRule.addEventListener("input", () => {
      state.rules.fertility = Number(elements.fertilityRule.value);
      elements.fertilityValue.value = `${state.rules.fertility.toFixed(1)}×`;
    });
    elements.fertilityRule.addEventListener("change", () => {
      addEvent(`世界法则改变：生命繁殖倾向调整为${state.rules.fertility.toFixed(1)}×。`);
    });

    elements.seasonsRule.addEventListener("change", () => {
      state.rules.harshSeasons = elements.seasonsRule.checked;
      const message = state.rules.harshSeasons ? "严酷季节重新生效。" : "严酷季节被关闭，世界将保持温和。";
      addEvent(`世界法则改变：${message}`);
      updateSeason();
      updateUi(true);
    });

    elements.resetButton.addEventListener("click", () => {
      seedWorld();
      showToast("示范世界已重置");
    });

    elements.clearButton.addEventListener("click", clearLife);

    canvas.addEventListener("pointermove", (event) => {
      const point = canvasCoordinates(event);
      state.pointer = { ...point, inside: true };
    });

    canvas.addEventListener("pointerleave", () => {
      state.pointer.inside = false;
    });

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const point = canvasCoordinates(event);
      state.pointer = { ...point, inside: true };
      placeSpecies(state.selectedSpecies, point.x, point.y);
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && event.target === document.body) {
        event.preventDefault();
        toggleRunning();
      }
    });

    document.addEventListener("visibilitychange", () => {
      lastFrameTime = performance.now();
      accumulator = 0;
    });
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    gradient.addColorStop(0, state.season === "winter" ? "#a9c7c5" : "#b8d8b5");
    gradient.addColorStop(0.55, state.season === "winter" ? "#c9d8cd" : "#cdddb0");
    gradient.addColorStop(1, state.season === "winter" ? "#aabfc0" : "#9fc8ad");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    for (const patch of state.decor) {
      ctx.save();
      ctx.translate(patch.x, patch.y);
      ctx.rotate(patch.rotation);
      ctx.fillStyle = patch.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, patch.radiusX, patch.radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(49, 86, 70, 0.045)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD.height);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD.width, y);
      ctx.stroke();
    }

    if (state.season === "winter") {
      ctx.fillStyle = "rgba(235, 246, 244, 0.12)";
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    }
  }

  function drawFlora(flora, timestamp) {
    const sway = Math.sin(timestamp * 0.0018 + flora.phase) * 0.18;
    ctx.save();
    ctx.translate(flora.x, flora.y);
    ctx.rotate(sway);
    ctx.lineCap = "round";
    ctx.strokeStyle = state.season === "winter" ? "#5f8975" : "#417f59";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, flora.size * 0.8);
    ctx.lineTo(0, -flora.size * 0.65);
    ctx.stroke();

    ctx.fillStyle = state.season === "winter" ? "#80aa91" : "#68b77d";
    ctx.beginPath();
    ctx.ellipse(-flora.size * 0.42, -flora.size * 0.1, flora.size * 0.58, flora.size * 0.3, -0.55, 0, Math.PI * 2);
    ctx.ellipse(flora.size * 0.42, -flora.size * 0.5, flora.size * 0.58, flora.size * 0.3, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGrazer(animal, timestamp) {
    const bob = Math.sin(timestamp * 0.006 + animal.bobPhase) * 1.2;
    ctx.save();
    ctx.translate(animal.x, animal.y + bob);
    ctx.rotate(animal.angle);

    ctx.fillStyle = "rgba(53, 58, 44, 0.16)";
    ctx.beginPath();
    ctx.ellipse(-1, 7, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e6ad4a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f5cc73";
    ctx.beginPath();
    ctx.arc(7, -1, 5.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d08b38";
    ctx.beginPath();
    ctx.ellipse(6, -6, 2.2, 4.5, -0.35, 0, Math.PI * 2);
    ctx.ellipse(10, -5.5, 2.2, 4.5, 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#3b4038";
    ctx.beginPath();
    ctx.arc(9.5, -2, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#9b6d35";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-5, 5);
    ctx.lineTo(-6, 9);
    ctx.moveTo(3, 5);
    ctx.lineTo(2, 9);
    ctx.stroke();
    ctx.restore();
  }

  function drawHunter(animal, timestamp) {
    const bob = Math.sin(timestamp * 0.007 + animal.bobPhase) * 0.9;
    ctx.save();
    ctx.translate(animal.x, animal.y + bob);
    ctx.rotate(animal.angle);

    ctx.strokeStyle = "#5c4787";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, 2);
    ctx.quadraticCurveTo(-15, 8, -18, 1);
    ctx.stroke();

    ctx.fillStyle = "rgba(43, 43, 56, 0.18)";
    ctx.beginPath();
    ctx.ellipse(-1, 8, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#7960aa";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-2, -9);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-2, 9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#9b84c6";
    ctx.beginPath();
    ctx.moveTo(10, -2);
    ctx.lineTo(4, -10);
    ctx.lineTo(1, -3);
    ctx.moveTo(10, 2);
    ctx.lineTo(4, 10);
    ctx.lineTo(1, 3);
    ctx.fill();

    ctx.fillStyle = "#f6e7a9";
    ctx.beginPath();
    ctx.arc(6, -2.7, 1.25, 0, Math.PI * 2);
    ctx.arc(6, 2.7, 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(dtSeconds) {
    for (let index = state.effects.length - 1; index >= 0; index -= 1) {
      const effect = state.effects[index];
      effect.age += dtSeconds;
      const progress = effect.age / 0.7;
      if (progress >= 1) {
        state.effects.splice(index, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = 3 - progress * 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 8 + progress * 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlacementPreview() {
    if (!state.pointer.inside) return;
    const config = SPECIES[state.selectedSpecies];
    const radius = state.selectedSpecies === "flora" ? 30 : 25;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.pointer.x, state.pointer.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.restore();
  }

  function render(timestamp, frameDeltaSeconds) {
    ctx.clearRect(0, 0, WORLD.width, WORLD.height);
    drawBackground();

    for (const flora of state.flora) drawFlora(flora, timestamp);
    for (const grazer of state.grazers) drawGrazer(grazer, timestamp);
    for (const hunter of state.hunters) drawHunter(hunter, timestamp);

    drawEffects(frameDeltaSeconds);
    drawPlacementPreview();
  }

  function gameLoop(timestamp) {
    const elapsed = Math.min(250, timestamp - lastFrameTime);
    const frameDeltaSeconds = elapsed / 1000;
    lastFrameTime = timestamp;

    if (state.running) {
      accumulator += elapsed;
      let safety = 0;
      while (accumulator >= WORLD.fixedStepMs && safety < 5) {
        const substeps = getSubsteps(state.speed);
        const dt = (WORLD.yearsPerStep * state.speed) / substeps;
        for (let step = 0; step < substeps; step += 1) {
          updateWorld(dt);
        }
        accumulator -= WORLD.fixedStepMs;
        safety += 1;
      }
    }

    render(timestamp, frameDeltaSeconds);
    updateUi();
    requestAnimationFrame(gameLoop);
  }

  function initialize() {
    bindEvents();
    selectSpecies("flora");
    seedWorld();
    requestAnimationFrame(gameLoop);
  }

  initialize();
})();
