# datasource-field-sorting Specification

## Purpose
数据源字段排序能力端到端：排序能力由数据源 metadata 按列类型声明，视图层零配置，前端列表页统一服务器端排序接线。

## Requirements

### Requirement: 数据源 metadata 声明字段排序能力

数据源 metadata 的每列 SHALL 声明 `sortable` 能力（Boolean），作为该字段能否参与排序的权威依据。推导规则：列类型为 JSON/TEXT、组件为 colorPicker、或含子表（subColumns）的字段 MUST 标记为不可排序（`sortable=false`）；数值（INTEGER/BIGINT/TINYINT/DECIMAL）、日期（DATE/DATETIME）、短文本/VARCHAR 字段 MUST 标记为可排序（`sortable=true`）。FORM 数据源按绑定表单 column_config 推导，WORKFLOW 数据源按最新 PUBLISHED schema 提取列推导（系统列中 `startTime` 可排、映射底层 `h.START_TIME_`，`instanceId`/`processStatus`/`initiatorName`/`currentNodeName` 等派生列不可排），SYSTEM/API 数据源所有列 MUST 返回 `sortable=false`。客户端接口 `GET /api/v1/data-sources/{id}/metadata` 响应列 SHALL 包含 `sortable` 字段。

#### Scenario: FORM 数据源可排字段声明
- **WHEN** 客户端请求已启用 FORM 数据源的 metadata
- **THEN** 数值/日期/短文本列的 `sortable` 为 true
- **AND** JSON/TEXT/colorPicker/子表字段列的 `sortable` 为 false

#### Scenario: WORKFLOW 数据源可排字段声明
- **WHEN** 客户端请求已启用 WORKFLOW 数据源的 metadata
- **THEN** 表单数值/日期列的 `sortable` 为 true
- **AND** `startTime` 系统列的 `sortable` 为 true，`initiatorName`/`currentNodeName`/`processStatus` 为 false

#### Scenario: SYSTEM/API 数据源不可排序
- **WHEN** 客户端请求 SYSTEM 或 API 数据源的 metadata
- **THEN** 所有列的 `sortable` 均为 false

### Requirement: 后端查询排序白名单校验

后端数据查询接口（`GET /api/v1/biz-data/{formKey}` 与 `GET /api/v1/pages/{pageKey}/data`）收到 `sort`/`order` 参数时 SHALL 校验排序字段命中数据源声明的可排字段集合：FORM 路径按绑定表单 column_keys 白名单校验（非法返回 400）；WORKFLOW 路径排序字段 MUST 命中最新 schema 业务列或可排系统列映射表（非法返回 400），order 值仅接受 `asc`/`desc`（非法回退默认）。缺省无 sort 参数时保持默认排序（FORM 为 `created_at DESC`，WORKFLOW 为 `COALESCE(h.START_TIME_, f.created_at) DESC`）。WORKFLOW 业务列排序 MUST 对数值列使用 `CAST(... AS SIGNED/DECIMAL)` 后再排序，避免 JSON 字符串字典序错误（如 10 < 2）。

#### Scenario: 排序字段不在白名单被拒
- **WHEN** 客户端对 WORKFLOW 数据源以非表单字段（如 `xxx`）作为 sort 参数发起查询
- **THEN** 返回 400 错误，提示排序字段不在表单字段中

#### Scenario: 数值列排序正确
- **WHEN** 客户端对 WORKFLOW 数据源的数值业务列以 desc 排序发起查询
- **THEN** 返回结果按数值大小降序（数值 CAST 后排序），而非 JSON 字符串字典序

#### Scenario: 缺省排序保持
- **WHEN** 客户端不携带 sort 参数发起查询
- **THEN** 结果按数据源默认排序返回

### Requirement: 前端列表页服务器端排序接线

前端数据表格（SearchTable）SHALL 在列头点击排序时记录排序状态（prop/order），将 `sort`/`order` 参数合并进查询请求重新拉取数据（服务器端排序），并照常向上转发 `sort-change` 事件（不破坏事件总线动作）。翻页与修改搜索条件 SHALL 保留当前排序状态；点击"重置"SHALL 清空排序状态恢复默认排序。视图渲染层（PageRenderer/PageDataTable）SHALL 依据数据源 metadata 的列 `sortable` 能力渲染排序入口：仅当列显示且数据源声明可排时启用排序；业务表单列表页（BizDataListPage）SHALL 按 column_config 列类型推导列排序能力。各列表页 fetchApi SHALL 将排序状态透传到后端接口。

#### Scenario: 点击表头排序生效
- **WHEN** 用户在列表页点击数据源声明可排的列头（升序）
- **THEN** 表格携带 `sort=<字段>&order=asc` 重新请求数据
- **AND** 返回数据按该字段升序排列

#### Scenario: 翻页保留排序
- **WHEN** 用户已对某列排序后翻页
- **THEN** 排序状态保留，后续页仍按相同字段/方向排序

#### Scenario: 重置清空排序
- **WHEN** 用户点击"重置"清空搜索条件
- **THEN** 排序状态一并清空，数据恢复默认排序

#### Scenario: 不可排字段不出现排序入口
- **WHEN** 数据源某列声明 `sortable=false`
- **THEN** 该列表头不出现排序箭头，点击无排序效果

### Requirement: 视图设计器移除排序开关

视图设计器（ViewDesigner）的列配置 SHALL NOT 提供字段排序开关；历史 schema 中残留的 `sortable` 配置 SHALL 被忽略（读取时不迁移、不报错）。列显隐配置 SHALL 保留，排序能力完全跟随数据源声明。

#### Scenario: 列配置无排序项
- **WHEN** 用户在视图设计器配置展示列
- **THEN** 列配置界面不显示"排序"开关

#### Scenario: 旧 schema 残留 sortable 被忽略
- **WHEN** 加载含历史 `sortable` 字段的视图 schema
- **THEN** 渲染不报错，排序入口由数据源能力决定
