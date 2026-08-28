## Context

业务列表的字段排序功能当前**三层断裂**，无法端到端生效：

- **视图设计器**（ViewDesigner）：`ColumnViewConfig.sortable` 开关已存在（ColumnsConfig 的"排序"列），但从未真正接线。
- **前端渲染**：三个列表页全部未接线——`PageRenderer`（VIEW 视图，用 `page.dataSourceId` 单一绑定 + SearchTable）、`PageDataTable`（PAGE 自定义页面数据表格组件，用 `schema.dataSources` 绑定数组）、`BizDataListPage`（业务表单数据管理页，走 `biz-data/{formKey}` 旧接口）。`SearchTable.vue:111` 已把 `sortable` 列渲染为 `'custom'` 模式（服务器端排序，el-table 不做本地排序），但 `sort-change` 事件仅转发（SearchTable:101）或仅触发事件总线（PageRenderer:791、PageDataTable:531），**均不重新拉数据、不携带 sort/order 参数**；三个 fetchApi 也只传 `{ page, size, filter }`。
- **后端查询**：`BizDataQueryRequest` 已含 `sort/order` 字段。FORM 路径（`BizDataService.query` → `BizDataQueryBuilder.buildSelect:51-57`）**已支持**白名单排序（`validateColumn`，默认 `created_at DESC`）；但 WORKFLOW 路径（`WorkflowFormDataQueryService.query:137-138`）**硬编码** `ORDER BY COALESCE(h.START_TIME_, f.created_at) DESC`，完全忽略请求的 sort/order。统一数据源适配器 `UnifiedDataSourceAdapter.query` 按类型分发：FORM→bizDataService（支持），WORKFLOW→workflowQueryService（不支持）。

**架构约束**：数据源能力（哪些字段可筛）已有成熟先例——前端 `filterableColumns` 按列类型推导（非 JSON/TEXT、非 colorPicker、indexed 或短文本），后端 filter 白名单（`PageQueryController.whitelistFilter` / `WorkflowFormDataQueryService.requireWhitelisted`）。排序能力应对齐该模式，由**数据源 metadata 声明**，而不是视图/界面层自由配置。

## Goals / Non-Goals

**Goals:**
- 排序能力由数据源 metadata 声明（后端按列类型推导每字段 `sortable`），成为查询白名单的权威来源。
- VIEW 视图、PAGE 自定义页面数据表格、业务表单列表页三者均获得可用的服务器端排序（点表头 → 带 sort/order 重新请求 → 后端 ORDER BY）。
- 视图层零配置：移除列配置 `sortable` 开关，保留列显隐；列显示 + 数据源可排 → 排序入口自动出现。
- WORKFLOW 数据源补齐动态排序（业务列 JSON 提取 + 数值 CAST，系统列映射）。
- 搜索/翻页保留排序状态，点"重置"恢复默认排序。

**Non-Goals:**
- SYSTEM（user-tree/dept-tree）与 API 数据源排序（本轮 metadata 返回不可排）。
- VIEW 视图绑定级差异化排序配置（方案 A 决定完全跟随数据源）。
- 前端本地排序（始终服务器端排序，`sortable: 'custom'`）。
- 默认排序的持久化（按用户偏好记忆排序等）。

## Decisions

### D1：排序能力推导规则（后端统一工具 `SortableResolver`）

- `ColumnConfig` 增加 `sortable` 字段（`Boolean`，缺省 null = 未推导）。
- 推导规则（与现有 filterable 规则同源）：**JSON / TEXT / colorPicker / 含 subColumns（子表）→ 不可排；数值（INTEGER/BIGINT/TINYINT/DECIMAL）、日期（DATETIME/DATE）、短文本 / VARCHAR → 可排**。
- 新增 `SortableResolver.resolve(List<ColumnConfig>)`：遍历列，填充 sortable。
- **为何不直接复用 filterable 逻辑**：可筛与可排的约束不同（可筛要求 indexed 或短文本以支持 LIKE；可排对任意短列都有意义，数值/日期列排序价值更高），独立推导避免耦合。

### D2：metadata 构造时填充 sortable（UnifiedDataSourceAdapter.metadata）

- FORM：`formDefService.getBusinessColumnsByKey(formKey)` → SortableResolver 推导。
- WORKFLOW：`workflowQueryService.columnsFor(formKey)` → SortableResolver 推导（系统列显式标注：`startTime` 可排、映射 `h.START_TIME_`；`initiatorName`/`currentNodeName`/`processStatus`/`instanceId` 等派生列不可排）。
- SYSTEM / API：返回 `sortable=false`（本轮不做）。
- 前端 `ColumnConfigItem`（`@/api/bizData`）增加 `sortable?: boolean`。

### D3：WORKFLOW 数据源动态排序（WorkflowFormDataQueryService.query）

- 解析 `req.getSort()/getOrder()`：缺省保持现有 `COALESCE(h.START_TIME_, f.created_at) DESC`。
- 白名单：sort 字段 ∈ businessColumns key ∪ 可排系统列映射表；非法 → 400（对齐 `requireWhitelisted`）。
- ORDER BY 拼接：
  - 业务列：`JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$.<key>'))`，**数值列 `CAST(... AS SIGNED/DECIMAL)`**（否则 JSON 字符串排序出现 10 < 2）。
  - 系统列 `startTime`：直接 `h.START_TIME_`。
- order 方向：`asc/desc` 白名单化，非法回退默认。
- **风险**：JSON_EXTRACT 排序无法走索引 → 大数据量下排序慢（见 R2）。

### D4：FORM 路径白名单对齐

- `BizDataQueryBuilder.buildSelect` 已有 `validateColumn` 白名单（基于 columnKeys），行为与 D1 推导一致即可，无需改查询实现；仅确保 metadata 推导与查询白名单来源同一（column_config）。

### D5：SearchTable 内部落地排序（前端通用组件）

- `SearchTable.vue` 新增内部状态 `sortState: { prop, order }`：
  - `@sort-change`：写入 `sortState`（同时**照常 emit 给父组件**，不破坏事件总线动作），然后 `fetchList()`。
  - `fetchList()`：`props.fetchApi({ ...query, ...sortState })`（order 归一为 `ascending/descending` → 后端 `asc/desc`）。
  - `handleReset()`：清空 `sortState`（恢复默认排序）。
- **为何内部处理而非各父组件接线**：三个列表页统一获得排序能力，父组件仅需在 fetchApi 透传参数；一致性最好，符合方案 A"视图零配置"。

### D6：各列表页透传与列能力合并

- `PageRenderer.vue`（VIEW）：`searchTableColumns` 渲染时，把 schema 列与 `dataSourceMeta.columns` 的 `sortable` 合并（schema 列 key 命中 metadata 可排列 → `sortable: true`）；`searchTableFetchApi` 把 `sort/order` 透传到 `pageApi`/`dataSourceApi`。
- `PageDataTable.vue`（PAGE）：列 sortable 直接取 `metaColumns` 的 `sortable`；`fetchApi` 透传 `sort/order`。
- `BizDataListPage.vue`：列 sortable 按 column_config 类型前端推导（复用 filterable 同源规则，抽出共享工具）；`fetchApi` 透传 `sort/order`。

### D7：ViewDesigner 移除排序开关

- `ColumnsConfig.vue` / `QueryColumnsConfig.vue` 移除"排序"列与 `sortableOf/setProp('sortable')`；`ColumnViewConfig.sortable` 字段废弃（历史 schema 中残留值被忽略，向后兼容）。

## Risks / Trade-offs

- **R1：JSON 列排序类型错误（10 < 2）** → 数值列显式 `CAST AS SIGNED/DECIMAL`；排序前仍按列类型推导可排性，JSON/TEXT 直接不可排。
- **R2：JSON_EXTRACT 排序无索引，大数据量性能退化** → 本轮接受（与现有 filter/keyword 同样基于 JSON_EXTRACT 的定位一致）；后续可引入冗余排序列或索引列。
- **R3：同一数据源绑定多个视图时排序能力全局一致** → 方案 A 的既定取舍（用户已确认按视图差异化非硬需求）。
- **R4：SearchTable 引入内部状态，父组件无法单独控制排序** → 当前无此场景；`sort-change` 事件仍转发，`sort(field, order)` expose 方法保留，后续可按需扩展。
- **R5：旧 schema 残留 `sortable` 字段** → ViewDesigner 读取时忽略，不迁移、不报错，向后兼容。

## Migration Plan

1. 后端：新增 `ColumnConfig.sortable` + `SortableResolver`，改 `UnifiedDataSourceAdapter.metadata` 与 `WorkflowFormDataQueryService.query`（含单测）。无数据迁移（sortable 为推导值，不落库）。
2. 前端：`ColumnConfigItem` 类型扩展 → SearchTable 内部排序 → 三个列表页透传与列合并 → ViewDesigner 移除开关。
3. 验证：`WorkflowFormDataQueryServiceTest` 新增排序用例（白名单拒绝 / 数值 CAST / 系统列映射 / 默认排序）；前端 SearchTable 排序状态单测 + PageRenderer 列合并单测。
4. 回滚：变更整体回退即可；无 schema/数据结构破坏（sortable 推导值、废弃字段被忽略）。

## Open Questions

- 无。SYSTEM/API 排序、VIEW 绑定级差异化、默认排序持久化均已明确 Non-Goals。
