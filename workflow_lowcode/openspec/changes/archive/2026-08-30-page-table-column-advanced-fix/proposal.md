# Proposal — PAGE 页面 page-table 自定义列高级配置修复

## Why

PAGE 类型页面（PageRendererPage）中，数据表格（page-table → PageDataTable）的自定义列高级配置（模板 `contentType/contentValue`、样式 `className/styleExpr`、列级点击事件 `onCellClick`、计算列 `custom`、隐藏 `hidden`）无法生效：

- 列内容只显示原始值，模板/表达式不渲染；
- 保存配置后重新打开弹窗，高级配置丢失。

根因：PAGE 页面的列配置弹窗 `DsBindingConfigDialog.vue`（数据表格配置弹窗，其"显示列"页签复用 QueryColumnsConfig + ColumnAdvancedConfig，高级配置入口是存在的）在**加载**（`initTableData` L338-345）与**保存**（`handleConfirm` L407-411）时对 `columns` 做字段白名单重建，只保留 `key/prop/label/width/align/formatter/fixed`，把高级字段全部丢弃。

渲染端（`PageDataTable.resolvedColumns` → `buildCellRender`）与后端（`ViewCompiler.compileColumns`）均已支持高级字段，唯独 PAGE 链路的列配置弹窗在写回时丢字段，导致配置-渲染断链。VIEW 链路（ViewDesigner 不重建 columns）行为正常，两条链路行为不一致。

## What Changes

修复 `frontend/src/views/form/components/DsBindingConfigDialog.vue` 的两个函数：

1. **`initTableData()`（L335-345）**：加载已有列时用 `{ ...c }` 保留列完整字段（仅归一化 `key`/`label`），不再丢弃高级字段。
2. **`handleConfirm()`（L407-411）**：保存列时在基础字段外显式透传高级字段（`contentType/contentValue/className/styleExpr/onCellClick/custom/hidden`），字段集合与 VIEW 链路 `QueryColumnsConfig.saveAdvanced` 及后端 `ViewCompiler.compileColumns` 保持一致。

新增/更新回归测试：断言 DsBindingConfigDialog 回填时保留高级字段、确认保存后 `emit('confirm')` 的 columns 含高级字段；PageDataTable 渲染含高级字段的列时模板/表达式/样式/点击事件生效。

## Capabilities

### Modified Capabilities

- **page-data-table**：新增 requirement —— PAGE 页面数据表格的列配置弹窗在加载与保存时 SHALL 保留列高级配置字段（`contentType/contentValue/className/styleExpr/onCellClick/custom/hidden`），确保自定义列配置端到端生效，与 VIEW 链路行为一致。

## Impact

- **代码**：`frontend/src/views/form/components/DsBindingConfigDialog.vue`（仅两个函数）+ 测试文件。
- **不改动**：`PageDataTable.vue`（渲染端已正确）、`tableColumnRenderer.ts`、`ViewCompiler.java`（后端已透传）、`QueryColumnsConfig.vue`、`ViewDesigner.vue`。
- **兼容性**：存量 schema（仅基础字段）加载后不变；新保存的 schema 增加高级字段，旧前端读取时忽略，无破坏性变更。
- **行为**：PAGE 与 VIEW 两条链路在列高级配置上行为对齐。
