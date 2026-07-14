(() => {
  const groups = [
    {
      title: "动物素材",
      note: "透明背景可直接作为后续精灵候选",
      items: [
        { name: "灰狼 · 成年", path: "art/animals/wolf-adult.png", kind: "animal" },
        { name: "灰狼 · 幼崽", path: "art/animals/wolf-pup.png", kind: "animal" },
        { name: "雄鹿 · 成年", path: "art/animals/deer-buck.png", kind: "animal" },
        { name: "雌鹿 · 成年", path: "art/animals/deer-doe.png", kind: "animal" },
        { name: "鹿 · 幼崽", path: "art/animals/deer-fawn.png", kind: "animal" },
        { name: "淡水鱼 · 成年", path: "art/animals/fish-adult.png", kind: "animal" },
        { name: "淡水鱼 · 幼体（待抠图）", path: "art/animals/fish-juvenile-provisional.png", kind: "animal", note: "当前版本保留白底，暂不接入游戏" }
      ]
    },
    {
      title: "地形素材",
      note: "草地、水面与河岸拼接候选",
      items: [
        { name: "草地基础块", path: "art/terrain/grass-base.png", kind: "terrain" },
        { name: "水面基础块", path: "art/terrain/water-base.png", kind: "terrain" },
        { name: "河岸 · 横向", path: "art/terrain/riverbank-horizontal.png", kind: "terrain" },
        { name: "河岸 · 纵向", path: "art/terrain/riverbank-vertical.png", kind: "terrain" },
        { name: "河岸 · 内角", path: "art/terrain/riverbank-corner-inner.png", kind: "terrain" },
        { name: "河岸 · 外角", path: "art/terrain/riverbank-corner-outer.png", kind: "terrain" }
      ]
    }
  ];

  const root = document.getElementById("artPreviewGrid");
  if (!root) return;

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
})();