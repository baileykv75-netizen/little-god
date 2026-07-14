(() => {
  "use strict";

  const groups = [
    {
      title: "动物素材",
      note: "灰狼已进入 Canvas 精灵试运行；鹿与鱼仍只作为后续候选",
      items: [
        { name: "灰狼 · 成年", path: "art/animals/wolf-adult.png", kind: "animal", note: "已映射成年与老年猎食兽" },
        { name: "灰狼 · 幼崽", path: "art/animals/wolf-pup.png", kind: "animal", note: "已映射幼年猎食兽" },
        { name: "雄鹿 · 成年", path: "art/animals/deer-buck.png", kind: "animal" },
        { name: "雌鹿 · 成年", path: "art/animals/deer-doe.png", kind: "animal" },
        { name: "鹿 · 幼崽", path: "art/animals/deer-fawn.png", kind: "animal" },
        { name: "淡水鱼 · 成年", path: "art/animals/fish-adult.png", kind: "animal" },
        { name: "淡水鱼 · 幼体（待抠图）", path: "art/animals/fish-juvenile-provisional.png", kind: "animal", note: "当前版本保留白底，暂不接入游戏" },
      ],
    },
    {
      title: "地形素材",
      note: "草地、水面与河岸仍保持独立预览，等待动物精灵验收稳定后再接入",
      items: [
        { name: "草地基础块", path: "art/terrain/grass-base.png", kind: "terrain" },
        { name: "水面基础块", path: "art/terrain/water-base.png", kind: "terrain" },
        { name: "河岸 · 横向", path: "art/terrain/riverbank-horizontal.png", kind: "terrain" },
        { name: "河岸 · 纵向", path: "art/terrain/riverbank-vertical.png", kind: "terrain" },
        { name: "河岸 · 内角", path: "art/terrain/riverbank-corner-inner.png", kind: "terrain" },
        { name: "河岸 · 外角", path: "art/terrain/riverbank-corner-outer.png", kind: "terrain" },
      ],
    },
  ];

  const spriteMapping = Object.freeze({
    hunter: Object.freeze({
      juvenile: Object.freeze({ key: "wolf-pup", path: "art/animals/wolf-pup.png", worldWidth: 34 }),
      adult: Object.freeze({ key: "wolf-adult", path: "art/animals/wolf-adult.png", worldWidth: 46 }),
      elder: Object.freeze({ key: "wolf-adult", path: "art/animals/wolf-adult.png", worldWidth: 43 }),
    }),
  });

  const assets = new Map();
  let overlayCanvas = null;
  let overlayContext = null;
  let renderedFrames = 0;
  let renderedHunters = 0;
  let fallbackHunters = 0;
  let selectedSpriteVisible = false;

  function renderPreviewGallery() {
    const root = document.getElementById("artPreviewGrid");
    if (!root) return false;

    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const groupEl = document.createElement("section");
      groupEl.className = "art-preview-group";
      groupEl.setAttribute("aria-label", group.title);
      groupEl.innerHTML = '<div class="art-preview-group-heading"><h3></h3><span></span></div>';
      groupEl.querySelector("h3").textContent = group.title;
      groupEl.querySelector("span").textContent = group.note;

      const grid = document.createElement("div");
      grid.className = "art-preview-grid";
      for (const item of group.items) {
        const figure = document.createElement("figure");
        figure.className = "art-preview-card";
        figure.dataset.kind = item.kind;
        const imageBox = document.createElement("div");
        imageBox.className = "art-preview-image";
        const image = new Image();
        image.loading = "lazy";
        image.decoding = "async";
        image.alt = item.name;
        image.src = item.path;
        image.addEventListener("error", () => figure.classList.add("is-missing"), { once: true });
        imageBox.append(image);
        const caption = document.createElement("figcaption");
        const title = document.createElement("strong");
        title.textContent = item.name;
        caption.append(title);
        if (item.note) {
          const note = document.createElement("small");
          note.textContent = item.note;
          caption.append(note);
        }
        figure.append(imageBox, caption);
        grid.append(figure);
      }
      groupEl.append(grid);
      fragment.append(groupEl);
    }
    root.replaceChildren(fragment);
    return true;
  }

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
    if (!sourceWidth || !sourceHeight) throw new Error("Sprite image has no dimensions");

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

    if (maxX < minX || maxY < minY) throw new Error("Sprite background removal erased the full image");
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

  function preloadHunterSprites() {
    const unique = new Map();
    for (const definition of Object.values(spriteMapping.hunter)) unique.set(definition.key, definition);
    for (const definition of unique.values()) preloadSprite(definition);
  }

  function resolveHunterSprite(animal) {
    const stage = typeof window.LittleGod?.lifeStage === "function"
      ? window.LittleGod.lifeStage(animal)
      : "adult";
    const definition = spriteMapping.hunter[stage] || spriteMapping.hunter.adult;
    return {
      stage,
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

  function drawHunterSprite(context, animal, timestamp, resolved) {
    const LG = window.LittleGod;
    const { definition, asset, stage } = resolved;
    if (!asset?.renderable || !asset.status.startsWith("ready")) return false;
    const aspect = asset.trimWidth > 0 && asset.trimHeight > 0
      ? asset.trimHeight / asset.trimWidth
      : 1;
    const selected = animal.id === LG.state.selectedIndividualId;
    const width = definition.worldWidth * (selected ? 1.08 : 1);
    const height = width * aspect;
    const bob = Math.sin(timestamp * 0.007 + (animal.bobPhase || 0)) * 0.55;

    context.save();
    context.translate(animal.x, animal.y + bob);
    context.rotate(Number(animal.angle) || 0);
    context.globalAlpha = stage === "elder" ? 0.78 : 1;
    context.imageSmoothingEnabled = true;
    context.drawImage(asset.renderable, -width * 0.5, -height * 0.52, width, height);
    context.restore();

    if (selected) {
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
    }
    return true;
  }

  function renderSpriteFrame(timestamp = 0) {
    const LG = window.LittleGod;
    if (!overlayCanvas || !overlayContext || !LG?.camera || !LG.state) return false;
    resizeOverlay();
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    renderedHunters = 0;
    fallbackHunters = 0;
    selectedSpriteVisible = false;

    overlayContext.save();
    LG.camera.apply(overlayContext);
    for (const hunter of LG.state.hunters || []) {
      if (typeof LG.camera.isVisible === "function" && !LG.camera.isVisible(hunter, 80)) continue;
      const resolved = resolveHunterSprite(hunter);
      if (drawHunterSprite(overlayContext, hunter, timestamp, resolved)) {
        renderedHunters += 1;
        if (hunter.id === LG.state.selectedIndividualId) selectedSpriteVisible = true;
      } else {
        fallbackHunters += 1;
      }
    }
    overlayContext.restore();
    renderedFrames += 1;
    return true;
  }

  function mountSpriteOverlay() {
    const baseCanvas = document.querySelector("#worldCanvas");
    const frame = document.querySelector(".world-frame");
    if (!baseCanvas || !frame || overlayCanvas) return false;

    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "animalSpriteCanvas";
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
      renderSpriteFrame(timestamp);
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
    return true;
  }

  const LG = window.LittleGod;
  if (LG) {
    LG.getAnimalSpriteMapping = () => ({
      hunter: {
        juvenile: { ...spriteMapping.hunter.juvenile },
        adult: { ...spriteMapping.hunter.adult },
        elder: { ...spriteMapping.hunter.elder },
      },
    });
    LG.renderAnimalSpriteFrame = renderSpriteFrame;
    LG.getAnimalSpriteDiagnostics = () => ({
      version: "animal-sprites-v1",
      overlayMounted: Boolean(overlayCanvas && overlayContext),
      renderedFrames,
      renderedHunters,
      fallbackHunters,
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
    LG.animalSpriteModel = Object.freeze({
      version: "animal-sprites-v1",
      renderer: "camera-aware-overlay-canvas",
      integratedSpecies: Object.freeze(["hunter"]),
      stages: Object.freeze(["juvenile", "adult", "elder"]),
      backgroundRemoval: "border-connected-corner-color-v1",
      programDrawingFallback: true,
      preservesPointerInteraction: true,
      terrainSpritesEnabled: false,
    });
  }

  renderPreviewGallery();
  preloadHunterSprites();
  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", mountSpriteOverlay, { once: true });
  }
})();
