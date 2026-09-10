# Design — PAGE 页面 page-table 自定义列高级配置修复

## 背景

PAGE 类型页面（PageRendererPage → form-create → page-table → PageDataTable）中，数据表格的自定义列高级配置（`contentType/contentValue/className/styleExpr/onCellClick/custom/hidden`）不生效：模板/表达式只渲染原始值、重新打开配置丢失。

根因：`DsBindingConfigDialog.vue` 在加载（`initTableData`）与保存（`handleConfirm`）时对 `columns` 做字段白名单重建，丢弃高级字段。

## 现状分析

### 配置链路（PAGE）

```
PageDesigner ──▶ DsBindingConfigDialog（数据表格配置弹窗）
                   ├─ "显示列"页签复用 QueryColumnsConfig + ColumnAdvancedConfig（高级配置入口存在 ✓）
                   ├─ initTableData()  L338-345：columns 白名单重建 → 高级字段丢失 ✗
                   └─ handleConfirm()  L407-411：columns 白名单重建 → 高级字段丢失 ✗
                          ▼
                   schema.columns 只剩基础字段
                          ▼
                   PageDataTable.resolvedColumns → buildCellRender({ contentType: undefined })
                   → 模板/表达式不生效，只显示原始值
```

### 对比链路（VIEW，正常）

```
ViewDesigner ── v-model:columns="schema.columns"（不重建）
             ── 保存 JSON.stringify({...schema})（不重建）
             ── QueryColumnsConfig.saveAdvanced L440-446 显式写回高级字段
             ── 后端 ViewCompiler.compileColumns L210-220 透传高级字段
             ── PageRenderer.searchTableColumns → buildCellRender ✓
```

### 关键事实

- `PageDataTable.resolvedColumns`（L305-327）已正确调用 `buildCellRender`，读取 `c.contentType/contentValue/className/styleExpr` 等字段，且 `prop: c.key ?? c.prop` 双命名兼容——**渲染端无需改动**。
- 后端 `ViewCompiler.compileColumns`（L210-220）已透传高级字段——**后端无需改动**。
- 断点仅在 `DsBindingConfigDialog.vue` 的两个函数。

## 方案

### 1. `initTableData()`（L335-345）— 加载保留完整字段

将白名单重建改为保留全部字段（仅归一化 `key`/`label`）：

```ts
const srcColumns = (bp.columns && bp.columns.length > 0)
  ? bp.columns
  : tableCandidates.value.map((c: any) => ({ prop: c.key, label: c.label || c.key }))
tableData.columns = srcColumns.map((c: any) => ({
  ...c,                                  // 保留完整字段（含 contentType/contentValue/className/styleExpr/onCellClick/custom/hidden）
  key: c.prop ?? c.key,
  label: c.label || c.prop || c.key,
}))
```

### 2. `handleConfirm()`（L407-411）— 保存透传高级字段

在基础字段之外显式透传高级字段（与 `QueryColumnsConfig.saveAdvanced` 及 `ViewCompiler.compileColumns` 字段集合一致）：

```ts
result.columns = tableData.columns.map((c: any) => ({
  prop: c.key ?? c.prop,
  label: c.label || c.key,
  width: c.width,
  align: c.align,
  formatter: c.formatter,
  fixed: c.fixed,
  ...(c.contentType !== undefined ? { contentType: c.contentType } : {}),
  ...(c.contentValue !== undefined ? { contentValue: c.contentValue } : {}),
  ...(c.className !== undefined ? { className: c.className } : {}),
  ...(c.styleExpr !== undefined ? { styleExpr: c.styleExpr } : {}),
  ...(c.onCellClick !== undefined ? { onCellClick: c.onCellClick } : {}),
  ...(c.custom !== undefined ? { custom: c.custom } : {}),
  ...(c.hidden !== undefined ? { hidden: c.hidden } : {}),
}))
```

> 说明：`hidden` 字段由 `QueryColumnsConfig` 维护（自定义列取消展示时置 true，见 L383）。`PageDataTable.resolvedColumns`（L306）会 `filter(!c.hidden)` 跳过隐藏列。保存时保留 `hidden` 才能维持"隐藏列定义但不渲染"的语义。

## 数据流（修复后）

```
PageDesigner ──▶ DsBindingConfigDialog
                   ├─ initTableData() 保留完整字段 → 弹窗内可继续编辑高级配置 ✓
                   └─ handleConfirm() 透传高级字段 → schema.columns 含 contentType 等 ✓
                          ▼
                   schema.columns { prop, label, width, align, formatter, fixed,
                                    contentType, contentValue, className,
                                    styleExpr, onCellClick, custom, hidden }
                          ▼
                   PageDataTable.resolvedColumns → buildCellRender(contentType...) ✓
                   → 模板/表达式/样式/点击事件全部生效
```

## 测试

1. **`DsBindingConfigDialog.table.test.ts`（新增/更新）**
   - 回填：`bindingProps.columns` 含高级字段 → 打开弹窗后 `tableData.columns` 保留高级字段。
   - 保存：配置列含 `contentType/contentValue/className/styleExpr/onCellClick/custom/hidden` → `emit('confirm')` 的 `result.columns` 含全部高级字段。
2. **`PageDataTable.test.ts`** 现有"列级定制"用例（L194-252）覆盖渲染端模板/表达式/样式/点击事件，保持通过，证明修复后 PAGE 链路端到端生效。

## 影响范围

- **改动文件**：`frontend/src/views/form/components/DsBindingConfigDialog.vue`（仅两个函数）+ 对应测试文件。
- **不改动**：`PageDataTable.vue`、`tableColumnRenderer.ts`、`ViewCompiler.java`、`QueryColumnsConfig.vue`、`ViewDesigner.vue`。
- **兼容性**：现有保存的 schema（只有基础字段）加载后字段不变；新保存的 schema 增加高级字段，老版本前端读不到会被忽略（无破坏）。
