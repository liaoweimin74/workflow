## Design Summary

PageDataCards 当前仅将分页开关和默认页大小传给 ListCards，ListCards 虽然已有分页状态，却没有查询栏、查询字段属性或查询事件处理，因此页面配置中的查询栏不会显示，查询条件也不会传给数据源。本变更对齐 PageDataTable -> SearchTable 的现有行为，在卡片列表顶部增加基于 `searchFields` 的查询栏，在查询和重置时回到第一页，并将非空查询值以 `like` 条件透传给卡片数据源。分页继续由 `pagination` 控制，同时支持配置的 `pageSizes`。

实现边界保持最小：不新增查询匹配类型，不改变卡片展示、分组、操作按钮或设计态行为；设计态仍隐藏查询和分页，运行态按页面配置渲染。

## Alternatives Considered

### 方案 A：扩展 ListCards，复用 PageDataTable 的配置和数据流（采用）
- **做法**：为 ListCards 增加 `searchFields`、`showSearch`、`pageSizes` 属性，内部实现查询表单、查询/重置及分页交互；PageDataCards 负责透传配置并在 `fetchApi` 中组装 `like` 筛选条件。
- **优点**：与 PageDataTable/SearchTable 行为一致；组件边界清晰；保留 ListCards 作为通用卡片列表组件的可复用能力。
- **缺点**：需要改动 ListCards、PageDataCards 及对应测试。
- **为何采用**：问题根因位于 ListCards 缺少渲染和状态逻辑，直接补齐即可避免在页面层重复实现。

### 方案 B：在 PageDataCards 外层单独渲染查询栏
- **做法**：PageDataCards 自己渲染查询表单，把条件写入 fetchApi，ListCards 只保留分页。
- **优点**：ListCards 改动较少。
- **缺点**：查询栏与通用卡片列表耦合在页面适配层，其他 ListCards 使用者无法复用；容易与 SearchTable 的布局和交互产生分叉。
- **为何未采用**：不能真正补齐 ListCards 的组件能力，也不符合“对照数据表格具体实现”的复用方向。

### 方案 C：直接在 PageRendererPage 中包装所有卡片列表
- **做法**：由页面渲染器识别卡片配置，统一注入外层查询和分页控件。
- **优点**：页面配置处理集中。
- **缺点**：破坏组件封装，增加 PageRendererPage 对卡片内部状态的了解，并可能影响设计器、嵌入式渲染和其他调用方。
- **为何未采用**：改动范围大且职责不清，无法复用现有 ListCards 的独立 API。

## Agreed Approach

采用方案 A。ListCards 的查询栏结构和分页交互参照 SearchTable：查询栏仅在 `showSearch` 且存在 `searchFields` 时显示；输入字段使用文本输入框，查询时将当前条件合并到 `{ page, size, ...fields }` 后调用 `fetchApi`；查询、重置和 page size 变化均从第 1 页开始。PageDataCards 透传页面中的查询字段、查询开关和页大小选项，并在请求数据源时把非空字段转换为与 PageDataTable 一致的 `filter: JSON.stringify({ logic: 'AND', conditions })`。

## Key Decisions

- 查询字段沿用页面配置的 `searchFields`，字段键兼容 `key`/`field`，标签优先使用配置 label。
- 当前卡片查询统一按 `like`，不引入 `eq`、`range` 等新匹配语义。
- `showSearch` 由页面配置控制；设计态继续隐藏查询栏和分页栏。
- `pagination` 为 false 时请求全部数据（沿用现有卡片数据请求约定），但不显示分页栏。
- `pageSizes` 默认沿用数据表格的 `[10, 20, 50]`，页面配置可覆盖。
- 测试重点覆盖查询栏可见性、查询/重置请求参数、页码重置、每页条数变化和 PageDataCards 参数透传。

## Open Questions

无。查询字段统一使用文本输入并按 `like` 提交，已作为本变更验收标准。
