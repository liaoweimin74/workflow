# form-join-query Delta Specification

> 变更 `form-join-sql-engine`：FORM 数据源跨表 JOIN 关联查询能力（新 capability）

## ADDED Requirements

### Requirement: FORM 数据源查询模式（queryMode）

FORM 数据源 SHALL 通过 `DataSourceDefinition.params` 的 `queryMode` 字段声明查询模式，取值 `config`（声明式 JOIN，系统生成 SQL）或 `sql`（管理员 SQL 模板，系统包裹）。缺省（未配置或为 `config` 且无 joins）SHALL 保持当前单表查询行为，向后兼容。`config` 模式 SHALL 通过 `joins` 数组声明关联，`sql` 模式 SHALL 通过 `query`（SQL 模板）+ `columns`（输出列声明）配置。

#### Scenario: 缺省为 config 且无 joins 保持单表
- **WHEN** FORM 数据源未配置 queryMode 或配置为 `config` 且 joins 为空
- **THEN** 查询行为与当前单表查询完全一致，无 JOIN、无虚拟列
- **AND** filter/sort 白名单仍为主表 column_config + 内置列

#### Scenario: config 模式声明 JOIN
- **WHEN** FORM 数据源配置 `queryMode=config` 且 `joins` 数组非空
- **THEN** 系统按 joins 声明生成跨表 JOIN SQL，实现关联字段展示/排序/筛选

#### Scenario: sql 模式使用 SQL 模板
- **WHEN** FORM 数据源配置 `queryMode=sql` 且提供 `query` + `columns`
- **THEN** 系统将管理员 SQL 模板作为子查询包裹，按 `columns` 声明输出并支持排序/筛选

### Requirement: config 模式 JOIN 声明结构与校验

`config` 模式 SHALL 支持在 `joins` 数组中声明多个关联，每个关联 SHALL 含：`alias`（关联别名）、`targetFormKey`（目标表单）、`localField`（主表关联字段）、`foreignField`（目标表关联字段）、`joinField`（目标表要展示/排序的字段）、`virtualKey`（虚拟列 key）、`label`（列标题）、`sortable`（是否可排序）、`filterable`（是否可筛选）。系统 SHALL 在保存时校验 `targetFormKey` 对应业务表单存在（不存在返回 400）与 `virtualKey` 唯一。系统 SHALL 将 JOIN 翻译为 LEFT JOIN，`joinField` 作为虚拟列 SELECT 输出。

#### Scenario: 校验 targetFormKey 存在
- **WHEN** 管理员保存 config 模式且某 join 的 `targetFormKey` 对应的业务表单不存在
- **THEN** 系统返回 400 错误，提示关联表单不存在
- **AND** 不保存该配置

#### Scenario: virtualKey 唯一性
- **WHEN** 管理员声明的多个虚拟列 virtualKey 重复
- **THEN** 系统返回 400 错误，提示虚拟列 key 重复

#### Scenario: JOIN 翻译为 LEFT JOIN 生成虚拟列
- **WHEN** config 模式声明 join（customer_id → customer.name → customer_name）
- **THEN** 系统生成 `LEFT JOIN wf_biz_customer c ON c.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))`
- **AND** SELECT 增加 `c.name AS customer_name`

### Requirement: SQL 模板（sql 模式）安全约束

`sql` 模式 SHALL 对管理员 SQL 模板强制安全校�- 仅允许 SELECT 语句（含 INSERT/UPDATE/DELETE/DROP/ALTER 等返回 400）；SQL 模板 SHALL 必须包含 `:tenantId` 占位符（缺失返回 400），运行时由系统强制绑定当前租户；所有参数 SHALL 通过参数绑定（PreparedStatement）注入，杜绝 SQL 注入。filter/sort 字段 SHALL 仅限管理员 `columns` 声明中 `filterable`/`sortable=true` 的列（白名单校验）。

#### Scenario: 拒绝非 SELECT 语句
- **WHEN** 管理员保存的 SQL 模板以 `DELETE`/`UPDATE`/`DROP` 等非 SELECT 开头
- **THEN** 系统返回 400 错误，提示仅允许 SELECT 查询

#### Scenario: 缺失 tenantId 被拒
- **WHEN** 管理员的 SQL 模板未包含 `:tenantId` 占位符
- **THEN** 系统返回 400 错误，提示必须包含租户隔离占位符

#### Scenario: 参数化绑定防注入
- **WHEN** 前端对 sql 模式数据源的 filter 条件传递任意值
- **THEN** 系统通过参数绑定注入，不拼接字符串，杜绝 SQL 注入

### Requirement: 统一 SQL 执行引擎（分页/排序/筛选/租户隔离）

FORM 数据源查询 SHALL 经统一执行引擎处理 `config` 与 `sql` 两种模式：两者 SHALL 产出统一的 SQL + 参数绑定列表，共享分页（LIMIT/OFFSET + COUNT）、排序（ORDER BY）、筛选（WHERE 白名单注入）与租户隔离（tenantId 强制绑定）逻辑。filter 协议 SHALL 复用现有 `{logic, conditions:[{column,op,value}]}` 结构。sql 模式 SHALL 将管理员 SQL 包裹为 `SELECT * FROM (管理员SQL) _qs WHERE <filter> ORDER BY <sort> LIMIT <offset>,<size>`，COUNT 基于包裹后的结果集。

#### Scenario: config 模式走统一引擎
- **WHEN** config 模式数据源带 page/size/sort/filter 发起查询
- **THEN** 系统生成 JOIN SQL 并注入分页/排序/白名单筛选/租户隔离
- **AND** 返回正确的 BizDataPageVO（含 total）

#### Scenario: sql 模式包裹分页筛选
- **WHEN** sql 模式数据源带 sort/filter/page 发起查询
- **THEN** 系统将管理员 SQL 作为子查询包裹，在 `columns` 白名单内注入排序与筛选，并分页
- **AND** 返回正确的 BizDataPageVO（含基于包裹结果集的 total）

### Requirement: metadata 虚拟列声明

FORM 数据源 metadata（`GET /api/v1/data-sources/{id}/metadata`）SHALL 输出 JOIN 虚拟列：config 模式从 joins 声明推导（virtualKey→key、label、columnType、sortable、filterable），sql 模式从管理员声明的 `columns` 映射。虚拟列 SHALL 与主表列一起作为 metadata.columns 返回，供前端渲染/排序/筛选。

#### Scenario: config 模式 metadata 含虚拟列
- **WHEN** config 模式声明虚拟列 customer_name（sortable/filterable）
- **THEN** metadata.columns 包含 customer_name 条目及 sortable/filterable 标记
- **AND** 前端可对该列排序与筛选

#### Scenario: sql 模式 metadata 含声明列
- **WHEN** sql 模式管理员声明 columns 含 customer_name
- **THEN** metadata.columns 包含 customer_name 条目及对应能力标记

### Requirement: SQL 模板非空与 columns 合法校验

`sql` 模式 SHALL 要求 `query` 非空（空返回 400）；`columns` SHALL 至少包含一个可排序列用于缺省排序兜底（无则返回 400）；sql 模式 `columns` 中列名 SHALL 与 SQL 模板 SELECT 输出别名匹配（不匹配返回 400，防止排序引用不存在列）。

#### Scenario: query 为空被拒
- **WHEN** 管理员保存 sql 模式且 query 为空
- **THEN** 系统返回 400 错误，提示 SQL 模板不能为空

#### Scenario: 声明列不在 SELECT 输出被拒
- **WHEN** 管理员 sql 模式声明 columns 含某列，但该列别名不存在于 SQL 模板 SELECT 输出
- **THEN** 系统返回 400 错误，提示声明列不在查询结果中

### Requirement: SQL 模板运行时参数透传（params）

`sql` 模式 SHALL 支持管理员在配置中声明可被前端传入的运行时参数（`params` 白名单，如 `startTime`/`endTime`），这些参数 SHALL 绑定到 SQL 模板中的 `:paramName` 占位符。前端查询请求 SHALL 通过查询请求的 `params` 段（JSON 对象）透传参数值；系统 SHALL 仅绑定命中 `params` 白名单声明的键，未声明或非法的键 SHALL 被拒绝（返回 400）。`:tenantId` 与声明参数 SHALL 均通过参数绑定（PreparedStatement）注入，杜绝 SQL 注入。

#### Scenario: 前端传入声明参数绑定 SQL
- **WHEN** sql 模式数据源声明参数 `startTime`/`endTime`，且 SQL 模板含 `WHERE create_time BETWEEN :startTime AND :endTime`
- **AND** 前端查询请求 params 传 `{startTime:'2026-01-01', endTime:'2026-02-01'}`
- **THEN** 系统将两个值参数化绑定到 SQL 占位符
- **AND** 返回按时间段统计/筛选后的结果

#### Scenario: 未声明参数被拒
- **WHEN** 前端查询请求 params 传入未在 `params` 白名单声明的键（如 `xxx`）
- **THEN** 系统返回 400 错误，提示参数不被允许
- **AND** 不执行查询

#### Scenario: 缺省无 params 段
- **WHEN** 前端查询请求未携带 params 段或 params 为空
- **THEN** 系统以缺省值执行（SQL 中声明参数为空值时按管理员 SQL 对该占位符的缺省语义处理）
- **AND** 不报错
