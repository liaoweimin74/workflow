# task-detail Specification (Delta)

## Purpose

修改任务详情页：操作菜单移除"转签"（并入"转办"）；操作权限解析叠加流程级配置（AND 规则）；`OperationsConfig` 移除 `allowForwardSign` 字段。

## MODIFIED Requirements

### Requirement: 审批操作（MODIFIED）

详情页底部 SHALL 提供审批意见输入框（必填可配置）和操作按钮。操作按钮的显示由 TaskDetailVO.operations 配置控制：

- **"通过"按钮**：始终显示
- **"驳回"按钮**：当 `operations.allowReject == true` 时显示
- **"转办"**：当 `operations.allowTransfer == true` 时显示（在"更多操作"下拉中；会签节点上该操作执行转签语义）
- **"委派"**：当 `operations.allowDelegate == true` 时显示（在"更多操作"下拉中）
- **"加签"**：当 `operations.allowAddSign == true` 时显示（在"更多操作"下拉中）

"转签"项 SHALL 从"更多操作"下拉中移除。当所有"更多操作"项（转办/委派/加签）均不可用时，SHALL 不显示"更多操作"下拉按钮。

#### Scenario: 审批通过

- **WHEN** 用户填写审批意见并点击"通过"
- **THEN** 系统 SHALL 校验表单（若关联）
- **AND** 调用 `POST /api/tasks/{id}/complete` 提交，请求体含审批意见作为流程变量
- **AND** 提交成功后返回待办列表，任务从待办移除

#### Scenario: 驳回

- **WHEN** operations.allowReject 为 true 且用户点击"驳回"
- **THEN** 系统 SHALL 弹出确认框要求填写驳回原因
- **AND** 用户确认后调用 `POST /api/tasks/{id}/reject`，请求体含 userId 与 reason
- **AND** 驳回成功后返回待办列表

#### Scenario: 驳回按钮不显示

- **WHEN** operations.allowReject 为 false
- **THEN** 系统 SHALL 不显示"驳回"按钮
- **AND** 用户无法执行驳回操作

#### Scenario: 转办

- **WHEN** operations.allowTransfer 为 true 且用户在"更多操作"中选择"转办"
- **THEN** 系统 SHALL 弹出用户选择器
- **AND** 用户选择办理人后调用 `POST /api/tasks/{id}/transfer`，请求体含 fromUser、toUser、reason

#### Scenario: 委派

- **WHEN** operations.allowDelegate 为 true 且用户在"更多操作"中选择"委派"
- **THEN** 系统 SHALL 弹出用户选择器
- **AND** 用户选择被委派人后调用委派接口

#### Scenario: 加签

- **WHEN** operations.allowAddSign 为 true 且用户在"更多操作"中选择"加签"
- **THEN** 系统 SHALL 弹出加签配置弹窗
- **AND** 用户配置后调用加签接口

#### Scenario: 更多操作不显示转签项

- **WHEN** 用户打开"更多操作"下拉菜单
- **THEN** 菜单 SHALL 不包含"转签"项
- **AND** 仅包含转办、委派、加签（按对应 allow 开关显示）

#### Scenario: 所有更多操作均不可用

- **WHEN** operations 中 allowTransfer/allowDelegate/allowAddSign 均为 false
- **THEN** 系统 SHALL 不显示"更多操作"下拉按钮
- **AND** 仅显示"通过"按钮（和"驳回"按钮，如 allowReject 为 true）

### Requirement: 操作权限配置解析（MODIFIED）

后端 SHALL 提供 `extractOperations(processDefId, taskDefKey)` 方法，返回操作权限配置对象 `{ allowReject, allowAddSign, allowTransfer, allowDelegate }`（无 `allowForwardSign`）。

解析逻辑：
1. 从该部署版本的 `__PROCESS__` 节点配置读取流程级 operations
2. 从节点配置（NodeConfig, nodeId=taskDefKey）读取节点级 operations
3. 每个开关取 `流程级 && 节点级`（AND 规则）
4. 节点未配置 operations 时，节点级使用默认值；流程级未配置时视为全开

默认值：
- 节点级：`allowReject: true`、`allowTransfer: true`、`allowAddSign: false`、`allowDelegate: false`
- 流程级：四开关均为 `true`

#### Scenario: 节点配置了 operations

- **WHEN** 节点 NodeConfig 含 operations 配置（流程级全开）
- **THEN** extractOperations SHALL 返回该节点配置
- **AND** 缺失字段 SHALL 使用默认值补全

#### Scenario: 流程级与节点级叠加

- **WHEN** 流程级 `allowTransfer = false` 且节点级 `allowTransfer = true`
- **THEN** extractOperations SHALL 返回 `allowTransfer = false`

#### Scenario: 节点未配置 operations

- **WHEN** 节点 NodeConfig 无 operations 配置
- **THEN** extractOperations SHALL 返回节点级默认值与流程级叠加后的结果
- **AND** 返回对象 SHALL NOT 包含 allowForwardSign 字段

### Requirement: TaskDetailVO 扩展（MODIFIED）

`TaskDetailVO` SHALL 包含以下新增字段：

- `fieldPermissions`（`Map<String, String>`）：字段权限映射，key 为字段名，value 为 "EDIT"|"VIEW"|"HIDDEN"。为 null 时表示无权限配置（所有字段可编辑）。
- `operations`（`OperationsConfig`）：操作权限配置。

`OperationsConfig` SHALL 包含以下字段（移除 `allowForwardSign`）：
- `allowReject`（boolean）
- `allowAddSign`（boolean）
- `allowTransfer`（boolean）
- `allowDelegate`（boolean）

#### Scenario: 任务详情包含字段权限和操作配置

- **WHEN** 调用 `GET /api/v1/tasks/{taskId}/detail`
- **THEN** 响应 SHALL 包含 fieldPermissions 字段（来自 extractFormConfig）
- **AND** 响应 SHALL 包含 operations 字段（来自 extractOperations）
- **AND** operations SHALL NOT 包含 allowForwardSign

#### Scenario: 无表单配置的任务

- **WHEN** 任务所在节点和流程均未配置表单
- **THEN** fieldPermissions SHALL 为 null
- **AND** operations SHALL 仍返回默认值配置
