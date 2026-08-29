# 变更：数据表格列定制能力（tasks）

## 1. 公共基础（scriptSandbox 扩展 + 公共列渲染模块）

- [ ] 1.1 scriptSandbox.ts 新增 `evalCellExpression(source, context)`：复用 createSandbox，以 `return (expr)` 求值单表达式并返回结果；异常捕获返回 undefined；注入上下文 `{ $row, row, value, column }`
- [ ] 1.2 新建 `utils/tableColumnRenderer.ts`，实现 `getCellValue(row, key)`（优先 `row.data?.[key]`、回退 `row[key]`）
- [ ] 1.3 实现 `interpolateTemplate(tpl, row)`：`${field}` 插值，支持多级字段 `${a.b}`
- [ ] 1.4 实现 `renderCellContent(config, row)`：按 expression > template > formatter > 原始值 顺序，空值显示 '—'；formatter 复用 formatCellValue
- [ ] 1.5 实现 `buildCellRender(config)`：返回可注入 TableColumn.render 的函数，内部承载内容 + className/styleExpr 样式（包 span）

## 2. TableColumn / SearchTable 预留 cellClassName

- [ ] 2.1 types.ts 的 `TableColumn` 增加可选 `cellClassName?: string`
- [ ] 2.2 SearchTable.vue 将 `cellClassName` 静态透传到 el-table-column 的 `class-name`（undefined 时透传空，不破坏现有调用）

## 3. 接入 PageRenderer（query-page-renderer delta）

- [ ] 3.1 PageRenderer 的 `searchTableColumns` 改用 `buildCellRender`/`renderCellContent`/`getCellValue`，支持 template/expression/className/styleExpr
- [ ] 3.2 PageRenderer 的 `handleCellClick` 增加列级 `onCellClick` 分发：命中列且有 onCellClick 时执行列级动作链并短路整表级 cell-click；否则走原 viewEvents 事件链
- [ ] 3.3 列级动作执行复用现有动作执行器（dispatchButtonAction/UE 事件，含 script）

## 4. 接入 PageDataTable（page-data-table delta）

- [ ] 4.1 PageDataTable 的 `resolvedColumns` 改用公共模块（buildCellRender/renderCellContent/getCellValue）
- [ ] 4.2 PageDataTable 的 `handleCellClick` 增加列级 onCellClick 分发并短路整表级（同 3.2 逻辑）

## 5. Schema 扩展（ViewDesigner）

- [ ] 5.1 ViewDesigner.vue 的 `ColumnViewConfig` 增加 `template?/expression?/className?/styleExpr?/onCellClick?` 字段

## 6. 设计器面板（QueryColumnsConfig / ColumnsConfig）

- [ ] 6.1 QueryColumnsConfig 每行增加"高级配置"按钮 → 弹出子面板编辑 template/expression/className/styleExpr/onCellClick
- [ ] 6.2 保存后列配置包含对应字段（含 onCellClick 动作链编辑）

## 7. 单元测试

- [ ] 7.1 scriptSandbox.test.ts 增加 `evalCellExpression` 测试（求值/异常/上下文 $row 与 value）
- [ ] 7.2 新建 tableColumnRenderer.test.ts：getCellValue（内层/扁平）、interpolateTemplate（含多级字段）、renderCellContent（优先级/空值）、buildCellRender（样式/内容）
- [ ] 7.3 PageDataTable.test.ts 增加列级 onCellClick 短路与整表级回退测试
- [ ] 7.4 PageRenderer.test.ts 增加列级 onCellClick 分发与公共渲染测试

## 8. 验证

- [ ] 8.1 运行前端测试（vitest）全部通过
- [ ] 8.2 运行构建（build）成功，lsp_diagnostics 无新增错误
