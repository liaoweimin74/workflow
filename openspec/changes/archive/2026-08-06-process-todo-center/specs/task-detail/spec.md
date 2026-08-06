## ADDED Requirements

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

详情页中部 SHALL 渲染当前任务关联的表单（若有），字段权限按"审批时查看"控制（PRD 3.2.6）。同时 SHALL 只读展示流程变量（已填写的发起表单数据）。

#### Scenario: 任务有关联表单

WHEN 当前任务关联了表单
THEN 系统 SHALL 渲染表单组件（复用 FormRenderer），字段按"审批时查看"权限展示
AND 下方只读展示发起人填写的流程变量

#### Scenario: 任务无关联表单

WHEN 当前任务未关联表单
THEN 系统 SHALL 仅展示流程变量只读区

### Requirement: 审批操作

详情页底部 SHALL 提供审批意见输入框（必填可配置）、主操作按钮"通过""驳回"，以及"更多操作"下拉菜单含转办、委派、加签、转签。

#### Scenario: 审批通过

WHEN 用户填写审批意见并点击"通过"
THEN 系统 SHALL 校验表单（若关联）
AND 调用 `POST /api/tasks/{id}/complete` 提交，请求体含审批意见作为流程变量
AND 提交成功后返回待办列表，任务从待办移除

#### Scenario: 驳回

WHEN 用户点击"驳回"
THEN 系统 SHALL 弹出确认框要求填写驳回原因
AND 用户确认后调用 `POST /api/tasks/{id}/reject`，请求体含 userId 与 reason
AND 驳回成功后返回待办列表

#### Scenario: 转办

WHEN 用户在"更多操作"中选择"转办"
THEN 系统 SHALL 弹出用户选择器
AND 用户选择办理人后调用 `POST /api/tasks/{id}/transfer`，请求体含 fromUser、toUser、reason

#### Scenario: 委派

WHEN 用户在"更多操作"中选择"委派"
THEN 系统 SHALL 弹出用户选择器
AND 用户选择被委派人后调用 `POST /api/tasks/{id}/delegate`

#### Scenario: 加签

WHEN 用户在"更多操作"中选择"加签"
THEN 系统 SHALL 弹出用户选择器（多选）
AND 用户选择后调用 `POST /api/tasks/{id}/add-sign`

#### Scenario: 转签

WHEN 用户在"更多操作"中选择"转签"
THEN 系统 SHALL 弹出用户选择器
AND 用户选择新审批人后调用 `POST /api/tasks/{id}/forward-sign`

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
