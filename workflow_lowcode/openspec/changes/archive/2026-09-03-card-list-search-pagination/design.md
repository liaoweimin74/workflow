## Context

PageDataTable 已通过 SearchTable 提供查询栏和分页：查询字段由页面配置适配为 SearchField，非空值在 fetchApi 中组装为 `like` 条件，分页参数按 page/size 传递。PageDataCards 当前只渲染 ListCards，并仅传入 defaultPageSize 与 showPagination；ListCards 没有查询字段属性和查询栏，所以卡片页面配置无法体现完整能力。

## Goals / Non-Goals

**Goals:**

- 让运行态卡片列表显示配置中的查询栏。
- 让查询、重置、页码和每页条数变化触发数据源重新查询。
- 让卡片数据请求参数与 PageDataTable 的查询条件格式一致。
- 保持设计态预览隐藏查询栏和分页栏。

**Non-Goals:**

- 不改变卡片布局、分组、操作按钮和数据映射。
- 不新增查询匹配类型；卡片查询字段统一使用文本输入和 `like`。
- 不修改后端查询协议。

## Decisions

1. **查询逻辑放在 ListCards。** ListCards 是卡片列表的实际展示和分页状态持有者，因此由它负责查询表单、查询状态和分页交互；PageDataCards 只做页面配置适配。
2. **配置透传。** PageDataCards 增加/接收 `searchFields`、`showSearch`、`pageSizes`，并将其传给 ListCards。设计态通过 `designMode` 覆盖为隐藏。
3. **参数格式对齐 PageDataTable。** ListCards 调用 `fetchApi` 时传 `{ page, size, ...fieldValues }`；PageDataCards 从字段值生成 `filter` JSON，结构为 `{ logic: 'AND', conditions: [{ column, op: 'like', value }] }`，忽略空值。
4. **分页行为对齐 SearchTable。** 查询和重置将 page 设为 1；切换 page size 将 page 设为 1；pagination=false 时不显示分页并请求全量数据，设计态仍限制首页最多 10 条。

## Risks / Trade-offs

- [风险] ListCards 是通用组件，新增属性可能增加 API 面积 → 使用与 SearchTable 相同的命名和默认值，保持可选属性，不影响现有调用方。
- [风险] 卡片查询暂不支持 range/eq → 明确沿用当前卡片配置契约，仅按 like 实现，后续若需要复杂匹配可单独扩展配置模型。
- [风险] 查询字段未配置时渲染空查询栏 → 使用 showSearch 且存在有效 searchFields 的联合条件，避免只显示无输入控件的栏。

## Migration Plan

无需数据迁移或后端迁移。先为 ListCards 增加失败测试，再实现查询/分页；随后让 PageDataCards 透传配置并补适配测试。回滚时移除新增属性和查询栏逻辑即可，不影响已有接口数据。

## Open Questions

无。
