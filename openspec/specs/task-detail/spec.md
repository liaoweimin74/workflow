# task-detail Specification

## Purpose
TBD - created by archiving change process-todo-center. Update Purpose after archive.
## Requirements
### Requirement: 任务处理详情页布局

任务处理详情页 `/process/todo/:taskId` SHALL 采用标准三段布局：顶部流程基本信息、中部审批表单、底部审批意见区，右侧（或可折叠抽屉）展示流程跟踪。

#### Scenario: 进入处理详情页

WHEN 用户在待办列表点击"处理"按钮
THEN 系统 SHALL 跳转到 `/process/todo/:taskId`
AND 调用 `GET /api/tasks/{id}` 加载任务详情（返回 TaskDetailVO 含流程信息）
AND 调用 `GET /api/v1/process-instances/{processInstanceId}/highlight` 加载流程高亮图
AND 调用 `GET /api/v1/process-instances/{processInstanceId}/history` 加载审批记录时间线

### Requirement: 流程基本信息展示

详情页顶部 SHALL 展示流程名称、流程编号、发起人、发起时间、当前节点名称。

#### Scenario: 展示流程基本信息

WHEN 详情页加载完成
THEN 顶部区域 SHALL 展示从 TaskDetailVO 获取的流程基本信息字段

### Requirement: 审批表单渲染

详情页中部 SHALL 渲染当前任务关联的表单（若有）。表单字段权限按节点配置的 `fieldPermissions` 控制（EDIT/VIEW/HIDDEN），从 TaskDetailVO 的 `fieldPermissions` 字段获取。同时 SHALL 只读展示流程变量（已填写的发起表单数据）。

#### Scenario: 任务有关联表单

- **WHEN** 当前任务关联了表单（TaskDetailVO.formKey 不为空）
- **THEN** 系统 SHALL 渲染 FormRenderer 组件
- **AND** 将 TaskDetailVO.fieldPermissions 传递给 FormRenderer
- **AND** FormRenderer 按字段权限控制每个字段的编辑/只读/隐藏
- **AND** 下方只读展示发起人填写的流程变量

#### Scenario: 任务无关联表单

- **WHEN** 当前任务未关联表单（TaskDetailVO.formKey 为空）
- **THEN** 系统 SHALL 仅展示流程变量只读区

#### Scenario: 字段权限为空

- **WHEN** TaskDetailVO.fieldPermissions 为 null 或空对象
- **THEN** FormRenderer SHALL 视所有字段为可编辑（EDIT）

### Requirement: 审批操作

详情页底部 SHALL 提供审批意见输入框（必填可配置）和操作按钮。操作按钮的显示由 TaskDetailVO.operations 配置控制：

- **"通过"按钮**：始终显示
- **"驳回"按钮**：当 `operations.allowReject == true` 时显示
- **"转办"**：当 `operations.allowTransfer == true` 时显示（在"更多操作"下拉中）
- **"委派"**：当 `operations.allowDelegate == true` 时显示（在"更多操作"下拉中）
- **"加签"**：当 `operations.allowAddSign == true` 时显示（在"更多操作"下拉中）
- **"转签"**：当 `operations.allowForwardSign == true` 时显示（在"更多操作"下拉中）

当所有"更多操作"项（转办/委派/加签/转签）均不可用时，SHALL 不显示"更多操作"下拉按钮。

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

#### Scenario: 转签

- **WHEN** operations.allowForwardSign 为 true 且用户在"更多操作"中选择"转签"
- **THEN** 系统 SHALL 弹出转签配置弹窗
- **AND** 用户配置后调用转签接口

#### Scenario: 所有更多操作均不可用

- **WHEN** operations 中 allowTransfer/allowDelegate/allowAddSign/allowForwardSign 均为 false
- **THEN** 系统 SHALL 不显示"更多操作"下拉按钮
- **AND** 仅显示"通过"按钮（和"驳回"按钮，如 allowReject 为 true）

### Requirement: 操作后通知

任务操作完成后系统 SHALL 触发对应通知（PRD 3.7）：通过/驳回通知发起人，转办/委派/加签/转签通知新办理人。

#### Scenario: 通过后通知发起人

WHEN 任务审批通过且流程流转到下一节点
THEN 系统 SHALL 通知下一节点办理人有新任务
AND 若流程结束 SHALL 通知发起人审批通过

### Requirement: 已办只读详情页

已办列表点击"查看" SHALL 跳转到只读详情页 `/process/todo/done/:taskId`，展示内容同待办详情页但：审批表单只读、无操作按钮、流程跟踪显示提交时的处理记录。

#### Scenario: 查看已办详情

WHEN 用户在已办列表点击"查看"
THEN 系统 SHALL 跳转到只读详情页
AND 审批表单 SHALL 为只读模式
AND 不展示操作按钮
AND 流程跟踪 SHALL 高亮当时处理的节点

#### Scenario: 已办流程仍在进行中

WHEN 已办任务对应的流程实例仍在进行中
THEN 流程跟踪 SHALL 显示最新状态
AND 提供"查看实时进度"跳转到流程实例跟踪页

### Requirement: 操作权限配置解析

后端 SHALL 提供 `extractOperations(processDefId, taskDefKey)` 方法，返回操作权限配置对象 `{ allowReject, allowAddSign, allowTransfer, allowDelegate, allowForwardSign }`。

解析逻辑：
1. 从节点配置（NodeConfig, nodeId=taskDefKey）读取 `operations`
2. 节点未配置 operations 时，SHALL 使用默认值

默认值：
- `allowReject: true`
- `allowTransfer: true`
- `allowAddSign: false`
- `allowDelegate: false`
- `allowForwardSign: false`

#### Scenario: 节点配置了 operations

- **WHEN** 节点 NodeConfig 含 operations 配置
- **THEN** extractOperations SHALL 返回该配置
- **AND** 缺失字段 SHALL 使用默认值补全

#### Scenario: 节点未配置 operations

- **WHEN** 节点 NodeConfig 无 operations 配置
- **THEN** extractOperations SHALL 返回全部默认值

### Requirement: TaskDetailVO 扩展

`TaskDetailVO` SHALL 包含以下新增字段：

- `fieldPermissions`（`Map<String, String>`）：字段权限映射，key 为字段名，value 为 "EDIT"|"VIEW"|"HIDDEN"。为 null 时表示无权限配置（所有字段可编辑）。
- `operations`（`OperationsConfig`）：操作权限配置。

`OperationsConfig` SHALL 包含以下字段：
- `allowReject`（boolean）
- `allowAddSign`（boolean）
- `allowTransfer`（boolean）
- `allowDelegate`（boolean）
- `allowForwardSign`（boolean）

#### Scenario: 任务详情包含字段权限和操作配置

- **WHEN** 调用 `GET /api/v1/tasks/{taskId}/detail`
- **THEN** 响应 SHALL 包含 fieldPermissions 字段（来自 extractFormConfig）
- **AND** 响应 SHALL 包含 operations 字段（来自 extractOperations）

#### Scenario: 无表单配置的任务

- **WHEN** 任务所在节点和流程均未配置表单
- **THEN** fieldPermissions SHALL 为 null
- **AND** operations SHALL 仍返回默认值配置

