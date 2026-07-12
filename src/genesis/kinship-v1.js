(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Kinship model requires LittleGod core");
  if (typeof LG.chooseLocalMate !== "function") {
    throw new Error("Kinship model requires attributes.js");
  }

  const RELATION = Object.freeze({
    SELF: "self",
    PARENT_CHILD: "parent-child",
    FULL_SIBLING: "full-sibling",
    HALF_SIBLING: "half-sibling",
    UNRELATED: "unrelated",
  });

  function freshStats() {
    return {
      evaluatedCandidates: 0,
      rejectedCloseKin: 0,
      acceptedChoices: 0,
      blockedChoices: 0,
      byRelation: {
        [RELATION.SELF]: 0,
        [RELATION.PARENT_CHILD]: 0,
        [RELATION.FULL_SIBLING]: 0,
        [RELATION.HALF_SIBLING]: 0,
      },
    };
  }

  let stats = freshStats();

  function parentIds(animal) {
    return new Set((animal?.parents || []).filter((id) => id !== null && id !== undefined));
  }

  function relationBetween(first, second) {
    if (!first || !second) return RELATION.UNRELATED;
    if (first === second || first.id === second.id) return RELATION.SELF;

    const firstParents = parentIds(first);
    const secondParents = parentIds(second);
    if (firstParents.has(second.id) || secondParents.has(first.id)) {
      return RELATION.PARENT_CHILD;
    }

    let sharedParents = 0;
    for (const parentId of firstParents) {
      if (secondParents.has(parentId)) sharedParents += 1;
    }
    if (sharedParents >= 2) return RELATION.FULL_SIBLING;
    if (sharedParents === 1) return RELATION.HALF_SIBLING;
    return RELATION.UNRELATED;
  }

  function isCloseKin(first, second) {
    return relationBetween(first, second) !== RELATION.UNRELATED;
  }

  LG.getKinshipRelation = relationBetween;
  LG.isCloseKin = isCloseKin;

  const baseChooseLocalMate = LG.chooseLocalMate;
  LG.chooseLocalMate = (observer, candidates) => {
    const available = Array.isArray(candidates) ? candidates : [];
    const unrelated = [];
    const rejected = [];

    for (const candidate of available) {
      const relation = relationBetween(observer, candidate);
      stats.evaluatedCandidates += 1;
      if (relation === RELATION.UNRELATED) {
        unrelated.push(candidate);
      } else {
        rejected.push({ candidateId: candidate.id, relation });
        stats.rejectedCloseKin += 1;
        stats.byRelation[relation] += 1;
      }
    }

    if (!unrelated.length) {
      stats.blockedChoices += 1;
      observer.kinshipChoice = {
        selectedMateId: null,
        rejected,
        blocked: true,
        year: LG.state?.year ?? 0,
      };
      return null;
    }

    const selected = baseChooseLocalMate(observer, unrelated);
    if (selected) stats.acceptedChoices += 1;
    observer.kinshipChoice = {
      selectedMateId: selected?.id ?? null,
      rejected,
      blocked: false,
      year: LG.state?.year ?? 0,
    };
    return selected;
  };

  LG.getKinshipDiagnostics = () => ({
    version: "close-kin-avoidance-v1",
    evaluatedCandidates: stats.evaluatedCandidates,
    rejectedCloseKin: stats.rejectedCloseKin,
    acceptedChoices: stats.acceptedChoices,
    blockedChoices: stats.blockedChoices,
    byRelation: { ...stats.byRelation },
  });

  const baseSeedWorld = LG.seedWorld;
  if (typeof baseSeedWorld === "function") {
    LG.seedWorld = (...args) => {
      stats = freshStats();
      return baseSeedWorld.apply(LG, args);
    };
  }

  LG.kinshipModel = Object.freeze({
    version: "close-kin-avoidance-v1",
    blockedRelations: Object.freeze([
      RELATION.SELF,
      RELATION.PARENT_CHILD,
      RELATION.FULL_SIBLING,
      RELATION.HALF_SIBLING,
    ]),
    fallbackWhenOnlyKinAvailable: "no-mate",
  });

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__kinshipWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({
        ...baseSnapshot(),
        kinship: LG.getKinshipDiagnostics(),
      });
      wrapped.__kinshipWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
