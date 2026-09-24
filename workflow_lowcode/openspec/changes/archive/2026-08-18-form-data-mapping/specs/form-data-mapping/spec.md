# form-data-mapping Specification

## ADDED Requirements

### Requirement: 节点级字段映射配置

节点表单配置 SHALL 支持声明字段数据映射（`dataMappings`），定义本表单字段从哪个
上游数据源取值。映射配置 SHALL 存放在目标节点的 `NodeConfig.configJson.form.dataMappings`，
结构为数组，每项包含：

- `targetField`：本表单的目标字段名（MUST 存在于本表单 schema）
- `source`：数据源标识，形式 SHALL 为以下三种之一：
  - `form:initiator`：发起人节点表单（逻辑引用，运行时解析为发起人节点当前生效的表单）
  - `form:<nodeId>`：流程中指定 BPMN 节点 ID 的表单
  - `variable:<name>`：流程变量
- `sourceField`：源表单字段名（仅 `form:*` 源需要；`variable:*` 源不使用该字段）

未配置 `dataMappings` 的节点 SHALL 保持现有行为（只读本表单数据，无映射聚合）。

#### Scenario: 配置发起人表单字段映射

- **WHEN** 节点配置 `dataMappings` 包含
  `{ "targetField": "applicantName", "source": "form:initiator", "sourceField": "name" }`
- **THEN** 该节点渲染表单时，`applicantName` 字段 SHALL 预填发起人表单 `name` 字段的值

#### Scenario: 配置指定节点表单字段映射

- **WHEN** 节点配置 `dataMappings` 包含
  `{ "targetField": "amount", "source": "form:UserTask_1", "sourceField": "total" }`
- **THEN** 该节点渲染表单时，`amount` 字段 SHALL 预填 `UserTask_1` 节点表单
  `total` 字段的值

#### Scenario: 配置流程变量映射

- **WHEN** 节点配置 `dataMappings` 包含
  `{ "targetField": "auditResult", "source": "variable:gatewayResult" }`
- **THEN** 该节点渲染表单时，`auditResult` 字段 SHALL 预填流程变量
  `gatewayResult` 的值

#### Scenario: 未配置映射的节点

- **WHEN** 节点未配置 `dataMappings`（或映射数组为空）
- **THEN** 该节点渲染 SHALL 只加载本表单数据
- **AND** 不进行任何映射聚合

### Requirement: 映射数据后端聚合

后端 SHALL 提供映射数据聚合能力：按目标节点的 `dataMappings` 解析源数据，
返回 `targetField → value` 的映射集合（`mappedData`）。聚合逻辑 SHALL：

- 对 `form:initiator` 源：解析发起人节点表单 formDefId，查询该流程实例下该表单的
  当前数据（`wf_form_data`，isSnapshot=false），取 `sourceField` 值
- 对 `form:<nodeId>` 源：查询指定节点表单 formDefId 及该实例下的当前数据，取字段值
- 对 `variable:<name>` 源：从 Flowable 运行时/历史变量取 `name` 的值
- 节点配置按部署版本快照（`findByProcessDefinitionId`）解析，保证与审批时一致

当源数据不存在（节点未执行、表单未填写、变量缺失）时，SHALL 不做聚合该字段的
处理且不报错——`mappedData` 中缺省该字段，渲染时对应字段留空。

#### Scenario: 聚合发起人表单字段

- **WHEN** 目标节点配置 `form:initiator` 映射，且该流程实例存在发起人表单当前数据
- **THEN** 聚合结果 `mappedData` SHALL 包含目标字段及其源字段值

#### Scenario: 源数据缺失

- **WHEN** 映射源表单在该实例下无当前数据（如引用节点尚未执行）
- **THEN** `mappedData` SHALL 不包含该目标字段
- **AND** 聚合过程 SHALL 不抛错、不阻塞任务详情返回

#### Scenario: 变量源聚合

- **WHEN** 映射源为 `variable:<name>` 且变量存在
- **THEN** `mappedData` SHALL 包含以变量值为值的条目

### Requirement: 配置 UI 数据来源设置

流程设计器的节点属性面板（`FormPropertyTab`）SHALL 为表单字段提供"数据来源"设置，
允许为每个字段配置映射来源：

- 无（默认）：本节点首次填写
- 发起人表单 + 源字段（下拉选择发起人表单定义及其字段）
- 指定节点 + 源字段（下拉选择流程内其他节点及其表单字段）
- 流程变量 + 变量名（输入变量名）

配置结果 SHALL 写入目标节点 `dataMappings`。已有 `fieldPermissions` 配置不受影响，
映射字段的可编辑性仍由 `fieldPermissions` 决定（映射字段默认建议配置为 VIEW）。

#### Scenario: 配置字段来源为发起人表单

- **WHEN** 用户在属性面板为字段选择"发起人表单"并指定源字段
- **THEN** 该节点的 `dataMappings` SHALL 新增
  `{ "targetField": 该字段, "source": "form:initiator", "sourceField": 所选字段 }`

#### Scenario: 清除字段来源

- **WHEN** 用户将字段的"数据来源"设置为"无"
- **THEN** `dataMappings` SHALL 移除该字段对应的映射条目

### Requirement: 映射配置发布校验

发布流程 SHALL 校验映射配置：

- `targetField` SHALL 存在于目标表单 schema
- `form:*` 源的 `sourceField` SHALL 存在于源表单 schema（源表单按逻辑引用解析可得时）
- SHALL 禁止循环引用：不允许 A 节点引用 B 且 B 节点引用 A（含经 `form:initiator`
  的间接引用环）
- `variable:*` 源的变量名 SHALL 非空

校验失败 SHALL 阻止发布，错误信息 SHALL 定位到节点与字段。

#### Scenario: 目标字段不存在

- **WHEN** `dataMappings` 中 `targetField` 不在目标表单 schema 中
- **THEN** 发布 SHALL 失败
- **AND** 错误信息 SHALL 指明节点与不存在的字段名

#### Scenario: 循环引用

- **WHEN** 节点 A 引用节点 B 的表单字段，且节点 B 引用节点 A 的表单字段
- **THEN** 发布 SHALL 失败
- **AND** 错误信息 SHALL 指明循环引用涉及的节点

#### Scenario: 合法映射通过校验

- **WHEN** 所有映射的 targetField/sourceField 均存在且无循环引用
- **THEN** 发布 SHALL 成功