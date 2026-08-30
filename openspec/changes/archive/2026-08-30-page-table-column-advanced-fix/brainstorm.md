## Design Summary

PAGE 类型页面（PageRendererPage → form-create → page-table → PageDataTable）中，数据表格的自定义列高级配置（模板 `contentType/contentValue`、样式 `className/styleExpr`、列级点击事件 `onCellClick`、计算列 `custom`、隐藏 `hidden`）无法生效。

**根因**：`DsBindingConfigDialog.vue`（PAGE 页面里 page-table 的列配置弹窗，复用 QueryColumnsConfig + ColumnAdvancedConfig）在**加载**（`initTableData`，L338-345）和**保存**（`handleConfirm`，L407-411）时对 `columns` 做**字段白名单重建**，只保留 `key/prop/label/width/align/formatter/fixed`，把高级字段全部丢弃。

```js
// handleConfirm L407-411 —— contentType/contentValue/className/styleExpr/onCellClick/custom/hidden 全丢
result.columns = tableData.columns.map((c: any) => ({
  prop: c.key ?? c.prop, label: c.label || c.key,
  width: c.width, align: c.align,
  formatter: c.formatter, fixed: c.fixed,
}))
```

**影响**：用户在 PAGE 弹窗里通过高级配置面板配的模板/表达式/样式/点击事件，写入 schema 前被清空 → `PageDataTable.resolvedColumns` 传给 `buildCellRender` 时拿不到高级字段 → 只渲染原始值；重新打开弹窗时已保存的 schema 中高级字段也已丢失。

**对比**：VIEW 链路（ViewDesigner → QueryColumnsConfig）直接 `v-model:columns` 到 schema，保存时 `JSON.stringify({...schema})` 不重建，且 `QueryColumnsConfig.saveAdvanced`（L440-446）显式写回高级字段 → 高级配置完整保留并生效。

## Alternatives Considered

### 方案 A：修复 DsBindingConfigDialog 字段保留（最小修复）
- **做法**：`initTableData` 加载时用 `{ ...c }` 保留列完整字段（仅归一化 `key`/`label`）；`handleConfirm` 保存时显式透传高级字段集合（`contentType/contentValue/className/styleExpr/onCellClick/custom/hidden`），与 VIEW 链路 `QueryColumnsConfig.saveAdvanced` 及后端 `ViewCompiler.compileColumns` 的透传字段保持一致。
- **優點**：改动集中在两个函数；与现有 VIEW 链路语义一致；不触碰渲染端与后端；回归测试可精确覆盖。
- **缺點**：字段清单需手动维护；未来新增列字段需同步 DsBindingConfigDialog。
- **為何未採納**：（此为推荐方案，采纳）

### 方案 B：抽取公共列字段清单（单一事实来源）
- **做法**：在 `tableColumnRenderer.ts` 或独立常量模块定义 `ADVANCED_COLUMN_FIELDS` 白名单，DsBindingConfigDialog 加载/保存复用该清单。
- **優點**：单一事实来源，新增字段只改一处；前端渲染/配置语义统一。
- **缺點**：后端 `ViewCompiler`（Java）无法复用前端常量，仍需在 Java 侧维护一份清单，实际只解决前端一半；改动面稍大；与"最小修复"原则相悖。
- **為何未採納**：收益有限（后端仍双份），复杂度高于需求。

### 方案 C：完全透传原始 columns（不做白名单重建）
- **做法**：`initTableData` 直接引用 `bp.columns`（浅拷贝），`handleConfirm` 直接透传整个 `columns` 数组，不做任何字段筛选。
- **優點**：最简单，绝不丢字段。
- **缺點**：会把非标准字段/意外结构一并带入 schema；`prop` 与 `key` 命名两种结构需统一归一化；失去对列结构的显式约束，易引入脏数据。
- **為何未採納**：牺牲了字段校验与结构清晰度，超出本修复需求。

## Agreed Approach

采用**方案 A**：

1. **`DsBindingConfigDialog.initTableData()`（L338-345）**：加载已有列时保留完整字段——`srcColumns.map((c) => ({ ...c, key: c.prop ?? c.key, label: c.label || c.prop || c.key }))`，不再丢弃高级字段。
2. **`DsBindingConfigDialog.handleConfirm()`（L407-411）**：保存列时在基础字段之外显式透传高级字段（`contentType/contentValue/className/styleExpr/onCellClick/custom/hidden`），字段名与 `PageDataTable.resolvedColumns` 读取的 `ColumnViewConfig` 一致（`key` 与 `prop` 双命名兼容）。
3. **回归测试**：新增/更新 `DsBindingConfigDialog.table.test.ts`，断言（a）打开弹窗回填时高级字段保留；（b）确认保存后 `emit('confirm')` 的 `columns` 含高级字段；（c）`PageDataTable` 渲染含 `contentType` 的列时模板/表达式生效（现有 `PageDataTable.test.ts` 列级定制用例已覆盖渲染端，保持通过）。

修复后 PAGE 链路与 VIEW 链路在列高级配置上的行为完全对齐。

## Key Decisions

- **修复范围**：仅 `DsBindingConfigDialog.vue` 两个函数（加载 + 保存）；不动渲染端（PageDataTable.resolvedColumns 已正确调用 buildCellRender）、不动后端（ViewCompiler 已透传高级字段）。
- **字段清单**：`contentType/contentValue/className/styleExpr/onCellClick/custom/hidden` 与 VIEW 链路 `QueryColumnsConfig.saveAdvanced` 及后端 `ViewCompiler.compileColumns` 的透传集合一致。
- **命名兼容**：schema 中列对象沿用现有 `prop` 命名（PageDataTable L308 `prop: c.key ?? c.prop` 双命名兼容），高级字段名不变。

## Open Questions

- 无（问题、根因、方案均已在探索阶段确认）。
