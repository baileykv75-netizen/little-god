(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Bloodline observer requires LittleGod core");

  const STATUS_LABELS = Object.freeze({
    dormant: "休眠",
    carrier: "携带",
    awakened: "觉醒",
    exalted: "升华",
  });

  function findAnimalById(id) {
    if (id === null || id === undefined) return null;
    return [...(LG.state?.grazers || []), ...(LG.state?.hunters || [])]
      .find((animal) => animal.id === id) || null;
  }

  LG.getArcaneBloodlineObservation = (animal) => {
    const bloodline = animal?.arcaneBloodline;
    if (!bloodline) return null;
    const modifiers = bloodline.modifiers || {};
    return {
      name: bloodline.name || "aether",
      label: "以太血脉",
      status: bloodline.status,
      statusLabel: STATUS_LABELS[bloodline.status] || bloodline.status || "未知",
      active: Boolean(bloodline.active),
      alleleCount: Number(bloodline.alleleCount) || 0,
      alleleCapacity: (LG.arcaneBloodlineModel?.locusCount || 4) * 2,
      purity: Number(bloodline.purity) || 0,
      purityPercent: (Number(bloodline.purity) || 0) * 100,
      source: animal.genome?.bloodlines?.aether?.source || "unknown",
      capacityBonus: Number(modifiers.capacityBonus) || 0,
      stabilityBonus: Number(modifiers.stabilityBonus) || 0,
      combatBonusPercent: ((Number(modifiers.combatMultiplier) || 1) - 1) * 100,
      energyBonusPercent: ((Number(modifiers.energyMultiplier) || 1) - 1) * 100,
    };
  };

  function textNode(documentRef, tag, className, text) {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function metric(documentRef, label, value) {
    const item = documentRef.createElement("span");
    item.append(
      textNode(documentRef, "small", "", label),
      textNode(documentRef, "strong", "", value),
    );
    return item;
  }

  function createCard(documentRef, observation, animalId) {
    const card = documentRef.createElement("section");
    card.className = `genesis-bloodline-card is-${observation.status}`;
    card.dataset.bloodlineAnimalId = String(animalId);
    card.dataset.bloodlineSignature = [
      observation.status,
      observation.alleleCount,
      observation.purityPercent.toFixed(2),
    ].join(":");
    card.setAttribute("aria-label", `${observation.label}：${observation.statusLabel}`);

    const heading = documentRef.createElement("div");
    heading.className = "genesis-bloodline-head";
    const title = documentRef.createElement("div");
    title.append(
      textNode(documentRef, "strong", "", observation.label),
      textNode(
        documentRef,
        "small",
        "",
        observation.source === "inherited" ? "双亲遗传" : "创始个体",
      ),
    );
    heading.append(
      title,
      textNode(documentRef, "span", "genesis-bloodline-status", observation.statusLabel),
    );

    const metrics = documentRef.createElement("div");
    metrics.className = "genesis-bloodline-metrics";
    metrics.append(
      metric(documentRef, "等位基因", `${observation.alleleCount} / ${observation.alleleCapacity}`),
      metric(documentRef, "血脉纯度", `${observation.purityPercent.toFixed(1)}%`),
      metric(documentRef, "灵能容量", `+${observation.capacityBonus.toFixed(1)}`),
      metric(documentRef, "灵能稳定", `+${observation.stabilityBonus.toFixed(1)}`),
      metric(documentRef, "战力修正", `+${observation.combatBonusPercent.toFixed(1)}%`),
      metric(documentRef, "能量上限", `+${observation.energyBonusPercent.toFixed(1)}%`),
    );

    const note = textNode(
      documentRef,
      "p",
      "genesis-bloodline-note",
      observation.active
        ? "该血脉已觉醒，属性修正已进入生存与捕食竞争。"
        : observation.status === "carrier"
          ? "当前仅携带等位基因，仍可将血脉传给后代。"
          : "当前未检测到可表达的以太血脉。",
    );

    card.append(heading, metrics, note);
    return card;
  }

  function syncObserver() {
    if (typeof document === "undefined") return false;
    const body = document.querySelector("#genesisInspectorBody");
    if (!body) return false;

    const animal = findAnimalById(LG.state?.selectedIndividualId);
    const observation = LG.getArcaneBloodlineObservation(animal);
    const existing = body.querySelector?.(".genesis-bloodline-card");
    if (!observation || !animal) {
      existing?.remove?.();
      return false;
    }

    const signature = [
      observation.status,
      observation.alleleCount,
      observation.purityPercent.toFixed(2),
    ].join(":");
    if (
      existing
      && existing.dataset.bloodlineAnimalId === String(animal.id)
      && existing.dataset.bloodlineSignature === signature
    ) return true;

    existing?.remove?.();
    const card = createCard(document, observation, animal.id);
    const populationSummary = body.querySelector?.(".genesis-population-summary");
    if (populationSummary && typeof body.insertBefore === "function") {
      body.insertBefore(card, populationSummary);
    } else {
      body.append(card);
    }
    return true;
  }

  function mount() {
    if (typeof document === "undefined") return false;
    const body = document.querySelector("#genesisInspectorBody");
    if (!body || body.dataset.bloodlineObserverMounted === "true") return false;
    body.dataset.bloodlineObserverMounted = "true";
    syncObserver();

    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => syncObserver());
      observer.observe(body, { childList: true, subtree: true });
      LG.bloodlineObserverMutationObserver = observer;
    }
    window.setInterval?.(syncObserver, 250);
    return true;
  }

  LG.syncBloodlineObserver = syncObserver;
  LG.getBloodlineObserverDiagnostics = () => ({
    version: "bloodline-observer-v1",
    mounted: typeof document !== "undefined"
      && document.querySelector("#genesisInspectorBody")?.dataset.bloodlineObserverMounted === "true",
    selectedIndividualId: LG.state?.selectedIndividualId ?? null,
    visible: typeof document !== "undefined"
      && Boolean(document.querySelector("#genesisInspectorBody .genesis-bloodline-card")),
  });
  LG.bloodlineObserverModel = Object.freeze({
    version: "bloodline-observer-v1",
    source: "selected-individual-inspector",
    showsAlleles: true,
    showsActiveModifiers: true,
  });

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
      mount();
    }
  }
})();
