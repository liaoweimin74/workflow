# datasource-field-sorting Delta Specification

> 变更 `form-join-sql-engine`：排序白名单从主表 column_config 扩展包含 JOIN 虚拟列 / SQL 声明列

## MODIFIED Requirements

### Requirement: 后端查询排序白名单校验

后端数据查询接口（`GET /api/v1/biz-data/{formKey}` 与 `GET /api/v1/pages/{pageKey}/data`）收到 `sort`/`order` 参数时 SHALL 校验排序字段命中白名单：FORM 路径按绑定表单的 column_keys 白名单校验（非法返回 400），且当 FORM 数据源配置了 JOIN/SQL 查询时，白名单 SHALL 扩展包含 config 模式的 `virtualKey`（声明 `sortable=true`）与 sql 模式的 `columns`（声明 `sortable=true`）；WORKFLOW 路径排序字段 MUST 命中最新 schema 业务列或可排系统列映射表（非法返回 400）；视图（VIEW）页面路径 SHALL 额外校验 sort 字段是否在页面 schema 声明的 `sortableFields`（声明非空时，不在其中返回 400）。order 值仅接受 `asc`/`desc`（非法回退默认）。缺省无 sort 参数时保持默认排序（FORM 为 `created_at DESC`，WORKFLOW 为 `COALESCE(h.START_TIME_, f.created_at) DESC`）。WORKFLOW 业务列排序 MUST 对数值列使用 `CAST(... AS SIGNED/DECIMAL)` 后再排序，避免 JSON 字符串字典序错误（如 10 < 2）。
#### Scenario: 排序字段不在白名单被拒
- **WHEN** 客户端对 WORKFLOW 数据源以非表单字段（如 `xxx`）作为 sort 参数发起查询
- **THEN** 返回 400 错误，提示排序字段不在表单字段中

#### Scenario: 数值列排序正确
- **WHEN** 客户端对 WORKFLOW 数据源的数值业务列按 desc 排序发起查询
- **THEN** 返回结果按数值大小降序（数值 CAST 后排序），而非 JSON 字符串字典序

#### Scenario: 缺省排序保持
- **WHEN** 客户端不携带 sort 参数发起查询
- **THEN** 结果按数据源默认排序返回

#### Scenario: 视图 sort 字段不在声明的 sortableFields 被拒
- **WHEN** 客户端对 VIEW 页面以 schema 未声明的 sortableFields 字段作为 sort 参数发起查询
- **THEN** 返回 400 错误，提示排序字段不在页面声明的可排序字段中

#### Scenario: config 模式按虚拟列排序
- **WHEN** FORM 数据源 config 模式声明虚拟列 customer_name 且 sortable=true，客户端以 sort=customer_name 发起查询
- **THEN** 系统按 JOIN 输出的 customer_name 列排序
- **AND** 不在白名单（virtualKey 未声明可排）的虚拟列排序返回 400

#### Scenario: sql 模式按声明列排序
- **WHEN** FORM 数据源 sql 模式声明 columns 含 customer_name 且 sortable=true，客户端以 sort=customer_name 发起查询
- **THEN** 系统在包裹后的结果集上按 customer_name 排序
- **AND** 不在 columns 声明或未声明可排的列排序返回 400

### Requirement: 数据源 metadata 声明字段排序能力

数据源 metadata 的每列 SHALL 声明 `sortable` 能力（Boolean），作为该字段能否参与排序的权威依据。推导规则：列类型为 JSON/TEXT、组件为 colorPicker、或含子表（subColumns）的字段 MUST 标记为不可排序（`sortable=false`）；数值（INTEGER/BIGINT/TINYINT/DECIMAL）、日期（DATE/DATETIME）、短文本/VARCHAR 字段 MUST 标记为可排序（`sortable=true`）。FORM 数据源按绑定表单 column_config 推导，且当配置了 JOIN/SQL 查询时，SHALL 额外输出虚拟列的 sortable 声明（config 模式按 joins 中 sortable 字段、sql 模式按 columns 中 sortable 字段）；WORKFLOW 数据源按最新 PUBLISHED schema 提取列推导（系统列中 `startTime` 可排、映射底层 `h.START_TIME_`，`instanceId`/`processStatus`/`initiatorName`/`currentNodeName` 等派生列不可排），SYSTEM/API 数据源所有列 MUST 返回 `sortable=false`。客户端接口 `GET /api/v1/data-sources/{id}/metadata` 响应中 SHALL 包含 `sortable` 字段。
#### Scenario: FORM 数据源可排字段声明
- **WHEN** 客户端请求已启用 FORM 数据源的 metadata
- **THEN** 数值/日期/短文本列的 `sortable` 为 true
- **AND** JSON/TEXT/colorPicker/子表字段列的 `sortable` 为 false
- **AND** 配置了 JOIN/SQL 时，虚拟列按声明输出 sortable

#### Scenario: WORKFLOW 数据源可排字段声明
- **WHEN** 客户端请求已启用 WORKFLOW 数据源的 metadata
- **THEN** 表单数据日期列的 `sortable` 为 true
- **AND** `startTime` 系统列的 `sortable` 为 true，`initiatorName`/`currentNodeName`/`processStatus` 为 false

#### Scenario: SYSTEM/API 数据源不可排序
- **WHEN** 客户端请求 SYSTEM 或 API 数据源的 metadata
- **THEN** 所有列的 `sortable` 均为 false
