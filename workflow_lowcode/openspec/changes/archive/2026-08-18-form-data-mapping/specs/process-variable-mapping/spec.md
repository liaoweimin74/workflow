# process-variable-mapping Specification

## ADDED Requirements

### Requirement: 流程级变量映射配置

流程配置 SHALL 支持声明表单字段到流程变量的映射（`variableMappings`），使表单字段
可被网关条件（如 `${amount > 1000}`）及 `variable:<name>` 映射源引用。映射配置
SHALL 存放在 `__PROCESS__` 节点（流程默认配置）的 `NodeConfig.configJson.variableMappings`，
结构为数组，每项包含：

- `variable`：流程变量名（MUST 在流程级声明中唯一，区分大小写）
- `source`：数据源标识，形式与节点级 `dataMappings` 一致（`form:initiator` /
  `form:<nodeId>` / `variable:<name>`）
- `sourceField`：源表单字段名（仅 `form:*` 源需要）

未配置 `variableMappings` 的流程 SHALL 保持现有变量行为。

#### Scenario: 配置发起表单字段为流程变量

- **WHEN** 流程配置 `variableMappings` 包含
  `{ "variable": "requestAmount", "source": "form:initiator", "sourceField": "amount" }`
- **THEN** 流程实例 SHALL 具备名为 `requestAmount` 的流程变量
- **AND** 其值 SHALL 为发起人表单 `amount` 字段的值

#### Scenario: 重复变量名

- **WHEN** `variableMappings` 中两个条目声明相同的 `variable` 名
- **THEN** 发布 SHALL 失败
- **AND** 错误信息 SHALL 指明重复的变量名

#### Scenario: 未配置变量映射

- **WHEN** 流程未配置 `variableMappings`（或数组为空）
- **THEN** 流程变量行为 SHALL 与现状一致（仅显式传入的变量存在）

### Requirement: 变量写入时机

系统 SHALL 在以下两个时机按 `variableMappings` 写入流程变量：

1. **流程发起时**：写入发起人表单字段对应的映射变量
2. **每次任务完成时**：按当前生效的 `variableMappings`，从源数据取最新值更新
   所有映射变量（包括未变化的条目，保证一致性）

写入取值 SHALL 与映射聚合一致：`form:*` 源取该实例下源表单当前数据字段值，
`variable:*` 源取当前流程变量值原样写入。

#### Scenario: 发起时写入变量

- **WHEN** 用户发起流程且发起人表单填写了映射源字段
- **THEN** 对应映射变量 SHALL 在流程实例创建时写入
- **AND** 变量值 SHALL 等于发起人表单字段值

#### Scenario: 任务完成时更新变量

- **WHEN** 某个任务完成，且该节点表单更新了映射源字段值
- **THEN** 任务完成后对应流程变量 SHALL 更新为最新值
- **AND** 后续网关条件求值 SHALL 基于更新后的变量值

#### Scenario: 变量缺失不阻断

- **WHEN** 映射源数据缺失（源表单未填写）
- **THEN** 变量写入 SHALL 跳过该条目或写入空值
- **AND** 任务完成/流程流转 SHALL 不被阻断

### Requirement: 变量映射配置 UI

流程设计器 SHALL 提供流程级"变量映射"配置面板（编辑 `__PROCESS__` 节点的
`variableMappings`），支持：

- 新增/删除映射条目
- 设置变量名（输入框）
- 设置数据源（发起人表单字段 / 指定节点字段 / 流程变量，选择或输入）
- 校验重复变量名

#### Scenario: 新增变量映射

- **WHEN** 用户在流程级面板新增条目并填写变量名与数据源
- **THEN** `__PROCESS__` 配置的 `variableMappings` SHALL 包含该条目

#### Scenario: 保存时检测重复变量名

- **WHEN** 用户在 UI 中输入已存在的变量名
- **THEN** UI SHALL 提示重复
- **AND** 拒绝保存该条目