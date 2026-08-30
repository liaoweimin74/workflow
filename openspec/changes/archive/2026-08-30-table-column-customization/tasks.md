# 变更：数据表格列定制能力（tasks）

## 1. 公共基础（scriptSandbox 扩展 + 公共列渲染模块）

- [x] 1.1 scriptSandbox.ts 新增 `evalCellExpression(source, context)`：复用 `createSandbox`，以 `return (expr)` 求值单表达式并返回结果；异常捕获返回 `undefined`；注入上下文 `{ $row, row, value, column }`
- [x] 1.2 新建 `utils/tableColumnRenderer.ts`，实现 `getCellValue(row, key)`（优先 `row.data?.[key]`、回退 `row[key]`）
- [x] 1.3 实现 `interpolateTemplate(tpl, row)`：`${field}` 插值，支持多级字段 `${a.b}`
- [x] 1.4 实现 `renderCellContent(config, row)`：按 expression > template > formatter > 原始值 顺序，空值显示 '—'；formatter 复用 formatCellValue
- [x] 1.5 实现 `buildCellRender(config)`：返回可注入 TableColumn.render 的函数，内部承载内容 + className/styleExpr 样式（包 span）

## 2. TableColumn / SearchTable 预留 cellClassName

- [x] 2.1 types.ts 的 `TableColumn` 增加可选 `cellClassName?: string`
- [x] 2.2 SearchTable.vue 将 `cellClassName` 静态透传到 el-table-column 的 `class-name`（undefined 时透传空，不破坏现有调用）

## 3. 接入 PageRenderer（query-page-renderer delta）

- [x] 3.1 PageRenderer 的 `searchTableColumns` 改用 `buildCellRender`/`renderCellContent`/`getCellValue`，支持 template/expression/className/styleExpr
- [x] 3.2 PageRenderer 的 `handleCellClick` 增加列级 `onCellClick` 分发：命中列且有 onCellClick 时执行列级动作链并短路整表级 cell-click；否则走原 viewEvents 事件链
- [x] 3.3 列级动作执行复用现有动作执行器（dispatchButtonAction/UE 事件，含 script）

## 4. 接入 PageDataTable（page-data-table delta）

- [x] 4.1 PageDataTable 的 `resolvedColumns` 改用公共模块（buildCellRender/renderCellContent/getCellValue）
- [x] 4.2 PageDataTable 的 `handleCellClick` 增加列级 onCellClick 分发并短路整表级（同 3.2 逻辑）

## 5. Schema 扩展（ViewDesigner）

- [x] 5.1 ViewDesigner.vue 的 `ColumnViewConfig` 增加 `template?/expression?/className?/styleExpr?/onCellClick?` 字段

## 6. 设计器面板（QueryColumnsConfig）

- [x] 6.1 QueryColumnsConfig 每行增加"高级配置"按钮 → 弹出子面板编辑 template/expression/className/styleExpr/onCellClick
- [x] 6.2 保存后列配置包含对应字段（含 onCellClick 动作链编辑）
- [x] 6.3 QueryColumnsConfig 增加"＋ 添加自定义列"入口：key 自由输入（不必是数据源字段）+ 可选 label，追加进 columns，配合高级配置生成计算列（补齐 spec 自定义列能力对用户的可达性）
- [x] 6.4 清理未接线死代码 `ColumnsConfig.vue`（无任何 import 引用；实际生效面板为 QueryColumnsConfig，被 ViewDesigner / DsBindingConfigDialog 引用）

## 7. 单元测试

- [x] 7.1 scriptSandbox.test.ts 增加 `evalCellExpression` 测试（求值/异常/上下文 $row 与 value）
- [x] 7.2 新建 tableColumnRenderer.test.ts：getCellValue（内层/扁平）、interpolateTemplate（含多级字段）、renderCellContent（优先级/空值）、buildCellRender（样式/内容）
- [x] 7.3 PageDataTable.test.ts 增加列级 onCellClick 短路与整表级回退测试
- [x] 7.4 PageRenderer.test.ts 增加列级 onCellClick 分发与公共渲染测试
- [x] 7.5 QueryColumnsConfig.test.ts 增加"高级配置子面板"与"添加自定义列"测试（open/save/校验）

## 8. 验证

- [x] 8.1 运行前端测试（vitest）：基线 34 failed / 527 passed；本分支 34 failed / 555 passed —— +28 新增用例全过，零新增失败（34 失败均为预存）
- [x] 8.2 运行构建（build）成功；vue-tsc 基线 25 errors = 本分支 25 errors（零新增类型错误）
