(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Experiment telemetry requires LittleGod core");
  if (typeof LG.getExperimentDiagnostics !== "function") {
    throw new Error("Experiment telemetry requires rng-v1.js");
  }

  const baseTelemetry = window.LittleGodTelemetry?.getSnapshot
    || (typeof LG.telemetrySnapshot === "function" ? LG.telemetrySnapshot : null);
  if (typeof baseTelemetry !== "function") {
    throw new Error("Experiment telemetry requires view-v2 telemetry");
  }

  function getSnapshot() {
    const base = baseTelemetry();
    return {
      ...base,
      experiment: {
        ...LG.getExperimentDiagnostics(),
        replayUrl: typeof LG.getExperimentReplayUrl === "function"
          ? LG.getExperimentReplayUrl()
          : null,
      },
    };
  }

  LG.getExperimentTelemetrySnapshot = getSnapshot;
  window.LittleGodTelemetry = {
    ...(window.LittleGodTelemetry || {}),
    getSnapshot,
  };

  LG.experimentTelemetryModel = Object.freeze({
    version: "experiment-telemetry-v1",
    includesSeed: true,
    includesReplayUrl: true,
    preservesBaseTelemetry: true,
  });
})();
