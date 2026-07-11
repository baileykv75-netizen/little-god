(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Genesis view-v2 requires core.js");

  const { state: s, WORLD, SEASONS, PATCH, SPECIES } = LG;
  const canvas = document.querySelector("#worldCanvas");
  const ctx = canvas.getContext("2d");

  const el = {
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
    missionTime: document.querySelector("#missionTime"),
    missionGrazerBirths: document.querySelector("#missionGrazerBirths"),
    missionHunterBirths: document.querySelector("#missionHunterBirths"),
    missionHunts: document.querySelector("#missionHunts"),
    missionSpring: document.querySelector("#missionSpring"),
    missionNoIntervention: document.querySelector("#missionNoIntervention"),
    worldAge: document.querySelector("#worldAge"),
    seasonLabel: document.querySelector("#seasonLabel"),
    pauseBanner: document.querySelector("#pauseBanner"),
    worldToast: document.querySelector("#worldToast"),
    floraCount: document.querySelector("#floraCount"),
    dryCount: document.querySelector("#dryCount"),
    seedCount: document.querySelector("#seedCount"),
    dryReserveText: document.querySelector("#dryReserveText"),
    seedReserveText: document.querySelector("#seedReserveText"),
    grazerCount: document.querySelector("#grazerCount"),
    hunterCount: document.querySelector("#hunterCount"),
    carcassCount: document.querySelector("#carcassCount"),
    floraTrend: document.querySelector("#floraTrend"),
    grazerTrend: document.querySelector("#grazerTrend"),
    hunterTrend: document.querySelector("#hunterTrend"),
    grazerAges: document.querySelector("#grazerAges"),
    hunterAges: document.querySelector("#hunterAges"),
    huntSummary: document.querySelector("#huntSummary"),
    balanceLabel: document.querySelector("#balanceLabel"),
    balanceFill: document.querySelector("#balanceFill"),
    balanceAdvice: document.querySelector("#balanceAdvice"),
    eventLog: document.querySelector("#eventLog"),
    hudGreen: document.querySelector("#hudGreen"),
    hudDry: document.querySelector("#hudDry"),
    hudSeeds: document.querySelector("#hudSeeds"),
    ledgerYear: document.querySelector("#ledgerYear"),
    grazerBirths: document.querySelector("#grazerBirths"),
    grazerPredationDeaths: document.querySelector("#grazerPredationDeaths"),
    grazerStarvationDeaths: document.querySelector("#grazerStarvationDeaths"),
    grazerOldAgeDeaths: document.querySelector("#grazerOldAgeDeaths"),
    hunterBirths: document.querySelector("#hunterBirths"),
    hunterStarvationDeaths: document.querySelector("#hunterStarvationDeaths"),
    hunterOldAgeDeaths: document.querySelector("#hunterOldAgeDeaths"),
    huntAttempts: document.querySelector("#huntAttempts"),
    huntSuccesses: document.querySelector("#huntSuccesses"),
    huntRate: document.querySelector("#huntRate"),
  };
  LG.elements = el;

  let lastFrameTime = performance.now();
  let accumulator = 0;
  let lastUiUpdate = 0;
  let toastTimer = null;
  let spaceHeld = false;
  let spaceDragged = false;
  let pointerDown = null;
  let panState = null;

  const camera = {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    zoom: 1,
    targetZoom: 1,
    followTargetId: null,

    fitZoom() {
      return Math.max(
        0.45,
        canvas.width / WORLD.width,
        canvas.height / WORLD.height,
      );
    },

    clamp() {
      const halfWidth = canvas.width / (2 * this.zoom);
      const halfHeight = canvas.height / (2 * this.zoom);
      this.x = halfWidth >= WORLD.width / 2
        ? WORLD.width / 2
        : LG.clamp(this.x, halfWidth, WORLD.width - halfWidth);
      this.y = halfHeight >= WORLD.height / 2
        ? WORLD.height / 2
        : LG.clamp(this.y, halfHeight, WORLD.height - halfHeight);
    },

    reset() {
      this.x = WORLD.width / 2;
      this.y = WORLD.height / 2;
      this.zoom = this.fitZoom();
      this.targetZoom = this.zoom;
      this.followTargetId = null;
      this.clamp();
    },

    screenToWorld(screenX, screenY) {
      return {
        x: (screenX - canvas.width / 2) / this.zoom + this.x,
        y: (screenY - canvas.height / 2) / this.zoom + this.y,
      };
    },

    worldToScreen(worldX, worldY) {
      return {
        x: (worldX - this.x) * this.zoom + canvas.width / 2,
        y: (worldY - this.y) * this.zoom + canvas.height / 2,
      };
    },

    zoomAt(screenX, screenY, factor) {
      const before = this.screenToWorld(screenX, screenY);
      const minZoom = this.fitZoom();
      const next = LG.clamp(this.zoom * factor, minZoom, 3);
      this.zoom = next;
      this.targetZoom = next;
      const after = this.screenToWorld(screenX, screenY);
      this.x += before.x - after.x;
      this.y += before.y - after.y;
      this.followTargetId = null;
      this.clamp();
      updateCameraHud();
    },

    panBy(screenDx, screenDy) {
      this.x -= screenDx / this.zoom;
      this.y -= screenDy / this.zoom;
      this.followTargetId = null;
      this.clamp();
    },

    update() {
      if (!this.followTargetId) return;
      const target = findAnimalById(this.followTargetId);
      if (!target) {
        this.followTargetId = null;
        return;
      }
      this.x += (target.x - this.x) * 0.12;
      this.y += (target.y - this.y) * 0.12;
      this.clamp();
    },

    apply(context) {
      context.translate(canvas.width / 2, canvas.height / 2);
      context.scale(this.zoom, this.zoom);
      context.translate(-this.x, -this.y);
    },

    isVisible(item, margin = 80) {
      const point = this.worldToScreen(item.x, item.y);
      return point.x >= -margin && point.x <= canvas.width + margin
        && point.y >= -margin && point.y <= canvas.height + margin;
    },
  };

  LG.camera = camera;
  LG.screenToWorld = (x, y) => camera.screenToWorld(x, y);
  LG.worldToScreen = (x, y) => camera.worldToScreen(x, y);

  // 检查点1仅统一移动的显示尺度，G1会再将运动方程迁出视图层。
  const baseMoveAnimal = LG.moveAnimal;
  LG.moveAnimal = (animal, desiredAngle, speed, dt) => (
    baseMoveAnimal(animal, desiredAngle, speed * (WORLD.movementScale || 1), dt)
  );

  function findAnimalById(id) {
    return [...s.grazers, ...s.hunters].find((animal) => animal.id === id) || null;
  }

  function nearestAnimalAtScreen(screenX, screenY, radiusPx = 15) {
    const point = camera.screenToWorld(screenX, screenY);
    const radiusWorld = radiusPx / camera.zoom;
    let nearest = null;
    let best = radiusWorld * radiusWorld;
    for (const animal of [...s.grazers, ...s.hunters]) {
      const distance = (animal.x - point.x) ** 2 + (animal.y - point.y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = animal;
      }
    }
    return nearest;
  }

  function eventScreenPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * canvas.width,
      y: (event.clientY - rect.top) / rect.height * canvas.height,
    };
  }

  function eventWorldPoint(event) {
    const point = eventScreenPoint(event);
    return camera.screenToWorld(point.x, point.y);
  }

  LG.renderEventLog = () => {
    el.eventLog.replaceChildren();
    for (const event of s.events) {
      const item = document.createElement("li");
      const time = document.createElement("time");
      const text = document.createElement("span");
      time.textContent = `第${Math.floor(event.year) + 1}年`;
      text.textContent = event.message;
      item.append(time, text);
      el.eventLog.append(item);
    }
  };

  LG.showToast = (message, duration = 2400) => {
    el.worldToast.textContent = message;
    el.worldToast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.worldToast.classList.remove("is-visible"), duration);
  };

  function trendText(value) {
    if (value === "上升") return "↗ 上升";
    if (value === "下降") return "↘ 下降";
    if (value === "灭绝") return "× 已灭绝";
    return "— 稳定";
  }

  function setChecklist(element, complete, text) {
    element.textContent = text;
    element.classList.toggle("is-complete", complete);
    element.classList.toggle("is-pending", !complete);
  }

  LG.updateUi = (force = false) => {
    const now = performance.now();
    if (!force && now - lastUiUpdate < 100) return;
    lastUiUpdate = now;

    const totals = LG.getResourceTotals();
    const balance = LG.calculateBalance();
    const season = SEASONS[s.season];
    const criteria = LG.missionCriteria();
    const checks = [
      criteria.time,
      criteria.grazerBirths,
      criteria.hunterBirths,
      criteria.hunts,
      criteria.spring,
      criteria.noIntervention,
      criteria.minimums,
      criteria.allPresent,
    ];
    const progress = checks.filter(Boolean).length / checks.length * 100;
    const grazerAges = LG.getAgeStructure(s.grazers);
    const hunterAges = LG.getAgeStructure(s.hunters);
    const huntRate = s.ledger.huntAttempts ? s.ledger.huntSuccesses / s.ledger.huntAttempts : null;
    const plantYears = s.grazers.length
      ? (totals.green + totals.dry * 0.45) / (s.grazers.length * 55)
      : Infinity;

    el.worldAge.textContent = `第 ${Math.floor(s.year) + 1} 年 · ${(s.year % 1).toFixed(2)}`;
    el.seasonLabel.textContent = season.label;
    el.seasonLabel.style.color = season.color;
    el.floraCount.textContent = Math.round(totals.green);
    el.dryCount.textContent = Math.round(totals.dry);
    el.seedCount.textContent = Math.round(totals.seeds);
    el.dryReserveText.textContent = s.grazers.length
      ? `约${(totals.dry / (s.grazers.length * 22)).toFixed(1)}个冬季`
      : "无人消耗";
    el.seedReserveText.textContent = totals.seeds < 70
      ? "复苏储备偏低"
      : totals.seeds > 260
        ? "复苏储备充足"
        : "复苏储备正常";

    el.grazerCount.textContent = s.grazers.length;
    el.hunterCount.textContent = s.hunters.length;
    el.carcassCount.textContent = s.carcasses.length;
    el.floraTrend.textContent = trendText(s.trendValues.flora);
    el.grazerTrend.textContent = trendText(s.trendValues.grazer);
    el.hunterTrend.textContent = trendText(s.trendValues.hunter);
    el.grazerAges.textContent = `幼${grazerAges.juvenile}｜成${grazerAges.adult}｜老${grazerAges.elder}`;
    el.hunterAges.textContent = `幼${hunterAges.juvenile}｜成${hunterAges.adult}｜老${hunterAges.elder}`;
    el.huntSummary.textContent = `捕猎 ${s.ledger.huntSuccesses} / ${s.ledger.huntAttempts}`;
    el.hudGreen.textContent = Math.round(totals.green);
    el.hudDry.textContent = Math.round(totals.dry);
    el.hudSeeds.textContent = Math.round(totals.seeds);

    el.missionProgress.style.width = `${progress}%`;
    el.missionYears.textContent = `${s.coexistenceYears.toFixed(1)} / ${WORLD.missionYears} 年`;
    el.missionState.textContent = s.historicalMissionComplete
      ? criteria.allPresent ? "历史完成 · 当前仍运行" : "历史完成 · 当前已崩解"
      : !s.running && s.year === 0
        ? "等待时间开始"
        : criteria.allPresent ? "正在验证闭环" : "生态链不完整";
    setChecklist(el.missionTime, criteria.time, `自主共存 ${s.coexistenceYears.toFixed(1)} / 8 年`);
    setChecklist(el.missionGrazerBirths, criteria.grazerBirths, `食草兽后代 ${s.lifetime.grazerBirths} / 8`);
    setChecklist(el.missionHunterBirths, criteria.hunterBirths, `猎食兽后代 ${s.lifetime.hunterBirths} / 2`);
    setChecklist(el.missionHunts, criteria.hunts, `成功捕食 ${s.lifetime.huntSuccesses} / 5`);
    setChecklist(el.missionSpring, criteria.spring, `春季恢复 ${s.lifetime.springRecoveries} / 2`);
    const noIntervention = Number.isFinite(s.lastAnimalPlacementYear)
      ? Math.max(0, s.year - s.lastAnimalPlacementYear)
      : 99;
    setChecklist(
      el.missionNoIntervention,
      criteria.noIntervention,
      `未补充动物 ${Math.min(2, noIntervention).toFixed(1)} / 2 年`,
    );

    el.balanceLabel.textContent = balance.label;
    el.balanceFill.style.width = `${balance.score}%`;
    el.balanceAdvice.textContent = `${balance.advice}${Number.isFinite(plantYears)
      ? ` 当前植物储备约可供食草兽${plantYears.toFixed(1)}年。`
      : ""}`;
    el.ledgerYear.textContent = `第${s.ledger.year + 1}年`;
    el.grazerBirths.textContent = s.ledger.grazerBirths;
    el.grazerPredationDeaths.textContent = s.ledger.grazerPredationDeaths;
    el.grazerStarvationDeaths.textContent = s.ledger.grazerStarvationDeaths;
    el.grazerOldAgeDeaths.textContent = s.ledger.grazerOldAgeDeaths;
    el.hunterBirths.textContent = s.ledger.hunterBirths;
    el.hunterStarvationDeaths.textContent = s.ledger.hunterStarvationDeaths;
    el.hunterOldAgeDeaths.textContent = s.ledger.hunterOldAgeDeaths;
    el.huntAttempts.textContent = s.ledger.huntAttempts;
    el.huntSuccesses.textContent = s.ledger.huntSuccesses;
    el.huntRate.textContent = huntRate === null ? "成功率 —" : `成功率 ${Math.round(huntRate * 100)}%`;
  };

  function syncPlayback() {
    el.playToggle.setAttribute("aria-pressed", String(s.running));
    el.playIcon.textContent = s.running ? "Ⅱ" : "▶";
    el.playLabel.textContent = s.running ? "暂停时间" : s.year > 0 ? "继续时间" : "开始时间";
    el.pauseBanner.classList.toggle("is-hidden", s.running);
    el.pauseBanner.textContent = s.year > 0 ? "时间已暂停" : "时间尚未开始";
    for (const button of el.speedButtons) {
      const active = Number(button.dataset.speed) === s.speed;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function setRunning(running) {
    s.running = running;
    accumulator = 0;
    lastFrameTime = performance.now();
    syncPlayback();
    LG.updateUi(true);
  }

  function selectSpecies(type) {
    s.selectedSpecies = type;
    for (const button of el.speciesButtons) {
      const active = button.dataset.species === type;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    const description = type === "flora"
      ? "点击空地创建草地；检查点2会将其替换为连续生态地表。"
      : type === "grazer"
        ? "点击空地投放3只食草兽；点击已有动物会优先进入观察。"
        : "点击空地投放1只猎食兽；点击已有动物会优先进入观察。";
    el.placementHint.textContent = `已选择${type === "flora" ? "播种草地" : SPECIES[type].label}：${description}`;
  }

  function placeSpecies(type, x, y) {
    const config = SPECIES[type];
    let created = 0;
    if (type === "flora") {
      if (LG.seedPatchAt(x, y)) created = 1;
    } else {
      for (let index = 0; index < config.placementCount; index += 1) {
        if (LG.createAnimal(type, x, y, { spread: 34 })) created += 1;
      }
      if (created) {
        s.lastAnimalPlacementYear = s.year;
        s.coexistenceYears = 0;
        s.minimumDuringAttempt = { grazers: s.grazers.length, hunters: s.hunters.length };
      }
    }
    if (created) {
      s.effects.push({ kind: "placement", x, y, age: 0, color: config.color });
      LG.showToast(type === "flora" ? "草地已播种或补充" : `投放了 ${created} 只${config.label}`);
      LG.checkPresenceChanges();
      LG.updateUi(true);
    } else {
      LG.showToast(type === "flora" ? "草地斑块已达到世界上限" : "动物数量已达到世界上限");
    }
  }

  function clearLife() {
    s.patches = [];
    s.grazers = [];
    s.hunters = [];
    s.carcasses = [];
    s.coexistenceYears = 0;
    s.presence = { flora: false, grazer: false, hunter: false };
    s.minimumDuringAttempt = { grazers: 0, hunters: 0 };
    s.selectedIndividualId = null;
    camera.followTargetId = null;
    LG.addEvent("所有草地、种子、动物和尸体被移出世界。");
    LG.showToast("世界已清空，可以重新设计生态");
    LG.updateUi(true);
  }

  function selectAnimal(animal, follow = false) {
    s.selectedIndividualId = animal?.id || null;
    if (follow && animal) {
      camera.followTargetId = animal.id;
      camera.zoomAt(canvas.width / 2, canvas.height / 2, Math.max(1, 1.35 / camera.zoom));
      LG.showToast(`正在跟随${SPECIES[animal.type].label} #${animal.id}`);
    }
  }

  function injectCameraHud() {
    const frame = document.querySelector(".world-frame");
    if (!frame || document.querySelector("#cameraControls")) return;
    const controls = document.createElement("div");
    controls.id = "cameraControls";
    controls.className = "camera-controls";
    controls.innerHTML = `
      <button type="button" data-camera="out" aria-label="缩小世界">−</button>
      <strong id="cameraZoomLabel">100%</strong>
      <button type="button" data-camera="in" aria-label="放大世界">＋</button>
      <button type="button" data-camera="fit" class="camera-fit">全景</button>
    `;
    frame.append(controls);
    controls.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-camera]");
      if (!button) return;
      const action = button.dataset.camera;
      if (action === "fit") camera.reset();
      if (action === "in") camera.zoomAt(canvas.width / 2, canvas.height / 2, 1.25);
      if (action === "out") camera.zoomAt(canvas.width / 2, canvas.height / 2, 0.8);
      updateCameraHud();
    });
  }

  function updateCameraHud() {
    const label = document.querySelector("#cameraZoomLabel");
    if (label) label.textContent = `${Math.round(camera.zoom * 100)}%`;
  }

  function bind() {
    el.playToggle.addEventListener("click", () => setRunning(!s.running));
    for (const button of el.speedButtons) {
      button.addEventListener("click", () => {
        s.speed = Number(button.dataset.speed);
        syncPlayback();
        LG.showToast(`世界速度设为 ${s.speed}×`);
      });
    }
    for (const button of el.speciesButtons) {
      button.addEventListener("click", () => selectSpecies(button.dataset.species));
    }
    el.growthRule.addEventListener("input", () => {
      s.rules.growth = Number(el.growthRule.value);
      el.growthValue.value = `${s.rules.growth.toFixed(1)}×`;
    });
    el.growthRule.addEventListener("change", () => {
      LG.addEvent(`世界法则改变：植物生长率调整为${s.rules.growth.toFixed(1)}×。`);
    });
    el.fertilityRule.addEventListener("input", () => {
      s.rules.fertility = Number(el.fertilityRule.value);
      el.fertilityValue.value = `${s.rules.fertility.toFixed(1)}×`;
    });
    el.fertilityRule.addEventListener("change", () => {
      LG.addEvent(`世界法则改变：动物繁殖倾向调整为${s.rules.fertility.toFixed(1)}×。`);
    });
    el.seasonsRule.addEventListener("change", () => {
      s.rules.fullSeasons = el.seasonsRule.checked;
      LG.addEvent(s.rules.fullSeasons ? "完整四季重新生效。" : "季节被关闭，世界保持温和夏季。");
      LG.updateSeason();
      LG.updateUi(true);
    });
    el.resetButton.addEventListener("click", () => {
      LG.seedWorld();
      camera.reset();
      syncPlayback();
      LG.updateUi(true);
      LG.showToast("示范世界已重置并返回全景");
    });
    el.clearButton.addEventListener("click", clearLife);

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const point = eventScreenPoint(event);
      camera.zoomAt(point.x, point.y, event.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });

    canvas.addEventListener("pointerdown", (event) => {
      const screen = eventScreenPoint(event);
      if (event.button === 1 || spaceHeld) {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        panState = { pointerId: event.pointerId, x: screen.x, y: screen.y };
        document.querySelector(".world-frame")?.classList.add("is-panning");
        return;
      }
      if (event.button !== 0) return;
      pointerDown = { pointerId: event.pointerId, x: screen.x, y: screen.y, moved: false };
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      const screen = eventScreenPoint(event);
      const world = camera.screenToWorld(screen.x, screen.y);
      s.pointer = { ...world, inside: true };
      if (panState?.pointerId === event.pointerId) {
        const dx = screen.x - panState.x;
        const dy = screen.y - panState.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) spaceDragged = true;
        camera.panBy(dx, dy);
        panState.x = screen.x;
        panState.y = screen.y;
      }
      if (pointerDown?.pointerId === event.pointerId) {
        if (Math.hypot(screen.x - pointerDown.x, screen.y - pointerDown.y) > 6) pointerDown.moved = true;
      }
    });

    canvas.addEventListener("pointerup", (event) => {
      const screen = eventScreenPoint(event);
      if (panState?.pointerId === event.pointerId) {
        panState = null;
        document.querySelector(".world-frame")?.classList.remove("is-panning");
        return;
      }
      if (!pointerDown || pointerDown.pointerId !== event.pointerId) return;
      const wasMoved = pointerDown.moved;
      pointerDown = null;
      if (wasMoved) return;
      const animal = nearestAnimalAtScreen(screen.x, screen.y);
      if (animal) {
        selectAnimal(animal);
        LG.showToast(`已选择${SPECIES[animal.type].label} #${animal.id}`);
      } else {
        const world = camera.screenToWorld(screen.x, screen.y);
        placeSpecies(s.selectedSpecies, world.x, world.y);
      }
    });

    canvas.addEventListener("pointercancel", () => {
      pointerDown = null;
      panState = null;
      document.querySelector(".world-frame")?.classList.remove("is-panning");
    });

    canvas.addEventListener("pointerleave", () => {
      s.pointer.inside = false;
    });

    canvas.addEventListener("dblclick", (event) => {
      event.preventDefault();
      const point = eventScreenPoint(event);
      const animal = nearestAnimalAtScreen(point.x, point.y, 18);
      if (animal) selectAnimal(animal, true);
    });

    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const point = eventScreenPoint(event);
      const animal = nearestAnimalAtScreen(point.x, point.y, 18);
      selectAnimal(animal);
      if (!animal) LG.showToast("该位置附近没有动物");
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && event.target === document.body) {
        event.preventDefault();
        if (!event.repeat) {
          spaceHeld = true;
          spaceDragged = false;
        }
      }
      if (event.code === "Escape") {
        if (camera.followTargetId) {
          camera.followTargetId = null;
          LG.showToast("已停止跟随个体");
        } else {
          s.selectedIndividualId = null;
        }
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      if (spaceHeld && !spaceDragged && event.target === document.body) setRunning(!s.running);
      spaceHeld = false;
      spaceDragged = false;
    });

    document.addEventListener("visibilitychange", () => {
      lastFrameTime = performance.now();
      accumulator = 0;
    });
  }

  function backgroundColors() {
    if (s.season === "spring") return ["#badbb6", "#d8e5ae", "#a4ccb2"];
    if (s.season === "summer") return ["#a9d0a4", "#d9df9c", "#91c3aa"];
    if (s.season === "autumn") return ["#c7cf9e", "#e3d4a0", "#b9c49e"];
    return ["#a9c7c5", "#c9d8cd", "#aabfc0"];
  }

  function drawBackground() {
    const [start, middle, end] = backgroundColors();
    const gradient = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    gradient.addColorStop(0, start);
    gradient.addColorStop(0.55, middle);
    gradient.addColorStop(1, end);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    for (const decor of s.decor) {
      if (!camera.isVisible(decor, 180)) continue;
      ctx.save();
      ctx.translate(decor.x, decor.y);
      ctx.rotate(decor.rotation);
      ctx.fillStyle = decor.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, decor.radiusX, decor.radiusY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(255,255,255,.42)";
    ctx.lineWidth = 3 / camera.zoom;
    ctx.strokeRect(2, 2, WORLD.width - 4, WORLD.height - 4);
  }

  function drawPatch(patch, timestamp) {
    if (!camera.isVisible(patch, patch.radius + 40)) return;
    const green = LG.clamp(patch.green / PATCH.maxGreen, 0, 1);
    const dry = LG.clamp(patch.dry / PATCH.maxDry, 0, 1);
    const dormant = green < 0.03 && patch.seeds > 1;
    const pulse = 1 + Math.sin(timestamp * 0.0014 + patch.phase) * 0.014;
    ctx.save();
    ctx.translate(patch.x, patch.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = `rgba(114,91,58,${0.07 + patch.fertility * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(0, 5, patch.radius, patch.radius * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    if (dry > 0.01) {
      ctx.fillStyle = `rgba(190,151,77,${0.16 + dry * 0.45})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, patch.radius * (0.72 + dry * 0.2), patch.radius * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (green > 0.01) {
      ctx.fillStyle = s.season === "winter"
        ? `rgba(91,143,108,${0.2 + green * 0.48})`
        : `rgba(72,151,91,${0.27 + green * 0.56})`;
      ctx.beginPath();
      ctx.ellipse(0, -2, patch.radius * (0.58 + green * 0.34), patch.radius * (0.42 + green * 0.22), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (dormant) {
      ctx.strokeStyle = "rgba(238,226,177,.78)";
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.setLineDash([3 / camera.zoom, 4 / camera.zoom]);
      ctx.beginPath();
      ctx.arc(0, 0, patch.radius * 0.52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawGrazer(animal, timestamp) {
    if (!camera.isVisible(animal, 30)) return;
    const stage = LG.lifeStage(animal);
    const stageScale = stage === "juvenile" ? 0.7 : stage === "elder" ? 0.92 : 1;
    const bob = Math.sin(timestamp * 0.006 + animal.bobPhase) * 0.7;
    const selected = animal.id === s.selectedIndividualId;
    const scale = stageScale * (selected ? 1.18 : 1);
    ctx.save();
    ctx.translate(animal.x, animal.y + bob);
    ctx.rotate(animal.angle);
    ctx.scale(scale, scale);
    ctx.globalAlpha = stage === "elder" ? 0.72 : 1;
    ctx.strokeStyle = "rgba(211,142,49,.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-11, 0);
    ctx.stroke();
    ctx.fillStyle = "#e6ad4a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.4, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5cc73";
    ctx.beginPath();
    ctx.arc(4.7, -0.6, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d08b38";
    ctx.beginPath();
    ctx.ellipse(4.2, -4, 1.2, 2.5, -0.35, 0, Math.PI * 2);
    ctx.ellipse(6.7, -3.6, 1.2, 2.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHunter(animal, timestamp) {
    if (!camera.isVisible(animal, 32)) return;
    const stage = LG.lifeStage(animal);
    const stageScale = stage === "juvenile" ? 0.72 : stage === "elder" ? 0.93 : 1;
    const bob = Math.sin(timestamp * 0.007 + animal.bobPhase) * 0.55;
    const selected = animal.id === s.selectedIndividualId;
    const scale = stageScale * (selected ? 1.18 : 1);
    ctx.save();
    ctx.translate(animal.x, animal.y + bob);
    ctx.rotate(animal.angle);
    ctx.scale(scale, scale);
    ctx.globalAlpha = stage === "elder" ? 0.74 : 1;
    ctx.strokeStyle = "rgba(91,68,137,.36)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();
    ctx.fillStyle = "#7960aa";
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-1, -6);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-1, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f6e7a9";
    ctx.beginPath();
    ctx.arc(4, -1.8, 0.85, 0, Math.PI * 2);
    ctx.arc(4, 1.8, 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCarcass(carcass) {
    if (!camera.isVisible(carcass, 24)) return;
    ctx.save();
    ctx.translate(carcass.x, carcass.y);
    ctx.rotate(carcass.id * 0.73);
    ctx.globalAlpha = LG.clamp(carcass.biomass / 30, 0.18, 0.85);
    ctx.fillStyle = carcass.sourceType === "grazer" ? "#8a6b4f" : "#665672";
    ctx.fillRect(-4, -1.5, 8, 3);
    ctx.restore();
  }

  function drawSelection() {
    const animal = findAnimalById(s.selectedIndividualId);
    if (!animal || !camera.isVisible(animal, 50)) return;
    const radius = 15 / camera.zoom;
    ctx.save();
    ctx.strokeStyle = "rgba(255,246,174,.98)";
    ctx.lineWidth = 2.2 / camera.zoom;
    ctx.shadowColor = "rgba(91,73,145,.65)";
    ctx.shadowBlur = 12 / camera.zoom;
    ctx.beginPath();
    ctx.arc(animal.x, animal.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawEffects(dt) {
    for (let index = s.effects.length - 1; index >= 0; index -= 1) {
      const effect = s.effects[index];
      effect.age += dt;
      const duration = effect.kind === "lunge" ? 0.35 : 0.7;
      const progress = effect.age / duration;
      if (progress >= 1) {
        s.effects.splice(index, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = (3 - progress * 2) / camera.zoom;
      if (effect.kind === "lunge") {
        ctx.translate(effect.x, effect.y);
        ctx.rotate(effect.angle || 0);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(34 + progress * 18, 0);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, (8 + progress * 34) / Math.max(0.7, camera.zoom), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPreview() {
    if (!s.pointer.inside || panState) return;
    const config = SPECIES[s.selectedSpecies];
    const radius = (s.selectedSpecies === "flora" ? 28 : 18) / camera.zoom;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.setLineDash([5 / camera.zoom, 6 / camera.zoom]);
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.beginPath();
    ctx.arc(s.pointer.x, s.pointer.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function render(timestamp, dt) {
    camera.update();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    camera.apply(ctx);
    drawBackground();
    for (const patch of s.patches) drawPatch(patch, timestamp);
    for (const carcass of s.carcasses) drawCarcass(carcass);
    for (const grazer of s.grazers) drawGrazer(grazer, timestamp);
    for (const hunter of s.hunters) drawHunter(hunter, timestamp);
    drawEffects(dt);
    drawSelection();
    drawPreview();
    ctx.restore();
  }

  function substeps(speed) {
    if (speed >= 12) return 4;
    if (speed >= 4) return 2;
    return 1;
  }

  function loop(timestamp) {
    const elapsed = Math.min(250, timestamp - lastFrameTime);
    const frameDt = elapsed / 1000;
    lastFrameTime = timestamp;
    if (s.running) {
      accumulator += elapsed;
      let safety = 0;
      while (accumulator >= WORLD.fixedStepMs && safety < 5) {
        const steps = substeps(s.speed);
        const dt = WORLD.yearsPerStep * s.speed / steps;
        for (let index = 0; index < steps; index += 1) LG.updateWorld(dt);
        accumulator -= WORLD.fixedStepMs;
        safety += 1;
      }
    }
    render(timestamp, frameDt);
    LG.updateUi();
    requestAnimationFrame(loop);
  }

  LG.telemetrySnapshot = () => {
    const totals = LG.getResourceTotals();
    const criteria = LG.missionCriteria();
    return {
      version: "0.4.1-camera.1",
      worldYear: s.year,
      season: s.season,
      running: s.running,
      speed: s.speed,
      world: {
        width: WORLD.width,
        height: WORLD.height,
        camera: {
          x: camera.x,
          y: camera.y,
          zoom: camera.zoom,
          followTargetId: camera.followTargetId,
        },
      },
      rules: { ...s.rules },
      resources: {
        greenBiomass: totals.green,
        dryBiomass: totals.dry,
        seedBank: totals.seeds,
        averageFertility: s.patches.length ? totals.fertility / s.patches.length : 0,
        patchCount: s.patches.length,
      },
      populations: {
        grazers: s.grazers.length,
        hunters: s.hunters.length,
        carcasses: s.carcasses.length,
        grazerAges: LG.getAgeStructure(s.grazers),
        hunterAges: LG.getAgeStructure(s.hunters),
      },
      mission: {
        coexistenceYears: s.coexistenceYears,
        longestCoexistence: s.longestCoexistence,
        historicalComplete: s.historicalMissionComplete,
        criteria,
        lastAnimalPlacementYear: Number.isFinite(s.lastAnimalPlacementYear) ? s.lastAnimalPlacementYear : null,
        minimumDuringAttempt: { ...s.minimumDuringAttempt },
      },
      trends: { ...s.trendValues },
      currentYearMetrics: { ...s.ledger, year: Math.floor(s.year) },
      lifetimeMetrics: { ...s.lifetime, year: Math.floor(s.year) },
      hunterBehavior: {
        chasing: s.hunters.filter((animal) => animal.state === "chase").length,
        resting: s.hunters.filter((animal) => animal.state === "rest").length,
        feeding: s.hunters.filter((animal) => animal.state === "feed").length,
        totalConsecutiveFailures: s.hunters.reduce((sum, animal) => sum + animal.consecutiveFailures, 0),
      },
      balance: LG.calculateBalance(),
    };
  };

  function initialize() {
    canvas.width = WORLD.viewportWidth;
    canvas.height = WORLD.viewportHeight;
    injectCameraHud();
    bind();
    selectSpecies("flora");
    LG.seedWorld();
    camera.reset();
    syncPlayback();
    LG.updateUi(true);

    // 旧观察模式会拦截左键投放；新相机版统一为“点动物观察、点空地投放”。
    s.inspectMode = false;
    const legacyInspectButton = document.querySelector("#genesisInspectToggle");
    if (legacyInspectButton) legacyInspectButton.hidden = true;
    const legacyHint = document.querySelector(".compact-actions .hint-text");
    if (legacyHint) legacyHint.textContent = "左键动物直接观察；双击跟随；滚轮缩放；按住空格或中键拖动地图。";

    window.LittleGodTelemetry = { getSnapshot: LG.telemetrySnapshot };
    updateCameraHud();
    requestAnimationFrame(loop);
  }

  initialize();
})();