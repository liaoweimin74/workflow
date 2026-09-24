# workflow-form-datasource Specification

## Purpose
TBD - created by archiving change unify-workflow-form-datasource. Update Purpose after archive.
## Requirements
### Requirement: WORKFLOW 数据源类型定义与启用校验

系统 SHALL 支持 `type = "WORKFLOW"` 的数据源定义，复用 `formKey` 字段绑定工作流表单定义 key。启用（enable）时系统 MUST 校验：绑定表单存在、最新版本状态为 PUBLISHED、且表单类型不为 BUSINESS（BUSINESS 表单 MUST 通过 FORM 类型表达）；任一不满足 MUST 抛出 400 业务异常。

#### Scenario: 启用合法 WORKFLOW 数据源
- **WHEN** 管理员创建 type=WORKFLOW 且 formKey 指向已发布的非业务表单的数据源，并调用启用接口
- **THEN** 数据源状态变更为 ENABLED 并返回更新后的 DTO

#### Scenario: 启用时绑定 BUSINESS 表单被拒绝
- **WHEN** 对 formKey 指向 BUSINESS 类型已发布表单的 WORKFLOW 数据源调用启用
- **THEN** 返回 400 错误，提示须使用 FORM 类型，状态保持 DRAFT

#### Scenario: 启用时表单未发布被拒绝
- **WHEN** 对 formKey 指向无 PUBLISHED 版本表单的 WORKFLOW 数据源调用启用
- **THEN** 返回 400 错误提示表单不存在或未发布

---

### Requirement: WORKFLOW 数据源元数据

已启用的 WORKFLOW 数据源 metadata MUST 包含固定 5 个系统列（instanceId/processStatus/initiatorName/startTime/currentNodeName）与从绑定表单最新 PUBLISHED 版本 schema 解析出的表单列（field→key、title→label、组件类型映射列类型：数字→INT/DECIMAL、日期→DATE/DATETIME、其余默认 VARCHAR），且 `writable` MUST 为 false。子表与文件类字段 MUST NOT 展开为列。metadata 每列 MUST 声明 `sortable` 能力：系统列中 `startTime` 可排序（`sortable=true`，排序映射底层 `h.START_TIME_`），`instanceId`/`processStatus`/`initiatorName`/`currentNodeName` 等派生列不可排序（`sortable=false`）；表单列按列类型推导（数值/日期可排，JSON/TEXT 不可排）。

#### Scenario: 获取已启用 WORKFLOW 数据源元数据
- **WHEN** 客户端请求已启用 WORKFLOW 数据源的 metadata
- **THEN** 返回的 columns 以 5 个系统列开头，随后是 schema 解析出的表单列，writable 为 false
- **AND** `startTime` 列 `sortable` 为 true，派生系统列 `sortable` 为 false，数值/日期表单列 `sortable` 为 true

#### Scenario: 子表与文件类字段不展开
- **WHEN** 绑定表单 schema 含子表或文件上传组件字段
- **THEN** metadata columns 中不出现对应的列

---

### Requirement: WORKFLOW 数据源跨实例查询

WORKFLOW 数据源 query MUST 返回绑定 key 全部版本的 `wf_form_data` 中满足 `is_snapshot=false AND process_instance_id IS NOT NULL` 的记录：每行由 5 系统列与 dataJson 按 schema 字段展开组成；跨版本实例的字段 MUST 以最新 PUBLISHED schema 为准展开（缺失字段为空值、多余字段忽略），MUST NOT 抛错。get MUST 支持按记录 id 取单行。

#### Scenario: 查询跨实例列表
- **WHEN** 同一表单 key 下存在多个流程实例的非快照表单数据，客户端对该 WORKFLOW 数据源发起分页查询
- **THEN** 返回每个流程实例一行的分页结果，含系统列值与表单字段值

#### Scenario: 旧版本实例字段按最新 schema 展开
- **WHEN** 某流程实例创建时的表单版本早于最新 PUBLISHED 版本
- **THEN** 该行仅包含最新 schema 声明的字段，旧版独有字段不出现在 data 中且不报错

---

### Requirement: WORKFLOW 数据源筛选与排序

WORKFLOW query MUST 支持 filter 条件与 keyword 用 MySQL JSON_EXTRACT 对表单字段做等值/LIKE 匹配。排序 MUST 支持业务列与可排系统列：业务列按 `JSON_UNQUOTE(JSON_EXTRACT(f.data_json, '$.<key>'))` 排序，数值列（INT/DECIMAL）MUST 先 `CAST(... AS SIGNED/DECIMAL)` 再排序（避免 JSON 字符串字典序导致 10 < 2）；系统列仅 `startTime` 可排序，映射底层 `h.START_TIME_` 列。排序字段 MUST 命中最新 schema 业务列或可排系统列映射表，非法 MUST 返回 400；order 仅接受 `asc`/`desc`（非法回退默认）。缺省无 sort 参数时 MUST 保持默认排序 `COALESCE(h.START_TIME_, f.created_at) DESC`。

#### Scenario: 按表单字段筛选
- **WHEN** 客户端以某表单字符串字段的等值条件发起查询
- **THEN** 仅返回该字段匹配的实例行

#### Scenario: 按业务数值列排序
- **WHEN** 客户端以数值业务列作为 sort 参数、order=desc 发起查询
- **THEN** 返回结果按数值大小降序（数值 CAST 后排序）

#### Scenario: 按系统列 startTime 排序
- **WHEN** 客户端以 startTime 作为 sort 参数、order=asc 发起查询
- **THEN** 返回结果按发起时间升序

#### Scenario: 排序字段不在白名单被拒
- **WHEN** 客户端以非表单字段或不可排派生列（如 currentNodeName）作为 sort 参数发起查询
- **THEN** 返回 400 错误，提示排序字段不在表单字段中

#### Scenario: 缺省排序保持
- **WHEN** 客户端不携带 sort 参数发起查询
- **THEN** 结果按 `COALESCE(h.START_TIME_, f.created_at) DESC` 返回

### Requirement: WORKFLOW 数据源写操作拒绝

对 WORKFLOW 数据源的 create/update/delete 操作 MUST 抛出 `BusinessException(400)` 提示不支持写操作。

#### Scenario: 尝试修改工作流数据源数据
- **WHEN** 客户端对已启用 WORKFLOW 数据源调用 updateData 或 deleteData
- **THEN** 返回 400 错误，wf_form_data 无任何变更

