# 变更：数据表格列定制能力（design）

## Context

本项目是低代码表单/页面引擎。数据表格（`SearchTable`）已具备：
- 底层 `TableColumn`（`frontend/src/components/business/types.ts`）支持 `render` 函数、`formatter` 函数、对齐/固定/排序
- `SearchTable.vue` 的 `RenderCell` 承接 `render` 返回的 VNode/字符串
- `scriptSandbox.ts` 的 `executeScript` 提供沙箱脚本执行（`$row.xxx` 表达式、动作链）
- 声明式事件链 `viewEvents`（cell-click/sort-change/selection-change 已接线）
- 设计器列配置面板 `QueryColumnsConfig` / `ColumnsConfig`

**缺口**：列定制能力在**低代码 schema（JSON）层面缺失**。当前 `ColumnViewConfig` 仅有 `key/label/width/align/fixed/formatter`，无法表达：任意动态内容、自定义列、列样式、单元格级点击事件。`TableColumn.render` 是 JS 函数，无法直接存入可在线编辑的 schema。

**约束**：
- schema 必须可序列化（JSON），不能存函数
- 事件需复用现有 `scriptSandbox`（安全沙箱）与事件链
- 渲染链路有两条独立实现（`PageRenderer` 页面/表单场景、`PageDataTable` 页面数据表格场景），须提炼公共逻辑
- 用户要求"尽可能提炼公共代码"

## Goals / Non-Goals

**Goals:**
- 为列增加 4 项声明式能力：自定义列、列样式、单元格点击事件、动态列内容
- 纯前端实现，schema 向后兼容（新增字段可选）
- 复用现有 `scriptSandbox` / `viewEvents`，不新增运行时
- 两条渲染链路（PageDataTable / PageRenderer）共用一套列渲染公共模块，行为一致
- 设计器面板支持配置这些新能力

**Non-Goals:**
- 不引入服务端存储变更（schema 由现有后端 page 存取机制承载）
- 不做富渲染器对象协议（如 `{type:'tag'}` 返回对象渲染），本期仅文本/字符串渲染
- 不重构既有行数据结构（PageDataTable 扁平 / PageRenderer BizDataVO 保持）
- 不改动 `SearchTable` 的列渲染主体（仅预留一个可选静态 `cellClassName` 直通）

## Decisions

### D1：公共列渲染模块 `tableColumnRenderer.ts`
新建 `frontend/src/utils/tableColumnRenderer.ts`，收敛所有列渲染逻辑：
- `getCellValue(row, key)`：统一取值，优先 `row.data?.[key]`、回退 `row[key]`（方向 B，屏蔽 PageRenderer/PageDataTable 数据结构差异）
- `interpolateTemplate(tpl, row)`：`${field}` 插值，支持多级字段（`${a.b}`）
- `renderCellContent(config, row)`：按 `expression` > `template` > `formatter` > 原始值 顺序产出内容
- `buildCellRender(config)`：生成可注入 `TableColumn.render` 的函数，内部承载内容 + `className`/`styleExpr` 样式（包 span）
- 样式：`className` 静态 class；`styleExpr` 经 `evalCellExpression` 按行求值

**Rationale**：两条链路当前各自实现列取值/格式化/渲染（PageDataTable `resolvedColumns`、PageRenderer `searchTableColumns`），逻辑重复。收敛为一个纯函数模块，两处调用，保证行为一致且便于测试。

### D2：`evalCellExpression`（scriptSandbox 扩展）
`scriptSandbox.ts` 新增 `evalCellExpression(source, context)`：在既有沙箱 `createSandbox` 基础上，以 `return (expr)` 求值单表达式并返回结果（异常捕获返回 `undefined`）。注入上下文 `{ $row, row, value, column, params }`。

**Rationale**：现有 `executeScript` 执行语句不返回值；列表达式需要"求值取结果"。复用同一沙箱 Proxy 保证安全一致。`$row.xxx` 前缀与既有 `evalVisible`/`isButtonVisibleForRow` 惯例一致。

### D3：`ColumnViewConfig` 扩展（ViewDesigner）
新增字段：`template?`、`expression?`、`className?`、`styleExpr?`、`onCellClick?`（`{ actions: any[] }`）。`key` 不必是真实数据字段 → 天然支持自定义/计算列。

### D4：列样式方案甲 + 预留静态 cellClassName
- 主：`className`/`styleExpr` 在 `render` 内承载（包 `span` 的 class/style），零侵入、内聚、按行动态
- 预留：`types.ts` 的 `TableColumn` 增加可选 `cellClassName?`，`SearchTable` 透传到 `el-table-column` 的 `class-name`（仅静态，作用于 td），覆盖"整格背景"诉求

### D5：列级 onCellClick 事件
- 分发位于 PageDataTable/PageRenderer 层，按 `column.property` 匹配列 `key`
- 命中列且该列配置了 `onCellClick` → 执行列级动作链（`dispatchButtonAction`，含 `type=script`），**短路**整表级 cell-click 事件
- 未命中 → 走原整表级 `cell-click` → `viewEvents` 事件链
- 列级动作复用一个轻量分发函数，与整表级共用 `dispatchButtonAction`/UE 事件执行器

### D6：设计器面板
`QueryColumnsConfig`/`ColumnsConfig` 每行加"高级配置"按钮 → 弹子面板编辑 template/expression/className/styleExpr/onCellClick。避免长文本塞进行内列。

## Risks / Trade-offs

- **[R1] 表达式求值的函数调用风险**：`evalCellExpression` 在沙箱中运行，白名单受限（`createSandbox` 的 Proxy 拦截非白名单标识符）；但 `Function` 构造本身允许算式。→ 缓解：沙箱 Proxy `has()=true` 拦截逃逸，白名单不含 `window/document` 等；与既有 `executeScript` 同一安全模型。
- **[R2] 两条链路行为漂移**：PageRenderer/PageDataTable 若未完全切换到公共模块，会出现差异化。→ 缓解：`renderCellContent`/`getCellValue` 为唯一取值逻辑，两端强制复用；用单元测试锁定行为。
- **[R3] `styleExpr`/`expression` 求值失败静默降级**：表达式写错时返回 undefined/默认显示。→ 缓解：沙箱 console.error 记录；渲染回退到 `formatter`/原始值，不阻断表格。
- **[R4] 短路整表级 cell-click 可能造成用户困惑**：列级事件存在时整表级不触发。→ 缓解：语义明确（列级优先），文档/面板提示；可与列级 action 为空时回退整表级。
- **[R5] SearchTable 基座改动**：加 `cellClassName` 可选字段影响 28 处调用。→ 缓解：仅加可选 prop（`undefined` 时透传空），零破坏；不透传动态逻辑。

## Migration Plan

- 全部为**前端新增/可选字段**，schema 向后兼容，无数据迁移
- 部署顺序：先合并公共模块与两链路接入（独立可测），再上面板
- 回滚：回退 commit 即可，无 schema 破坏性变更
- 涉及文件：
  - `frontend/src/utils/scriptSandbox.ts`（新增 `evalCellExpression`）
  - `frontend/src/utils/tableColumnRenderer.ts`（新增公共模块）
  - `frontend/src/components/business/types.ts`（`TableColumn.cellClassName` 可选）
  - `frontend/src/components/business/SearchTable.vue`（`class-name` 透传）
  - `frontend/src/views/page/ViewDesigner.vue`（`ColumnViewConfig` 扩展）
  - `frontend/src/views/page/components/PageDataTable.vue`（公共模块接入 + 列级事件）
  - `frontend/src/views/page/PageRenderer.vue`（公共模块接入 + 列级事件）
  - `frontend/src/views/page/components/QueryColumnsConfig.vue` / `ColumnsConfig.vue`（面板）
  - 对应单元测试

## Open Questions

- 无阻塞项。
- 可选后续：`expression` 返回对象渲染协议（tag/链接），本期不做。
