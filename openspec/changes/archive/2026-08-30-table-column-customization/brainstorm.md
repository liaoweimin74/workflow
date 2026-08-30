# 变更：数据表格列定制能力（brainstorm）

## Design Summary

为数据表格增加 4 项列级定制能力：**自定义列、列样式、单元格点击事件、动态列内容**。

本项目已有良好的基础设施可复用：
- 底层业务表格 `SearchTable`（`TableColumn`）已支持 `render` 函数（`RenderCell` 承接任意 VNode）与 `formatter`
- `scriptSandbox`（`executeScript`）提供沙箱化脚本/表达式求值能力（`$row.xxx` 表达式、动作链）
- `viewEvents` 声明式事件链（cell-click/sort-change 等已接线）
- 列配置面板 `QueryColumnsConfig` / `ColumnsConfig`

本变更把这些能力在**低代码 schema（JSON）层面对齐**，使设计者无需写 JS 函数即可定制列。

### 驱动方式

- **纯声明式 JSON** 扩展 `ColumnViewConfig`
- **事件走 script 动作**（复用现有 `viewEvents` / `scriptSandbox`）
- **动态内容用「模板 + 表达式」**：模板 `${field}` 插值 + JS 表达式（经沙箱求值，`$row.xxx`）
- 渲染优先级：`expression` > `template` > `formatter` > 原始值（null → '—'）

### 列配置 schema 扩展（`ViewDesigner.vue` 的 `ColumnViewConfig`）

```ts
interface ColumnViewConfig {
  key: string
  label: string
  width?: number
  align?: string
  formatter?: string   // 已有
  fixed?: string       // 已有
  // ---- 新增 ----
  template?: string    // 模板插值，如 `${name}(${status})`
  expression?: string  // 动态表达式（沙箱求值，$row.xxx），支持自定义列/动态内容
  className?: string   // 静态列样式 class（预留直通 el-table td）
  styleExpr?: string   // 条件样式表达式（$row.xxx，返回 class/样式）
  onCellClick?: { actions: any[] }  // 列级单元格点击事件（复用事件链/script）
}
```

### 行数据统一（方向 B）

PageRenderer 与 PageDataTable 行数据结构不同（PageRenderer 保持 `BizDataVO { id, data, version }` 内层；PageDataTable 在 fetchApi 中展开为扁平 `{...字段, id, version}`）。统一落在**公共取值函数** `getCellValue(row, key)`：优先 `row.data?.[key]`、回退 `row[key]`，两种结构均正确。不强行拉平数据结构（会破坏 PageDataTable 下游的脚本/导出/表单扁平依赖）。

### 列样式实现（方案甲 + 预留静态 cellClassName）

- **主方案：render 内承载** —— 公共渲染模块在 `render` 里将内容包一层带 `class`/`style` 的 `span`，`className`/`styleExpr` 体现在 span 上；不动底层 `SearchTable`/`types.ts` 结构，零侵入、逻辑内聚、天然支持按行动态样式。
- **预留**：给 `TableColumn` 增加可选 `cellClassName` 直接透传到 el-table 的 `class-name`（作用于 td），满足少数需要"整格背景"的场景；但仅做**静态透传**，不承载动态逻辑（动态样式仍走 render）。

### 列级单元格点击事件

- 列配置 `onCellClick` 存在时，**该列点击只执行列级动作（短路整表级 cell-click 事件链）**
- 未配置列级事件的列，走原整表级 `cell-click` → `viewEvents` 事件链，互不干扰
- 事件分发按 `column.property`（el-table 列 property）匹配列的 `key`

### 设计器面板

- `QueryColumnsConfig`/`ColumnsConfig` 每行加"高级配置"按钮 → 弹出子面板，编辑模板/表达式/样式/点击事件
- 避免把长文本塞进行内列，保持面板整洁

## Alternatives Considered

### 方案 A：强行统一行数据结构
- **做法**：让 PageDataTable 改为不展开、两处都保持 `BizDataVO`；或反之统一为扁平。
- **優點**：数据结构完全一致。
- **缺點**：PageDataTable 的脚本 `$row`、导出 JSON、表单 initialValues、搜索条件等多处下游依赖扁平字段；PageRenderer 的模板 `resolveTemplate` 又依赖内层 `row.data`。强行拉平需大范围改动，回归风险高。
- **為何未採用**：破坏其一侧的有意设计，收益低、风险高。

### 方案 B：统一取值函数（Agreed）
- **做法**：保留两种数据结构，抽取公共 `getCellValue(row, key)`（优先 `row.data?.[key]`、回退 `row[key]`），列渲染模块内部复用它。
- **優點**：取值逻辑唯一，任意结构都正确；改动集中在渲染/取值点（`render`、模板、表达式、样式），是真正会重复、值得提炼的部分；风险最小。
- **缺點**：数据结构层面仍不一致（但已被取值函数屏蔽，对渲染透明）。
- **為何勝出**：把"统一"落在最该统一的地方（公共逻辑）而非强行拉平数据，契合"提炼公共代码"目标。

### 列样式：render 内承载 vs 改 SearchTable 透传
- **做法（render 承载）**：`run render` 包 span 承载 class/style，零侵入、内聚、动态样式天然，但不作用于 td 本体。
- **做法（改 SearchTable 透传）**：`TableColumn` 加 `cellClassName` 透传到 el-table `class-name`，作用于整 td、声明式清晰，但要改底层基座（28 处调用）且动态需绑函数、逻辑被拆散。
- **為何勝出 / 折衷**：主用 render 承载（内聚、动态、零侵入）；并预留一个**静态** `cellClassName` 直通以覆盖"整 td 样式"诉求，兼顾两者优点、控制基座改动为可选字段。

### 驱动方式：纯声明式 vs 声明式+脚本混合
- **做法（纯声明式 JSON，Agreed）**：模板/表达式/样式/事件全部 JSON 可序列化、可在线保存，与现有 schema 一致，复用现有 scriptSandbox。
- **做法（混合）**：常用功能声明式，复杂回退 script 动作，更灵活但 schema 更复杂。
- **為何勝出**：本需求目标就是"低代码可配置"，纯声明式最贴合；复杂逻辑已可通过 `onCellClick` 的 script 动作承载，无需额外混合机制。

## Agreed Approach

采用**方案 B（统一取值函数）+ 纯声明式 JSON 扩展 + 列样式 render 内承载（预留静态 cellClassName）+ 列级 onCellClick（短路整表级）**。

核心交付：
1. `scriptSandbox.ts` 新增 `evalCellExpression`（沙箱单表达式求值、带返回值）
2. 新建公共模块 `frontend/src/utils/tableColumnRenderer.ts`（`getCellValue`、`interpolateTemplate`、`buildCellRender`、样式处理）
3. `ViewDesigner.vue` 扩展 `ColumnViewConfig`
4. `PageDataTable.vue` + `PageRenderer.vue` 改用公共模块，并支持列级 `onCellClick` 分发
5. `QueryColumnsConfig`/`ColumnsConfig` 增加"高级配置"子面板
6. 单元测试：公共模块（getCellValue/template/expression/样式）+ `evalCellExpression` + PageDataTable 列级事件

## Key Decisions

- 事件支持 script 动作：复用现有 `viewEvents`/`scriptSandbox`，列级 `onCellClick` 存在时短路整表级
- 动态内容用「模板 + 表达式」：`expression` > `template` > `formatter` > 原始值
- 行数据统一为方向 B（公共 `getCellValue`，不拉平数据结构）
- 列样式方案甲（render 内承载）+ 预留静态 `cellClassName`
- 表达式用 `$row.xxx` 前缀，上下文注入 `value`（当前单元格值）供 `value > 100` 之类写法
- `expression` 结果仅作文本/字符串渲染，不引入渲染器对象协议（保留扩展空间）
- 设计器面板用"高级配置"子面板承载长文本配置

## Open Questions

- 无阻塞项。后续可选扩展：`expression` 返回对象协议（如 `{ type: 'tag', text, color }`）以支持 tag/链接等富渲染。
