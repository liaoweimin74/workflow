## Why

业务列表的字段排序当前三层断裂：视图设计器已有 `sortable` 开关但前端三个列表页均未接线，后端 WORKFLOW 数据源查询忽略排序参数（仅 FORM 路径已支持）。排序能力本质是数据源属性（能否排由字段类型决定），却由视图/界面层自由配置，导致"配了但排不了"的职责错位。本次将排序能力声明下沉到数据源 metadata，前端统一接线，使业务表单列表视图与数据表格组件获得可用的服务器端排序。

## What Changes

**数据源 metadata 声明排序能力**
- From: 视图列配置自由开关 `sortable`，数据源 metadata 无排序能力信息
- To: 后端 metadata 按列类型推导每字段 `sortable`（JSON/TEXT/colorPicker/子表不可排，数值/日期/短文本可排），成为查询白名单权威来源；视图层移除开关，保留列显隐
- Reason: 排序能力由字段特性决定，数据源层声明可对齐现有 filterable 白名单模式并防绕过
- Impact: non-breaking（metadata 新增字段；旧 schema 残留 sortable 被忽略）

**WORKFLOW 数据源排序扩展**
- From: 排序仅支持系统列（startTime/created_at），忽略请求 sort/order
- To: 支持业务列（JSON_EXTRACT + 数值 CAST）与系统列 startTime 的动态 ORDER BY，白名单校验，缺省保持现有默认排序
- Reason: 业务表单列表需要对业务字段排序，仅系统列不满足需求
- Impact: non-breaking（缺省行为不变，新增能力）

**前端列表页排序接线**
- From: `sort-change` 仅转发事件或触发事件总线，fetchApi 不携带 sort/order，排序无效果
- To: SearchTable 内部记录排序状态并携带参数重新拉取（事件仍转发）；PageRenderer/PageDataTable/BizDataListPage 透传 sort/order 并按数据源能力渲染排序入口
- Reason: 一个组件改动全局生效，符合方案 A"视图零配置"
- Impact: non-breaking（原有事件/行为保留）

## Capabilities

### New Capabilities
- `datasource-field-sorting`: 数据源字段排序能力端到端——metadata 声明 sortable、前端列表页服务器端排序接线、视图设计器移除排序开关

### Modified Capabilities
- `workflow-form-datasource`: WORKFLOW 数据源筛选与排序 requirement——排序从"第一版仅系统列"扩展为"业务列 + 系统列"，metadata 增加 sortable 声明
- `data-source-management`: 数据源 metadata 增加字段级 `sortable` 能力声明（FORM 按 column_config 推导）

## Impact

- **后端**: `ColumnConfig` 新增 `sortable`；新增 `SortableResolver` 推导工具；`UnifiedDataSourceAdapter.metadata` 填充 sortable；`WorkflowFormDataQueryService.query` 支持动态排序；`BizDataQueryBuilder` 白名单规则对齐
- **前端**: `ColumnConfigItem` 类型扩展；`SearchTable` 内部排序状态；`PageRenderer`/`PageDataTable`/`BizDataListPage` 透传与列能力合并；`ViewDesigner`/`ColumnsConfig`/`QueryColumnsConfig` 移除排序开关
- **API**: metadata 响应列增加 `sortable` 字段（非破坏性）；`biz-data`/`pages` 查询接口 `sort/order` 参数已有，无需新增
- **测试**: `WorkflowFormDataQueryServiceTest` 补排序用例（白名单拒绝/数值 CAST/系统列映射/默认排序）；前端 SearchTable 排序状态与 PageRenderer 列合并单测
