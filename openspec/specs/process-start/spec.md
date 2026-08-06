# process-start Specification

## Purpose
TBD - created by archiving change process-todo-center. Update Purpose after archive.
## Requirements
### Requirement: 发起流程独立页面

用户在流程中心点击流程卡片上的"发起"按钮后，系统 SHALL 跳转到独立发起页面 `/process/start/:processDefinitionId`。发起页面 SHALL 包含四个区域：流程基本信息区、流程图预览区（可折叠，默认折叠）、发起表单区、操作区。

#### Scenario: 进入发起页面

WHEN 用户点击流程卡片"发起"按钮
THEN 系统 SHALL 跳转到 `/process/start/:processDefinitionId`
AND 调用 `GET /api/v1/deployed-processes/{id}` 加载流程基本信息
AND 调用 `GET /api/v1/deployed-processes/{id}/xml` 加载流程图（折叠态，按需渲染）

### Requirement: 发起表单渲染

发起页面 SHALL 渲染流程定义关联的表单。表单字段权限按"创建时填写"控制（PRD 3.2.6）。无关联表单的流程 SHALL 直接展示流程信息与"确认发起"按钮。

#### Scenario: 有关联表单的流程

WHEN 流程定义关联了表单
THEN 系统 SHALL 渲染表单组件（复用 FormRenderer），字段按"创建时填写"权限展示
AND 操作区展示"提交"与"取消"按钮

#### Scenario: 无关联表单的流程

WHEN 流程定义未关联表单
THEN 系统 SHALL 展示流程信息 + "确认发起"按钮，无需填写表单

### Requirement: 发起流程提交

用户点击"提交"后，系统 SHALL 校验表单必填字段与事件脚本（PRD 3.2.4），校验通过后调用 `POST /api/v1/process-instances` 发起流程实例。

#### Scenario: 提交成功

WHEN 表单校验通过且用户点击"提交"
THEN 系统 SHALL 调用 `POST /api/v1/process-instances`，请求体包含 `processKey` 和表单变量
AND 提交成功后跳转到待办中心"我发起的"Tab，高亮显示新建的流程实例

#### Scenario: 表单校验失败

WHEN 表单必填字段未填写或事件脚本校验失败
THEN 系统 SHALL 阻止提交并显示校验错误信息

#### Scenario: 取消发起

WHEN 用户点击"取消"
THEN 系统 SHALL 返回流程中心页面

### Requirement: 发起后通知

流程实例发起成功后，系统 SHALL 触发通知（PRD 3.7），通知第一个审批人有新任务待处理。

#### Scenario: 发起后通知第一审批人

WHEN 流程实例发起成功且流程有第一个用户任务节点
THEN 系统 SHALL 向该任务的 assignee 或 candidate 用户发送新任务通知

