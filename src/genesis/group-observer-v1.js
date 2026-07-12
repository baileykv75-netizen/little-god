(() => {
  "use strict";

  const LG = window.LittleGod;
  if (!LG) throw new Error("Group observer requires LittleGod core");

  let enabled = false;
  let overlayCanvas = null;
  let overlayContext = null;
  let toggleButton = null;
  let renderedFrames = 0;

  function animalsById() {
    return new Map([
      ...(LG.state?.grazers || []),
      ...(LG.state?.hunters || []),
    ].map((animal) => [animal.id, animal]));
  }

  function collectGroups() {
    const animals = animalsById();
    const groups = new Map();
    for (const animal of animals.values()) {
      const group = animal.groupBehavior;
      if (!group?.groupId) continue;
      if (!groups.has(group.groupId)) {
        groups.set(group.groupId, {
          id: group.groupId,
          type: animal.type,
          role: group.role,
          support: Number(group.support) || 0,
          members: [],
        });
      }
      groups.get(group.groupId).members.push(animal);
    }

    return [...groups.values()]
      .filter((group) => group.members.length >= 2)
      .map((group) => {
        const center = group.members.reduce((total, animal) => ({
          x: total.x + animal.x,
          y: total.y + animal.y,
        }), { x: 0, y: 0 });
        center.x /= group.members.length;
        center.y /= group.members.length;
        const radius = Math.max(
          34,
          ...group.members.map((animal) => Math.hypot(animal.x - center.x, animal.y - center.y) + 28),
        );
        return {
          id: group.id,
          type: group.type,
          role: group.role,
          support: group.support,
          size: group.members.length,
          center,
          radius,
          memberIds: group.members.map((animal) => animal.id).sort((a, b) => a - b),
        };
      });
  }

  LG.getGroupOverlaySnapshot = () => ({
    enabled,
    groups: collectGroups(),
  });

  function drawGroup(context, group) {
    const isHerd = group.type === "grazer";
    const stroke = isHerd ? "rgba(222, 158, 61, 0.78)" : "rgba(113, 84, 177, 0.8)";
    const fill = isHerd ? "rgba(236, 183, 87, 0.1)" : "rgba(126, 96, 190, 0.11)";
    const label = isHerd ? `兽群 ${group.size}` : `猎群 ${group.size}`;
    const zoom = Math.max(0.45, LG.camera?.zoom || 1);

    context.save();
    context.fillStyle = fill;
    context.strokeStyle = stroke;
    context.lineWidth = 2 / zoom;
    context.setLineDash([8 / zoom, 7 / zoom]);
    context.beginPath();
    context.arc(group.center.x, group.center.y, group.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = stroke;
    context.font = `${Math.max(11, 12 / zoom)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(label, group.center.x, group.center.y - group.radius - 5 / zoom);
    context.restore();
  }

  function resizeOverlay() {
    const baseCanvas = document.querySelector("#worldCanvas");
    if (!baseCanvas || !overlayCanvas) return false;
    if (overlayCanvas.width !== baseCanvas.width) overlayCanvas.width = baseCanvas.width;
    if (overlayCanvas.height !== baseCanvas.height) overlayCanvas.height = baseCanvas.height;
    return true;
  }

  function renderFrame() {
    if (!overlayCanvas || !overlayContext) return false;
    resizeOverlay();
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!enabled || !LG.camera) return false;

    const groups = collectGroups();
    overlayContext.save();
    LG.camera.apply(overlayContext);
    for (const group of groups) drawGroup(overlayContext, group);
    overlayContext.restore();
    renderedFrames += 1;
    return true;
  }

  function syncButton() {
    if (!toggleButton) return;
    toggleButton.setAttribute("aria-pressed", String(enabled));
    toggleButton.classList.toggle("is-active", enabled);
    toggleButton.textContent = enabled ? "隐藏群体" : "显示群体";
  }

  LG.setGroupOverlayEnabled = (value) => {
    enabled = Boolean(value);
    if (enabled && typeof LG.refreshSocialGroups === "function") LG.refreshSocialGroups();
    syncButton();
    renderFrame();
    return enabled;
  };
  LG.renderGroupOverlayFrame = renderFrame;

  function mount() {
    const baseCanvas = document.querySelector("#worldCanvas");
    const frame = document.querySelector(".world-frame");
    const cameraControls = document.querySelector("#cameraControls");
    if (!baseCanvas || !frame || !cameraControls || overlayCanvas) return false;

    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "groupObserverCanvas";
    overlayCanvas.className = "group-observer-canvas";
    overlayCanvas.setAttribute("aria-hidden", "true");
    overlayContext = overlayCanvas.getContext("2d");
    resizeOverlay();
    frame.append(overlayCanvas);

    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "camera-group-toggle";
    toggleButton.setAttribute("aria-pressed", "false");
    toggleButton.textContent = "显示群体";
    cameraControls.append(toggleButton);
    toggleButton.addEventListener("click", () => {
      const next = LG.setGroupOverlayEnabled(!enabled);
      LG.showToast?.(next ? "已显示兽群与猎群边界" : "已隐藏群体边界");
    });

    const loop = () => {
      renderFrame();
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
    return true;
  }

  LG.getGroupObserverDiagnostics = () => ({
    version: "group-observer-v1",
    mounted: Boolean(overlayCanvas && toggleButton),
    enabled,
    visibleGroups: collectGroups().length,
    renderedFrames,
  });
  LG.groupObserverModel = Object.freeze({
    version: "group-observer-v1",
    toggleable: true,
    rendersHerds: true,
    rendersPacks: true,
    cameraAware: true,
  });

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", mount, { once: true });
  }
})();
