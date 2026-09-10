# 变更：数据表格列定制能力（proposal）

## Why

当前数据表格的列定制能力在低代码 schema 层严重缺失：`ColumnViewConfig` 仅有 `key/label/width/align/fixed/formatter`，设计者无法在 JSON 配置中表达**自定义列、列样式、单元格点击事件、动态列内容**。而底层 `TableColumn.render` 是 JS 函数，无法存入可在线编辑的 schema，导致高级定制只能依赖写代码。同时 PageRenderer 与 PageDataTable 两条渲染链路各自实现列取值/格式化，逻辑重复、行为易漂移。本变更把这些能力以**纯声明式 JSON**呈现，并提炼公共列渲染模块，使配置驱动统一、可复用。预期收益：设计者零编码完成列级定制，渲染行为一致，公共逻辑可测可维护。

## What Changes

**列配置 schema 扩展（`ColumnViewConfig`）**
- From: `key/label/width/align/fixed/formatter`（formatter 为字符串映射；render 为代码函数）
- To: 新增 `template`（`${field}` 插值）、`expression`（沙箱求值，`$row.xxx`）、`className`（静态 class）、`styleExpr`（条件样式）、`onCellClick`（列级点击事件，`{ actions }`）
- Reason: 以 JSON 可序列化方式表达动态内容/样式/事件，复用现有 scriptSandbox
- Impact: non-breaking（新增可选字段）

**列值/渲染统一（公共模块）**
- From: PageDataTable `resolvedColumns` 与 PageRenderer `searchTableColumns` 各自实现列取值/格式化/渲染
- To: 新建 `utils/tableColumnRenderer.ts`，提供 `getCellValue`（兼容 `row.data` 内层/扁平）、`interpolateTemplate`、`renderCellContent`（expression > template > formatter > 原始值）、`buildCellRender`（承载内容 + 样式），两链路共用
- Reason: 统一取值与渲染，行为一致、可测
- Impact: non-breaking，替换内部实现

**单元格点击事件：列级**
- From: 仅整表级 `cell-click` → `viewEvents` 事件链
- To: 列级 `onCellClick` 存在时短路整表级；未配置走原链路
- Reason: 不同列需要不同点击行为
- Impact: non-breaking（新增可选；列级存在时改变该列点击行为）

**列样式：render 承载 + 预留 cellClassName**
- From: 无列样式能力
- To: `className`/`styleExpr` 在 render 内承载（span）；`TableColumn` 预留可选 `cellClassName` 透传 el-table `class-name`（td）
- Impact: non-breaking

**设计器面板**
- From: 列配置面板仅有宽度/对齐/格式化/固定列
- To: 每行加"高级配置"子面板编辑 template/expression/className/styleExpr/onCellClick
- Impact: non-breaking

## Capabilities

### New Capabilities
- `table-column-customization`: 数据表格列级定制能力——声明式自定义列、列样式、单元格点击事件、动态列内容；含 schema 字段扩展、公共列渲染模块、列级事件分发、设计器配置入口。

### Modified Capabilities
- `page-data-table`: 运行时改用公共列渲染模块，支持新列配置字段（template/expression/className/styleExpr）与列级 onCellClick 分发。
- `query-page-renderer`: 运行时改用公共列渲染模块，支持新列配置字段与列级 onCellClick 分发。

## Impact

- 前端文件：
  - `frontend/src/utils/scriptSandbox.ts`（新增 `evalCellExpression`）
  - `frontend/src/utils/tableColumnRenderer.ts`（新增公共模块）
  - `frontend/src/components/business/types.ts`（`TableColumn.cellClassName` 可选）
  - `frontend/src/components/business/SearchTable.vue`（`class-name` 静态透传）
  - `frontend/src/views/page/ViewDesigner.vue`（`ColumnViewConfig` 扩展）
  - `frontend/src/views/page/components/PageDataTable.vue`、`PageRenderer.vue`（公共模块接入 + 列级事件）
  - `frontend/src/views/page/components/QueryColumnsConfig.vue`、`ColumnsConfig.vue`（面板）
- 依赖：复用现有 `scriptSandbox`、`viewEvents`、`SearchTable`；无后端/存储变更
- 测试：公共模块单测 + `evalCellExpression` 单测 + 列级事件分发测试
