(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Ecotype observer requires LittleGod core");
  if (typeof LG.classifyEcotype !== "function") {
    throw new Error("Ecotype observer requires speciation-v1.js");
  }

  function findAnimalById(id) {
    if (id === null || id === undefined) return null;
    return [...(LG.state?.grazers || []), ...(LG.state?.hunters || [])]
      .find((animal) => animal.id === id) || null;
  }

  LG.getEcotypeObservation = (animal) => {
    if (!animal) return null;
    const ecotype = LG.classifyEcotype(animal);
    if (!ecotype) return null;
    const mateSelectivity = Number(animal.traits?.mateSelectivity) || 0;
    const choice = animal.ecotypeChoice || null;
    return {
      id: ecotype.id,
      label: ecotype.label,
      specialized: Boolean(ecotype.specialized),
      mobilePercent: ecotype.mobileAxis * 100,
      robustPercent: ecotype.robustAxis * 100,
      divergencePercent: ecotype.divergence * 100,
      mateSelectivity,
      assortativePreference: mateSelectivity >= (LG.speciationModel?.selectivityThreshold || 55),
      lastChoice: choice ? {
        selectedMateId: choice.selectedMateId,
        selectedEcotype: choice.selectedEcotype,
        sameEcotype: Boolean(choice.sameEcotype),
        assortativePool: Boolean(choice.assortativePool),
      } : null,
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

  function choiceText(observation) {
    if (!observation.lastChoice) {
      return observation.assortativePreference
        ? "高选择性：繁殖时优先寻找同生态型且非近亲的伴侣。"
        : "低选择性：保留跨生态型择偶，不主动形成生殖分化。";
    }
    if (observation.lastChoice.sameEcotype) {
      return `最近选择同生态型伴侣 #${observation.lastChoice.selectedMateId}。`;
    }
    return `最近选择跨生态型伴侣 #${observation.lastChoice.selectedMateId}，维持种群兼容性。`;
  }

  function createCard(documentRef, observation, animalId) {
    const card = documentRef.createElement("section");
    card.className = `genesis-ecotype-card is-${observation.id}`;
    card.dataset.ecotypeAnimalId = String(animalId);
    card.dataset.ecotypeSignature = [
      observation.id,
      observation.mobilePercent.toFixed(2),
      observation.robustPercent.toFixed(2),
      observation.lastChoice?.selectedMateId ?? "none",
    ].join(":");
    card.setAttribute("aria-label", `生态型：${observation.label}`);

    const heading = documentRef.createElement("div");
    heading.className = "genesis-ecotype-head";
    const title = documentRef.createElement("div");
    title.append(
      textNode(documentRef, "strong", "", "生态型分化"),
      textNode(documentRef, "small", "", observation.specialized ? "专业化表型" : "平衡表型"),
    );
    heading.append(
      title,
      textNode(documentRef, "span", "genesis-ecotype-status", observation.label),
    );

    const metrics = documentRef.createElement("div");
    metrics.className = "genesis-ecotype-metrics";
    metrics.append(
      metric(documentRef, "机动轴", `${observation.mobilePercent.toFixed(1)}%`),
      metric(documentRef, "强健轴", `${observation.robustPercent.toFixed(1)}%`),
      metric(documentRef, "分化差", `${observation.divergencePercent >= 0 ? "+" : ""}${observation.divergencePercent.toFixed(1)}%`),
      metric(documentRef, "择偶选择性", `${observation.mateSelectivity.toFixed(0)}%`),
    );

    const note = textNode(documentRef, "p", "genesis-ecotype-note", choiceText(observation));
    card.append(heading, metrics, note);
    return card;
  }

  function syncObserver() {
    if (typeof document === "undefined") return false;
    const body = document.querySelector("#genesisInspectorBody");
    if (!body) return false;

    const animal = findAnimalById(LG.state?.selectedIndividualId);
    const observation = LG.getEcotypeObservation(animal);
    const existing = body.querySelector?.(".genesis-ecotype-card");
    if (!observation || !animal) {
      existing?.remove?.();
      return false;
    }

    const signature = [
      observation.id,
      observation.mobilePercent.toFixed(2),
      observation.robustPercent.toFixed(2),
      observation.lastChoice?.selectedMateId ?? "none",
    ].join(":");
    if (
      existing
      && existing.dataset.ecotypeAnimalId === String(animal.id)
      && existing.dataset.ecotypeSignature === signature
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
    if (!body || body.dataset.ecotypeObserverMounted === "true") return false;
    body.dataset.ecotypeObserverMounted = "true";
    syncObserver();

    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => syncObserver());
      observer.observe(body, { childList: true, subtree: true });
      LG.ecotypeObserverMutationObserver = observer;
    }
    window.setInterval?.(syncObserver, 250);
    return true;
  }

  LG.syncEcotypeObserver = syncObserver;
  LG.getEcotypeObserverDiagnostics = () => ({
    version: "ecotype-observer-v1",
    mounted: typeof document !== "undefined"
      && document.querySelector("#genesisInspectorBody")?.dataset.ecotypeObserverMounted === "true",
    selectedIndividualId: LG.state?.selectedIndividualId ?? null,
    visible: typeof document !== "undefined"
      && Boolean(document.querySelector("#genesisInspectorBody .genesis-ecotype-card")),
  });
  LG.ecotypeObserverModel = Object.freeze({
    version: "ecotype-observer-v1",
    source: "selected-individual-inspector",
    showsTraitAxes: true,
    showsMatePreference: true,
  });

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
      mount();
    }
  }
})();
