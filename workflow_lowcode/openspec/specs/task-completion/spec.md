# task-completion Specification

## Purpose
TBD - created by archiving change process-engine-core. Update Purpose after archive.
## Requirements
### Requirement: 任务完成返回值

`POST /api/v1/tasks/{id}/complete` 接口 SHALL 返回 `CompleteTaskResponse`，包含以下字段：
- `nodeCompleted`（boolean）：当前节点是否全部完成
- `remaining`（int）：当前节点剩余未完成任务数
- `processAdvanced`（boolean）：流程是否已前进到下一节点

#### Scenario: 单实例任务完成

WHEN 单实例审批任务被 complete
THEN nodeCompleted SHALL 为 true
AND remaining SHALL 为 0
AND processAdvanced SHALL 为 true

#### Scenario: 会签部分完成

WHEN 3 人会签节点中第 1 个人 complete
THEN nodeCompleted SHALL 为 false
AND remaining SHALL 为 2
AND processAdvanced SHALL 为 false

#### Scenario: 会签最后一人完成

WHEN 3 人会签节点中第 3 个人 complete
THEN nodeCompleted SHALL 为 true
AND remaining SHALL 为 0
AND processAdvanced SHALL 为 true

#### Scenario: 或签完成

WHEN 3 人或签节点中任一人 complete
THEN nodeCompleted SHALL 为 true
AND remaining SHALL 为 0
AND processAdvanced SHALL 为 true

### Requirement: 任务完成核心行为

系统 SHALL 提供 `POST /api/v1/tasks/{id}/complete` 接口，完成任务并可选传入流程变量。

WHEN 调用 complete 接口，body 含 variables
THEN 系统 SHALL 先设置变量再 complete 任务
AND complete 后 SHALL 返回 CompleteTaskResponse

"通过"操作 SHALL 始终可用，不受 operations 配置限制。

#### Scenario: 完成时传入变量

- **WHEN** complete 请求 body 含 `{"variables": {"approved": true}}`
- **THEN** 任务 SHALL 被 complete
- **AND** 流程变量 approved SHALL 被设置
- **AND** 返回值 SHALL 包含 nodeCompleted/remaining/processAdvanced

#### Scenario: 完成不存在的任务

- **WHEN** complete 一个不存在的 taskId
- **THEN** SHALL 返回 404

### Requirement: 节点操作配置模型

节点级 `NodeConfigData.operations` SHALL 包含以下字段：

- `allowReject`（boolean，默认 true）：是否允许驳回
- `allowAddSign`（boolean，默认 false）：是否允许加签
- `allowTransfer`（boolean，默认 true）：是否允许转办
- `allowDelegate`（boolean，默认 false）：是否允许委派
- `allowForwardSign`（boolean，默认 false）：是否允许转签

设计器 `UserTaskProperty.vue` 的操作配置 Tab SHALL 提供以上 5 个操作的开关配置。

#### Scenario: 设计器配置操作权限

- **WHEN** 用户在 UserTaskProperty 操作 Tab 中切换某操作开关
- **THEN** 配置 SHALL 保存到 NodeConfig.config_json.operations 中
- **AND** 部署后该节点的任务详情页 SHALL 按配置显示/隐藏对应按钮

#### Scenario: 旧配置兼容

- **WHEN** 已有 NodeConfig.config_json.operations 只含 allowReject/allowAddSign/allowTransfer（旧格式）
- **THEN** 解析时 SHALL 用默认值补全缺失的 allowDelegate（false）和 allowForwardSign（false）
- **AND** 不报错

### Requirement: 流程级 approvalPolicy 清理

`ProcessConfigData.approvalPolicy` SHALL 保留 `allowRecall` 字段（控制发起人撤回行为）。

`allowAddSigner` 和 `allowDelegate` 字段 SHALL 标注为弃用（deprecated），前端不再读取，由节点级 `operations.allowAddSign` 和 `operations.allowDelegate` 替代。

#### Scenario: 撤回行为受流程级控制

- **WHEN** 流程级 approvalPolicy.allowRecall 为 true
- **THEN** 发起人 SHALL 可在"我发起的"列表中撤回流程

#### Scenario: 弃用字段兼容

- **WHEN** 已有流程配置中 approvalPolicy 含 allowAddSigner/allowDelegate 值
- **THEN** 系统 SHALL 不报错
- **AND** 这些值 SHALL 不影响按钮显示（已由节点级 operations 替代）

