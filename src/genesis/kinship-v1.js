(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Kinship model requires LittleGod core");
  if (typeof LG.chooseLocalMate !== "function" || typeof LG.createAnimal !== "function") {
    throw new Error("Kinship model requires attributes.js");
  }

  const RELATION = Object.freeze({
    SELF: "self",
    PARENT_CHILD: "parent-child",
    FULL_SIBLING: "full-sibling",
    HALF_SIBLING: "half-sibling",
    GRANDPARENT: "grandparent",
    AVUNCULAR: "avuncular",
    FIRST_COUSIN: "first-cousin",
    UNRELATED: "unrelated",
  });
  const HARD_BLOCKED = new Set([
    RELATION.SELF,
    RELATION.PARENT_CHILD,
    RELATION.FULL_SIBLING,
    RELATION.HALF_SIBLING,
    RELATION.GRANDPARENT,
    RELATION.AVUNCULAR,
  ]);
  const DISTANT_FALLBACK = new Set([RELATION.FIRST_COUSIN]);
  const pedigree = new Map();

  function freshStats() {
    return {
      evaluatedCandidates: 0,
      rejectedCloseKin: 0,
      avoidedDistantKin: 0,
      acceptedChoices: 0,
      blockedChoices: 0,
      fallbackDistantKinChoices: 0,
      byRelation: {
        [RELATION.SELF]: 0,
        [RELATION.PARENT_CHILD]: 0,
        [RELATION.FULL_SIBLING]: 0,
        [RELATION.HALF_SIBLING]: 0,
        [RELATION.GRANDPARENT]: 0,
        [RELATION.AVUNCULAR]: 0,
        [RELATION.FIRST_COUSIN]: 0,
      },
    };
  }

  let stats = freshStats();

  function cleanIds(values) {
    return [...new Set((values || [])
      .map((value) => (typeof value === "object" ? value?.id : value))
      .filter((id) => id !== null && id !== undefined))];
  }

  function recordPedigree(animal) {
    if (!animal || animal.id === null || animal.id === undefined) return null;
    const record = {
      id: animal.id,
      parents: cleanIds(animal.parents),
      generation: Number.isFinite(animal.generation) ? animal.generation : 0,
      type: animal.type || null,
    };
    pedigree.set(record.id, record);
    return record;
  }

  function directParentIds(animalOrId) {
    if (animalOrId && typeof animalOrId === "object") {
      const ids = cleanIds(animalOrId.parents);
      if (ids.length || !pedigree.has(animalOrId.id)) return ids;
      return pedigree.get(animalOrId.id).parents.slice();
    }
    return pedigree.get(animalOrId)?.parents.slice() || [];
  }

  function idOf(animalOrId) {
    return animalOrId && typeof animalOrId === "object" ? animalOrId.id : animalOrId;
  }

  function sharedParentCount(first, second) {
    const firstParents = new Set(directParentIds(first));
    let shared = 0;
    for (const parentId of directParentIds(second)) {
      if (firstParents.has(parentId)) shared += 1;
    }
    return shared;
  }

  function ancestorDepths(animalOrId, maxDepth = 2) {
    const result = new Map();
    const frontier = directParentIds(animalOrId).map((id) => ({ id, depth: 1 }));
    while (frontier.length) {
      const current = frontier.shift();
      const previous = result.get(current.id);
      if (previous !== undefined && previous <= current.depth) continue;
      result.set(current.id, current.depth);
      if (current.depth >= maxDepth) continue;
      for (const parentId of directParentIds(current.id)) {
        frontier.push({ id: parentId, depth: current.depth + 1 });
      }
    }
    return result;
  }

  function isSiblingOfParent(possibleSibling, child) {
    for (const parentId of directParentIds(child)) {
      if (sharedParentCount(possibleSibling, parentId) > 0) return true;
    }
    return false;
  }

  function shareGrandparent(first, second) {
    const firstAncestors = ancestorDepths(first, 2);
    const secondAncestors = ancestorDepths(second, 2);
    for (const [ancestorId, firstDepth] of firstAncestors) {
      if (firstDepth !== 2) continue;
      if (secondAncestors.get(ancestorId) === 2) return true;
    }
    return false;
  }

  function relationBetween(first, second) {
    if (!first || !second) return RELATION.UNRELATED;
    const firstId = idOf(first);
    const secondId = idOf(second);
    if (first === second || firstId === secondId) return RELATION.SELF;

    const firstParents = new Set(directParentIds(first));
    const secondParents = new Set(directParentIds(second));
    if (firstParents.has(secondId) || secondParents.has(firstId)) {
      return RELATION.PARENT_CHILD;
    }

    const sharedParents = sharedParentCount(first, second);
    if (sharedParents >= 2) return RELATION.FULL_SIBLING;
    if (sharedParents === 1) return RELATION.HALF_SIBLING;

    const firstAncestors = ancestorDepths(first, 2);
    const secondAncestors = ancestorDepths(second, 2);
    if (firstAncestors.get(secondId) === 2 || secondAncestors.get(firstId) === 2) {
      return RELATION.GRANDPARENT;
    }

    if (isSiblingOfParent(first, second) || isSiblingOfParent(second, first)) {
      return RELATION.AVUNCULAR;
    }

    if (shareGrandparent(first, second)) return RELATION.FIRST_COUSIN;
    return RELATION.UNRELATED;
  }

  function isCloseKin(first, second) {
    return HARD_BLOCKED.has(relationBetween(first, second));
  }

  LG.registerPedigree = recordPedigree;
  LG.getPedigreeRecord = (id) => {
    const record = pedigree.get(id);
    return record ? { ...record, parents: record.parents.slice() } : null;
  };
  LG.getKinshipRelation = relationBetween;
  LG.isCloseKin = isCloseKin;

  const baseCreateAnimal = LG.createAnimal;
  LG.createAnimal = (...args) => {
    const animal = baseCreateAnimal(...args);
    if (animal) recordPedigree(animal);
    return animal;
  };

  for (const animal of [...(LG.state?.grazers || []), ...(LG.state?.hunters || [])]) {
    recordPedigree(animal);
  }

  const baseChooseLocalMate = LG.chooseLocalMate;
  LG.chooseLocalMate = (observer, candidates) => {
    const available = Array.isArray(candidates) ? candidates : [];
    const unrelated = [];
    const distant = [];
    const rejected = [];

    for (const candidate of available) {
      const relation = relationBetween(observer, candidate);
      stats.evaluatedCandidates += 1;
      if (relation === RELATION.UNRELATED) {
        unrelated.push(candidate);
      } else if (DISTANT_FALLBACK.has(relation)) {
        distant.push(candidate);
        stats.byRelation[relation] += 1;
      } else {
        rejected.push({ candidateId: candidate.id, relation });
        stats.rejectedCloseKin += 1;
        stats.byRelation[relation] += 1;
      }
    }

    const fallbackToDistantKin = unrelated.length === 0 && distant.length > 0;
    const pool = unrelated.length ? unrelated : distant;
    if (unrelated.length && distant.length) stats.avoidedDistantKin += distant.length;

    if (!pool.length) {
      stats.blockedChoices += 1;
      observer.kinshipChoice = {
        selectedMateId: null,
        rejected,
        avoided: distant.map((candidate) => ({ candidateId: candidate.id, relation: RELATION.FIRST_COUSIN })),
        blocked: true,
        fallbackToDistantKin: false,
        year: LG.state?.year ?? 0,
      };
      return null;
    }

    const selected = baseChooseLocalMate(observer, pool);
    if (selected) {
      stats.acceptedChoices += 1;
      if (fallbackToDistantKin) stats.fallbackDistantKinChoices += 1;
    }
    observer.kinshipChoice = {
      selectedMateId: selected?.id ?? null,
      rejected,
      avoided: unrelated.length
        ? distant.map((candidate) => ({ candidateId: candidate.id, relation: RELATION.FIRST_COUSIN }))
        : [],
      blocked: false,
      fallbackToDistantKin,
      year: LG.state?.year ?? 0,
    };
    return selected;
  };

  LG.getKinshipDiagnostics = () => ({
    version: "pedigree-kinship-v2",
    pedigreeRecords: pedigree.size,
    evaluatedCandidates: stats.evaluatedCandidates,
    rejectedCloseKin: stats.rejectedCloseKin,
    avoidedDistantKin: stats.avoidedDistantKin,
    acceptedChoices: stats.acceptedChoices,
    blockedChoices: stats.blockedChoices,
    fallbackDistantKinChoices: stats.fallbackDistantKinChoices,
    byRelation: { ...stats.byRelation },
  });

  const baseSeedWorld = LG.seedWorld;
  if (typeof baseSeedWorld === "function") {
    LG.seedWorld = (...args) => {
      stats = freshStats();
      pedigree.clear();
      return baseSeedWorld.apply(LG, args);
    };
  }

  LG.kinshipModel = Object.freeze({
    version: "pedigree-kinship-v2",
    pedigreeDepth: 2,
    hardBlockedRelations: Object.freeze([...HARD_BLOCKED]),
    distantFallbackRelations: Object.freeze([...DISTANT_FALLBACK]),
    fallbackWhenOnlyHardKinAvailable: "no-mate",
    fallbackWhenOnlyDistantKinAvailable: "allow-first-cousin",
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
