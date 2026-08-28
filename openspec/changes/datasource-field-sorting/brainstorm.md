## Design Summary

业务列表的字段排序目前整条链路断裂：视图设计器（ViewDesigner）的列配置已有 `sortable` 开关，但前端三个列表页（PageRenderer VIEW / PageDataTable PAGE / BizDataListPage）均未接线，后端 WORKFLOW 数据源查询也未实现排序。本变更将**排序能力声明下沉到数据源 metadata 层**，视图层零配置，前端 SearchTable 组件统一落地排序交互状态，后端补齐 WORKFLOW 数据源动态排序。

**核心原则**：排序能力（哪些字段能排）= 数据源属性；排序执行（ORDER BY）= 数据源/后端；排序交互状态（用户点了哪列）= 前端组件内部。三层各归其位。

## Alternatives Considered

### 方案 A：数据源 metadata 声明排序能力（Agreed）
- **做法**：后端在 `DataSourceMetadata` 构造时按列类型推导每字段 `sortable` 能力（JSON/TEXT/colorPicker/子表 → 不可排；数值/日期/短文本 → 可排）；视图层移除列配置中的 `sortable` 开关，保留列显隐；某列显示 + 数据源可排 → 排序入口自动出现；前端 SearchTable 内部维护排序交互状态并携带 `sort/order` 重新拉取。
- **優點**：能力声明单一权威（数据源），后端白名单兜底防绕过；视图层零配置、无需发布校验变更；一个数据源改动全局生效；与现有 filterable 白名单模式同源。
- **缺點**：同一数据源绑定多个视图时排序能力全局一致，无法按视图差异化；需要前端组件内部引入排序状态。
- **為何未採用**：这是最终采纳的方案。

### 方案 B：视图列配置保留 sortable 开关（现状增强）
- **做法**：保留 ViewDesigner 的 `sortable` 开关，补上前端接线和后端 WORKFLOW 排序实现，让开关真正生效。
- **優點**：按视图差异化自由；UI 改动最小（开关已存在）。
- **缺點**：排序能力（能否排）由视图层决定，但视图层无法判断字段特性（JSON/TEXT 排了没意义、数值需 CAST）；职责错位导致"配了但排不了"的坏情况；白名单权威来源不清。
- **為何未採用**：用户明确要求"字段是否可以排序应在数据源上设置，而不是视图或界面层组件"。

### 方案 C：数据源绑定层声明 sortableFields（searchFields 模式扩展）
- **做法**：在页面数据源绑定条目（schema.dataSources[].sortableFields）上声明可排序字段，对齐现有 `searchFields` 白名单模式。
- **優點**：按视图/页面差异化（每个页面绑定独立数据源）；与 PAGE 页面已有绑定级 searchFields 配置一致。
- **缺點**：VIEW 视图（单一 dataSourceId 实体字段）无绑定条目，需要引入新配置 UI 与发布校验；改动面大；用户评估后认为按视图差异化不是硬需求。
- **為何未採用**：用户选择方案 A（完全跟随数据源 metadata 自动），VIEW 视图零配置；PAGE 页面也统一跟随 metadata。

## Agreed Approach

采纳**方案 A**：排序能力由数据源 metadata 声明，视图层零配置。分层落地：

1. **数据源 metadata**：`ColumnConfig` 增加 `sortable` 字段，新增统一推导工具按列类型计算能力（FORM 按 column_config，WORKFLOW 按 schema 提取列，SYSTEM/API 本轮返回不可排）。
2. **后端查询**：FORM 路径已有白名单排序（`BizDataQueryBuilder.validateColumn`），仅对齐推导规则；WORKFLOW 路径补齐动态 ORDER BY（业务列 JSON_EXTRACT + 数值 CAST，系统列 startTime 映射 h.START_TIME_，派生列不可排），缺省保持现有 `COALESCE(h.START_TIME_, f.created_at) DESC`。
3. **前端 SearchTable**：内部处理 `sort-change`（记录 `{prop, order}` 状态 → fetchList 合并进 params → 事件仍转发父组件不破坏事件总线）；重置时清空排序，翻页/搜索保留排序。
4. **各列表页 fetchApi**：PageRenderer（VIEW）/ PageDataTable（PAGE）/ BizDataListPage 透传 `sort/order`；渲染列时把 metadata/列配置的 sortable 能力合并进列定义。
5. **ViewDesigner**：移除 ColumnsConfig 的 `sortable` 开关。

## Key Decisions

- 排序能力声明位置 = 数据源 metadata（后端按列类型推导），不落在视图/界面层。
- 视图层保留列显隐职责，移除排序开关；列显示 + 数据源可排 → 排序入口自动出现。
- SearchTable 内部维护排序交互状态（与 query 并列），`sort-change` 事件仍转发父组件。
- WORKFLOW 数据源排序：业务列 `JSON_UNQUOTE(JSON_EXTRACT(...))` + 数值列 `CAST AS SIGNED/DECIMAL`（避免 10 < 2）；系统列 `startTime` → `h.START_TIME_`；`initiatorName`/`currentNodeName` 等派生列不可排。
- FORM 数据源查询已支持排序，仅需将白名单校验规则与 SortableResolver 对齐。
- SYSTEM（user-tree/dept-tree）与 API 数据源本轮不参与排序（metadata 返回不可排），后续按需扩展。
- 点"重置"清空排序恢复默认；翻页/修改搜索条件保留排序状态。
- 变更名称：`datasource-field-sorting`。

## Open Questions

- 无。SYSTEM/API 数据源排序、VIEW 绑定级差异化配置已明确本轮不做（YAGNI）。
