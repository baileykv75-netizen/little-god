(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Deer sprites require LittleGod core");

  const spriteMapping = Object.freeze({
    juvenile: Object.freeze({
      any: Object.freeze({ key: "deer-fawn", path: "art/animals/deer-fawn.png", worldWidth: 31 }),
    }),
    adult: Object.freeze({
      male: Object.freeze({ key: "deer-buck", path: "art/animals/deer-buck.png", worldWidth: 48 }),
      female: Object.freeze({ key: "deer-doe", path: "art/animals/deer-doe.png", worldWidth: 43 }),
    }),
    elder: Object.freeze({
      male: Object.freeze({ key: "deer-buck", path: "art/animals/deer-buck.png", worldWidth: 45 }),
      female: Object.freeze({ key: "deer-doe", path: "art/animals/deer-doe.png", worldWidth: 40 }),
    }),
  });

  const assets = new Map();
  let overlayCanvas = null;
  let overlayContext = null;
  let renderedFrames = 0;
  let renderedGrazers = 0;
  let fallbackGrazers = 0;
  let selectedSpriteVisible = false;

  function sampleCornerColor(data, width, height) {
    const sampleSize = Math.max(1, Math.min(8, Math.floor(Math.min(width, height) / 8)));
    const corners = [
      [0, 0],
      [width - sampleSize, 0],
      [0, height - sampleSize],
      [width - sampleSize, height - sampleSize],
    ];
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (const [startX, startY] of corners) {
      for (let y = startY; y < startY + sampleSize; y += 1) {
        for (let x = startX; x < startX + sampleSize; x += 1) {
          const offset = (y * width + x) * 4;
          red += data[offset];
          green += data[offset + 1];
          blue += data[offset + 2];
          count += 1;
        }
      }
    }
    return {
      red: red / count,
      green: green / count,
      blue: blue / count,
      brightness: (red + green + blue) / (count * 3),
    };
  }

  function removeConnectedBackground(image) {
    const sourceWidth = Number(image.naturalWidth || image.width) || 0;
    const sourceHeight = Number(image.naturalHeight || image.height) || 0;
    if (!sourceWidth || !sourceHeight) throw new Error("Deer sprite image has no dimensions");

    const working = document.createElement("canvas");
    working.width = sourceWidth;
    working.height = sourceHeight;
    const context = working.getContext("2d", { willReadFrequently: true });
    if (!context?.getImageData || !context?.putImageData) {
      return {
        renderable: image,
        sourceWidth,
        sourceHeight,
        trimWidth: sourceWidth,
        trimHeight: sourceHeight,
        backgroundPixelsRemoved: 0,
        processed: false,
      };
    }

    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, sourceWidth, sourceHeight);
    const pixels = imageData.data;
    const reference = sampleCornerColor(pixels, sourceWidth, sourceHeight);
    const pixelCount = sourceWidth * sourceHeight;
    const visited = new Uint8Array(pixelCount);
    const queue = new Int32Array(pixelCount);
    let head = 0;
    let tail = 0;
    let removed = 0;

    const isBackground = (index) => {
      const offset = index * 4;
      if (pixels[offset + 3] === 0) return true;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const distance = Math.hypot(
        red - reference.red,
        green - reference.green,
        blue - reference.blue,
      );
      const brightness = (red + green + blue) / 3;
      return distance <= 64 && brightness >= reference.brightness - 48;
    };

    const enqueue = (index) => {
      if (visited[index] || !isBackground(index)) return;
      visited[index] = 1;
      queue[tail] = index;
      tail += 1;
    };

    for (let x = 0; x < sourceWidth; x += 1) {
      enqueue(x);
      enqueue((sourceHeight - 1) * sourceWidth + x);
    }
    for (let y = 1; y < sourceHeight - 1; y += 1) {
      enqueue(y * sourceWidth);
      enqueue(y * sourceWidth + sourceWidth - 1);
    }

    while (head < tail) {
      const index = queue[head];
      head += 1;
      const offset = index * 4;
      if (pixels[offset + 3] !== 0) {
        pixels[offset + 3] = 0;
        removed += 1;
      }
      const x = index % sourceWidth;
      const y = Math.floor(index / sourceWidth);
      if (x > 0) enqueue(index - 1);
      if (x + 1 < sourceWidth) enqueue(index + 1);
      if (y > 0) enqueue(index - sourceWidth);
      if (y + 1 < sourceHeight) enqueue(index + sourceWidth);
    }

    let minX = sourceWidth;
    let minY = sourceHeight;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        const alpha = pixels[(y * sourceWidth + x) * 4 + 3];
        if (alpha <= 8) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) throw new Error("Deer background removal erased the full image");
    context.putImageData(imageData, 0, 0);

    const padding = Math.max(2, Math.round(Math.min(sourceWidth, sourceHeight) * 0.012));
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(sourceWidth - 1, maxX + padding);
    maxY = Math.min(sourceHeight - 1, maxY + padding);
    const trimWidth = maxX - minX + 1;
    const trimHeight = maxY - minY + 1;
    const trimmed = document.createElement("canvas");
    trimmed.width = trimWidth;
    trimmed.height = trimHeight;
    const trimmedContext = trimmed.getContext("2d");
    trimmedContext.drawImage(
      working,
      minX,
      minY,
      trimWidth,
      trimHeight,
      0,
      0,
      trimWidth,
      trimHeight,
    );

    return {
      renderable: trimmed,
      sourceWidth,
      sourceHeight,
      trimWidth,
      trimHeight,
      backgroundPixelsRemoved: removed,
      processed: true,
    };
  }

  function preloadSprite(definition) {
    if (assets.has(definition.key)) return assets.get(definition.key);
    const record = {
      key: definition.key,
      path: definition.path,
      status: "loading",
      renderable: null,
      sourceWidth: 0,
      sourceHeight: 0,
      trimWidth: 0,
      trimHeight: 0,
      backgroundPixelsRemoved: 0,
      processed: false,
      error: null,
    };
    assets.set(definition.key, record);

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        Object.assign(record, removeConnectedBackground(image));
        record.status = "ready";
      } catch (error) {
        record.renderable = image;
        record.sourceWidth = Number(image.naturalWidth || image.width) || 0;
        record.sourceHeight = Number(image.naturalHeight || image.height) || 0;
        record.trimWidth = record.sourceWidth;
        record.trimHeight = record.sourceHeight;
        record.processed = false;
        record.status = "ready-unprocessed";
        record.error = String(error?.message || error);
      }
    };
    image.onerror = () => {
      record.status = "error";
      record.error = `Failed to load ${definition.path}`;
    };
    image.src = definition.path;
    return record;
  }

  function preloadDeerSprites() {
    const unique = new Map();
    for (const stageMapping of Object.values(spriteMapping)) {
      for (const definition of Object.values(stageMapping)) unique.set(definition.key, definition);
    }
    for (const definition of unique.values()) preloadSprite(definition);
  }

  function resolveGrazerSprite(animal) {
    const stage = typeof LG.lifeStage === "function" ? LG.lifeStage(animal) : "adult";
    const normalizedStage = spriteMapping[stage] ? stage : "adult";
    const sex = animal.sex === "male" ? "male" : "female";
    const stageMapping = spriteMapping[normalizedStage];
    const definition = stageMapping.any || stageMapping[sex] || stageMapping.female;
    return {
      stage: normalizedStage,
      sex,
      definition,
      asset: assets.get(definition.key) || null,
    };
  }

  function resizeOverlay() {
    const baseCanvas = document.querySelector("#worldCanvas");
    if (!baseCanvas || !overlayCanvas) return false;
    if (overlayCanvas.width !== baseCanvas.width) overlayCanvas.width = baseCanvas.width;
    if (overlayCanvas.height !== baseCanvas.height) overlayCanvas.height = baseCanvas.height;
    return true;
  }

  function drawSelection(context, animal, width) {
    if (animal.id !== LG.state.selectedIndividualId) return false;
    const zoom = Math.max(0.45, LG.camera?.zoom || 1);
    context.save();
    context.strokeStyle = "rgba(255,246,174,.98)";
    context.lineWidth = 2.2 / zoom;
    context.shadowColor = "rgba(91,73,145,.65)";
    context.shadowBlur = 12 / zoom;
    context.beginPath();
    context.arc(animal.x, animal.y, Math.max(16, width * 0.48) / zoom, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    return true;
  }

  function drawGrazerSprite(context, animal, timestamp, resolved) {
    const { definition, asset, stage } = resolved;
    if (!asset?.renderable || !asset.status.startsWith("ready")) return false;
    const aspect = asset.trimWidth > 0 && asset.trimHeight > 0
      ? asset.trimHeight / asset.trimWidth
      : 1;
    const selected = animal.id === LG.state.selectedIndividualId;
    const width = definition.worldWidth * (selected ? 1.08 : 1);
    const height = width * aspect;
    const bob = Math.sin(timestamp * 0.006 + (animal.bobPhase || 0)) * 0.7;

    context.save();
    context.translate(animal.x, animal.y + bob);
    context.rotate(Number(animal.angle) || 0);
    context.globalAlpha = stage === "elder" ? 0.76 : 1;
    context.imageSmoothingEnabled = true;
    context.drawImage(asset.renderable, -width * 0.5, -height * 0.54, width, height);
    context.restore();
    drawSelection(context, animal, width);
    return true;
  }

  function renderFrame(timestamp = 0) {
    if (!overlayCanvas || !overlayContext || !LG.camera || !LG.state) return false;
    resizeOverlay();
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    renderedGrazers = 0;
    fallbackGrazers = 0;
    selectedSpriteVisible = false;

    overlayContext.save();
    LG.camera.apply(overlayContext);
    for (const grazer of LG.state.grazers || []) {
      if (typeof LG.camera.isVisible === "function" && !LG.camera.isVisible(grazer, 90)) continue;
      const resolved = resolveGrazerSprite(grazer);
      if (drawGrazerSprite(overlayContext, grazer, timestamp, resolved)) {
        renderedGrazers += 1;
        if (grazer.id === LG.state.selectedIndividualId) selectedSpriteVisible = true;
      } else {
        fallbackGrazers += 1;
      }
    }
    overlayContext.restore();
    renderedFrames += 1;
    return true;
  }

  function mount() {
    const baseCanvas = document.querySelector("#worldCanvas");
    const frame = document.querySelector(".world-frame");
    if (!baseCanvas || !frame || overlayCanvas) return false;

    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "deerSpriteCanvas";
    overlayCanvas.setAttribute("aria-hidden", "true");
    Object.assign(overlayCanvas.style, {
      position: "absolute",
      inset: "0",
      zIndex: "2",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    overlayContext = overlayCanvas.getContext("2d");
    resizeOverlay();
    frame.append(overlayCanvas);

    const loop = (timestamp) => {
      renderFrame(timestamp);
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
    return true;
  }

  LG.getDeerSpriteMapping = () => ({
    juvenile: { any: { ...spriteMapping.juvenile.any } },
    adult: {
      male: { ...spriteMapping.adult.male },
      female: { ...spriteMapping.adult.female },
    },
    elder: {
      male: { ...spriteMapping.elder.male },
      female: { ...spriteMapping.elder.female },
    },
  });
  LG.renderDeerSpriteFrame = renderFrame;
  LG.getDeerSpriteDiagnostics = () => ({
    version: "deer-sprites-v1",
    overlayMounted: Boolean(overlayCanvas && overlayContext),
    renderedFrames,
    renderedGrazers,
    fallbackGrazers,
    selectedSpriteVisible,
    assets: [...assets.values()].map((asset) => ({
      key: asset.key,
      path: asset.path,
      status: asset.status,
      sourceWidth: asset.sourceWidth,
      sourceHeight: asset.sourceHeight,
      trimWidth: asset.trimWidth,
      trimHeight: asset.trimHeight,
      backgroundPixelsRemoved: asset.backgroundPixelsRemoved,
      processed: asset.processed,
      error: asset.error,
    })),
  });
  LG.deerSpriteModel = Object.freeze({
    version: "deer-sprites-v1",
    renderer: "camera-aware-overlay-canvas",
    integratedSpecies: Object.freeze(["grazer"]),
    stages: Object.freeze(["juvenile", "adult", "elder"]),
    sexAwareAdults: true,
    juvenileIgnoresSex: true,
    backgroundRemoval: "border-connected-corner-color-v1",
    programDrawingFallback: true,
    preservesPointerInteraction: true,
    terrainSpritesEnabled: false,
  });

  preloadDeerSprites();
  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", mount, { once: true });
  }
})();
