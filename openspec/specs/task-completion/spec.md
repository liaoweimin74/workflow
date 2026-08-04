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

#### Scenario: 完成时传入变量

WHEN complete 请求 body 含 `{"variables": {"approved": true}}`
THEN 任务 SHALL 被 complete
AND 流程变量 approved SHALL 被设置
AND 返回值 SHALL 包含 nodeCompleted/remaining/processAdvanced

#### Scenario: 完成不存在的任务

WHEN complete 一个不存在的 taskId
THEN SHALL 返回 404

