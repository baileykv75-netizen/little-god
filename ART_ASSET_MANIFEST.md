# 美术资源清单

当前美术接入采用小步、可回退顺序：先验证动物精灵预加载、年龄映射、透明背景处理、缩放和选择反馈；动物切片稳定后，再单独处理草地、水面与河岸拼接。

## 动物

- `art/animals/wolf-adult.png`：灰狼成年；第 59 轮已映射为成年与老年猎食兽精灵。
- `art/animals/wolf-pup.png`：灰狼幼崽；第 59 轮已映射为幼年猎食兽精灵。
- `art/animals/deer-buck.png`：雄鹿成年；当前仍只预览，尚未替换食草兽渲染。
- `art/animals/deer-doe.png`：雌鹿成年；当前仍只预览，尚未替换食草兽渲染。
- `art/animals/deer-fawn.png`：鹿幼崽；当前仍只预览，尚未替换食草兽渲染。
- `art/animals/fish-adult.png`：淡水鱼成年；当前没有对应模拟物种，不接入。
- `art/animals/fish-juvenile-provisional.png`：淡水鱼幼体，当前仍保留白色背景，暂不接入游戏。

### 第 59 轮狼精灵接入约定

- 现有狼 PNG 为 RGB 图片，没有原生 Alpha 通道；加载后通过“从四周边缘连通的浅色背景区域”运行时抠图。
- 精灵在独立、相机同步且 `pointer-events: none` 的 Canvas 图层绘制，不改变选择、拖动、缩放或投放命中逻辑。
- 幼年猎食兽使用 `wolf-pup.png`；成年与老年猎食兽使用 `wolf-adult.png`，老年继续保留透明度衰减。
- 任一图片尚未加载或加载失败时，不阻断运行；原有程序绘制继续作为回退。
- 本轮只接入猎食兽，不同时替换鹿、鱼或地形。

## 地形

- `art/terrain/grass-base.png`：草地基础块
- `art/terrain/water-base.png`：水面基础块
- `art/terrain/riverbank-horizontal.png`：横向河岸
- `art/terrain/riverbank-vertical.png`：纵向河岸
- `art/terrain/riverbank-corner-inner.png`：内角河岸
- `art/terrain/riverbank-corner-outer.png`：外角河岸

## 后续接入顺序

1. 用浏览器截图验收狼精灵在全景与放大状态下的比例、背景抠除、朝向和选择环；若不合格，只调整狼精灵切片。
2. 狼精灵稳定后，单独接入鹿的性别/年龄映射与程序绘制回退。
3. 动物精灵稳定后，再为草地、水面与河岸建立独立地形贴图原型。
4. 地形拼接通过截图和回归后，才考虑替换主 Canvas 的程序地表绘制。
