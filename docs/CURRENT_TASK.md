# CURRENT TASK — Genesis v0.2 / 检查点 2

## 任务名称

连续生态地表。

## 本阶段唯一目标

彻底替换圆形草地斑块，建立连续、可计算、可渲染的生态地表。植物、季节变化、食草兽局部觅食、根系、种子和诊断必须共享同一份网格数据。

## 固定规格

```text
生态网格：64 × 40
单元尺寸：32 × 32
总单元：2560
```

每个单元至少保存：

```text
greenBiomass
dryBiomass
rootBiomass
seedBank
fertility
moisture
grazingPressure
lastDisturbedYear
```

## 必须完成

1. 网格数据、植物模拟和地表渲染保持分离；建议分别放在 `world-grid.js`、`vegetation-v2.js`、`terrain-renderer.js`，也可按现有结构调整命名。
2. 旧的 `patch.x / patch.y / patch.radius` 不再作为植物主结构，也不再参与动物觅食。
3. 相邻单元平滑渲染，不能显示棋盘格边界；植物区域边缘应连续且不规则。
4. 春季返绿、秋冬枯黄、根系复苏和种子扩散必须是空间过程。
5. 食草兽只消耗当前位置附近对应单元的地表资源；集中啃食形成不规则裸地。
6. 根系负责已有区域的原地复苏；种子负责裸地恢复和扩散。两者均有明确的收入、支出、衰退和诊断数据。
7. 植物生长受邻域、生物量、肥力、根系、湿度和季节影响；种子和根系不得无限累积。
8. 保留相机缩放、拖动、选择、双击跟随、暂停、速度切换、投放和诊断导出。
9. 诊断至少输出绿地覆盖率、裸地覆盖率、根系覆盖率、种子预算和啃食热点。

## 自动验收契约

实现 `LittleGod.getTerrainDiagnostics()`，返回可 JSON 序列化对象：

```js
{
  grid: { columns: 64, rows: 40, cellSize: 32 },
  coverage: { green: 0..1, barren: 0..1, root: 0..1 },
  resources: { greenBiomass, dryBiomass, rootBiomass, seedBank },
  grazingHotspots: [],
  usesLegacyPatchFood: false
}
```

这个对象用于浏览器验收和诊断，不替代游戏内玩家界面。

## 明确不做

- 种群活动热区；
- 新的 Observation / 记忆系统；
- 求偶和生命周期重构；
- 超凡技能、血脉技能或基因编辑；
- 群体、独狼、领地或物种分化；
- 文明、宗教、科技树、联机或服务器。

## 验收重点

1. 页面中不再看到完整绿色圆形草地；
2. 植被地表连续、平滑且不规则；
3. 动物经过后形成可见啃食缺口；
4. 动物进食位置与地表资源位置一致；
5. 春季返绿和冬季枯萎为连续空间过程；
6. 2560 个单元运行流畅，无致命控制台错误；
7. 所有原有相机和基础交互继续工作；
8. 本阶段完成后停止，更新 `docs/HANDOFF.md` 并等待人工试玩。
