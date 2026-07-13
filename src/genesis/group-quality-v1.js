(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Group quality diagnostics require LittleGod core");
  if (typeof LG.updateWorld !== "function" || typeof LG.incrementMetric !== "function") {
    throw new Error("Group quality diagnostics require simulation.js");
  }

  const SAMPLE_INTERVAL_YEARS = 0.05;
  const STABLE_LIFETIME_YEARS = 0.5;
  const STABLE_JACCARD_MIN = 0.6;
  const OVERLAP_EVENT_MIN = 0.2;

  let nextTrackId = 1;
  let lastSampleYear = -Infinity;
  let tracks = new Map();
  let activeTrackIds = new Set();
  let pendingHunt = null;
  let unknownHunts = 0;
  const events = {
    grazer: { splitCount: 0, mergeCount: 0 },
    hunter: { splitCount: 0, mergeCount: 0 },
  };
  const hunts = {
    pack: { attempts: 0, successes: 0 },
    solo: { attempts: 0, successes: 0 },
  };

  const cloneSet = (values) => new Set(values);
  const intersectionSize = (a, b) => {
    let count = 0;
    for (const value of a) if (b.has(value)) count += 1;
    return count;
  };
  const jaccard = (a, b) => {
    const intersection = intersectionSize(a, b);
    const union = a.size + b.size - intersection;
    return union ? intersection / union : 0;
  };
  const symmetricDifferenceSize = (a, b) => (
    a.size + b.size - intersectionSize(a, b) * 2
  );

  function currentGroups() {
    const grouped = new Map();
    for (const animal of [...(LG.state.grazers || []), ...(LG.state.hunters || [])]) {
      const assignment = animal.groupBehavior;
      if (!assignment?.groupId) continue;
      const key = `${animal.type}:${assignment.groupId}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          sourceId: assignment.groupId,
          type: animal.type,
          role: assignment.role,
          memberIds: [],
          members: [],
        });
      }
      grouped.get(key).memberIds.push(animal.id);
      grouped.get(key).members.push(animal);
    }

    return [...grouped.values()]
      .filter((group) => group.members.length >= 2)
      .map((group) => {
        const center = group.members.reduce((sum, animal) => ({
          x: sum.x + animal.x,
          y: sum.y + animal.y,
        }), { x: 0, y: 0 });
        center.x /= group.members.length;
        center.y /= group.members.length;
        const distances = group.members.map((animal) => Math.hypot(
          animal.x - center.x,
          animal.y - center.y,
        ));
        return {
          ...group,
          members: undefined,
          memberSet: new Set(group.memberIds),
          averageMemberDistance: distances.reduce((sum, value) => sum + value, 0) / distances.length,
          maximumMemberDistance: Math.max(...distances),
        };
      });
  }

  function createTrack(group, year) {
    const id = `observed-${group.type}-${nextTrackId++}`;
    const track = {
      id,
      type: group.type,
      role: group.role,
      sourceIds: new Set([group.sourceId]),
      startYear: year,
      lastSeenYear: year,
      sampleCount: 1,
      members: cloneSet(group.memberSet),
      memberChanges: 0,
      memberSlots: group.memberSet.size,
      jaccardTotal: 1,
      jaccardSamples: 1,
      distanceTotal: group.averageMemberDistance,
      distanceSamples: 1,
      maximumMemberDistance: group.maximumMemberDistance,
      active: true,
    };
    tracks.set(id, track);
    return track;
  }

  function sampleGroups(force = false) {
    const year = Number(LG.state.year) || 0;
    if (!force && year - lastSampleYear < SAMPLE_INTERVAL_YEARS) return false;
    lastSampleYear = year;

    const groups = currentGroups();
    const previous = [...activeTrackIds]
      .map((id) => tracks.get(id))
      .filter(Boolean);
    const overlapByCurrent = groups.map((group) => previous
      .filter((track) => track.type === group.type)
      .map((track) => ({ track, score: jaccard(track.members, group.memberSet) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score));

    for (let currentIndex = 0; currentIndex < groups.length; currentIndex += 1) {
      const overlaps = overlapByCurrent[currentIndex].filter((entry) => entry.score >= OVERLAP_EVENT_MIN);
      if (overlaps.length >= 2) events[groups[currentIndex].type].mergeCount += 1;
    }
    for (const track of previous) {
      const overlaps = groups.filter((group) => (
        group.type === track.type && jaccard(track.members, group.memberSet) >= OVERLAP_EVENT_MIN
      ));
      if (overlaps.length >= 2) events[track.type].splitCount += 1;
    }

    const matchedPrevious = new Set();
    const nextActive = new Set();
    const order = groups
      .map((group, index) => ({ group, index }))
      .sort((a, b) => b.group.memberSet.size - a.group.memberSet.size);

    for (const { group, index } of order) {
      const match = overlapByCurrent[index].find((entry) => !matchedPrevious.has(entry.track.id));
      let track;
      if (match) {
        track = match.track;
        matchedPrevious.add(track.id);
        const previousMembers = track.members;
        track.memberChanges += symmetricDifferenceSize(previousMembers, group.memberSet);
        track.memberSlots += Math.max(1, previousMembers.size);
        track.jaccardTotal += match.score;
        track.jaccardSamples += 1;
        track.members = cloneSet(group.memberSet);
        track.sourceIds.add(group.sourceId);
        track.lastSeenYear = year;
        track.sampleCount += 1;
        track.distanceTotal += group.averageMemberDistance;
        track.distanceSamples += 1;
        track.maximumMemberDistance = Math.max(track.maximumMemberDistance, group.maximumMemberDistance);
        track.active = true;
      } else {
        track = createTrack(group, year);
      }
      nextActive.add(track.id);
    }

    for (const track of previous) {
      if (nextActive.has(track.id)) continue;
      track.active = false;
      track.lastSeenYear = year;
    }
    activeTrackIds = nextActive;
    return true;
  }

  function likelyAttemptingHunter() {
    const attackCooldown = Number(LG.SPECIES?.hunter?.attackCooldown) || 0.16;
    return (LG.state.hunters || [])
      .filter((hunter) => (
        hunter.state === "chase"
        && Number(hunter.attackCooldown) >= attackCooldown * 0.9
      ))
      .sort((a, b) => (
        Number(b.attackCooldown) - Number(a.attackCooldown)
        || a.id - b.id
      ))[0] || null;
  }

  function classifyAttempt() {
    const hunter = likelyAttemptingHunter();
    if (!hunter) return null;
    const group = hunter.groupBehavior;
    const pack = group?.role === "pack" && Number(group.size) >= 2;
    return {
      hunterId: hunter.id,
      year: Number(LG.state.year) || 0,
      mode: pack ? "pack" : "solo",
      observedGroupId: group?.groupId || null,
      observedGroupSize: Number(group?.size) || 1,
    };
  }

  const baseIncrementMetric = LG.incrementMetric;
  LG.incrementMetric = (key, amount = 1) => {
    const result = baseIncrementMetric(key, amount);
    if (key === "huntAttempts") {
      pendingHunt = classifyAttempt();
      if (pendingHunt) hunts[pendingHunt.mode].attempts += amount;
      else unknownHunts += amount;
    } else if (key === "huntSuccesses" || key === "huntFailures") {
      if (pendingHunt) {
        if (key === "huntSuccesses") hunts[pendingHunt.mode].successes += amount;
        pendingHunt = null;
      }
    }
    return result;
  };

  function summarizeSpecies(type) {
    const speciesTracks = [...tracks.values()].filter((track) => track.type === type);
    const lifetimes = speciesTracks.map((track) => Math.max(0, track.lastSeenYear - track.startYear));
    const turnoverNumerator = speciesTracks.reduce((sum, track) => sum + track.memberChanges, 0);
    const turnoverDenominator = speciesTracks.reduce((sum, track) => sum + track.memberSlots, 0);
    const distanceNumerator = speciesTracks.reduce((sum, track) => sum + track.distanceTotal, 0);
    const distanceDenominator = speciesTracks.reduce((sum, track) => sum + track.distanceSamples, 0);
    const stableGroupCount = speciesTracks.filter((track) => {
      const lifetime = Math.max(0, track.lastSeenYear - track.startYear);
      const meanJaccard = track.jaccardSamples ? track.jaccardTotal / track.jaccardSamples : 0;
      return lifetime >= STABLE_LIFETIME_YEARS && meanJaccard >= STABLE_JACCARD_MIN;
    }).length;
    return {
      observedGroupTracks: speciesTracks.length,
      activeGroupTracks: speciesTracks.filter((track) => track.active).length,
      groupLifetimeYears: lifetimes.length ? {
        mean: lifetimes.reduce((sum, value) => sum + value, 0) / lifetimes.length,
        maximum: Math.max(...lifetimes),
      } : null,
      membershipTurnover: turnoverDenominator ? turnoverNumerator / turnoverDenominator : null,
      averageMemberDistance: distanceDenominator ? distanceNumerator / distanceDenominator : null,
      maximumMemberDistance: speciesTracks.length
        ? Math.max(...speciesTracks.map((track) => track.maximumMemberDistance))
        : null,
      splitCount: events[type].splitCount,
      mergeCount: events[type].mergeCount,
      stableGroupCount,
    };
  }

  const rate = (bucket) => bucket.attempts ? bucket.successes / bucket.attempts : null;

  function diagnostics() {
    sampleGroups(true);
    return {
      version: "group-quality-baseline-v1",
      observationOnly: true,
      definitions: {
        samplingWindowYears: SAMPLE_INTERVAL_YEARS,
        groupIdentity: "maximum member-set overlap between consecutive observation samples",
        groupLifetimeYears: "last observed year minus first observed year for an overlap-tracked group",
        membershipTurnover: "symmetric member changes divided by prior observed member slots",
        averageMemberDistance: "mean member distance from the observed group centroid across samples",
        maximumMemberDistance: "largest member-to-centroid distance observed",
        stableGroup: `lifetime >= ${STABLE_LIFETIME_YEARS} years and mean consecutive Jaccard >= ${STABLE_JACCARD_MIN}`,
        splitMergeEvent: `member-set Jaccard overlap >= ${OVERLAP_EVENT_MIN} with multiple groups`,
        packHunt: "hunt attempt by a hunter assigned to a pack of at least two at the attempt",
        noSampleValue: "rates and distance/lifetime ratios are null when their denominator is zero",
      },
      grazer: summarizeSpecies("grazer"),
      hunter: summarizeSpecies("hunter"),
      hunts: {
        packHunts: hunts.pack.attempts,
        packHuntSuccesses: hunts.pack.successes,
        packHuntSuccessRate: rate(hunts.pack),
        soloHunts: hunts.solo.attempts,
        soloHuntSuccesses: hunts.solo.successes,
        soloHuntSuccessRate: rate(hunts.solo),
        unknownHunts,
      },
    };
  }

  function reset() {
    nextTrackId = 1;
    lastSampleYear = -Infinity;
    tracks = new Map();
    activeTrackIds = new Set();
    pendingHunt = null;
    unknownHunts = 0;
    events.grazer.splitCount = 0;
    events.grazer.mergeCount = 0;
    events.hunter.splitCount = 0;
    events.hunter.mergeCount = 0;
    hunts.pack.attempts = 0;
    hunts.pack.successes = 0;
    hunts.solo.attempts = 0;
    hunts.solo.successes = 0;
  }

  const baseUpdateWorld = LG.updateWorld;
  LG.updateWorld = (dt) => {
    const result = baseUpdateWorld(dt);
    sampleGroups(false);
    return result;
  };

  const baseSeedWorld = LG.seedWorld;
  LG.seedWorld = (...args) => {
    const result = baseSeedWorld.apply(LG, args);
    reset();
    sampleGroups(true);
    return result;
  };

  const baseCompactSummary = LG.getEcologySupervisionDiagnostics;
  if (typeof baseCompactSummary === "function") {
    LG.getEcologySupervisionDiagnostics = () => ({
      ...baseCompactSummary(),
      groupQuality: diagnostics(),
    });
  }

  LG.getGroupQualityDiagnostics = diagnostics;
  LG.groupQualityModel = Object.freeze({
    version: "group-quality-baseline-v1",
    observationOnly: true,
    changesGroupDecisions: false,
    changesHuntProbability: false,
  });

  reset();

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", () => {
      const telemetry = window.LittleGodTelemetry;
      if (!telemetry?.getSnapshot || telemetry.getSnapshot.__groupQualityWrapped) return;
      const baseSnapshot = telemetry.getSnapshot;
      const wrapped = () => ({ ...baseSnapshot(), groupQuality: diagnostics() });
      wrapped.__groupQualityWrapped = true;
      telemetry.getSnapshot = wrapped;
    });
  }
})();
