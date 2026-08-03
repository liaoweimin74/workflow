## ADDED Requirements

### Requirement: 任务转办

系统 SHALL 提供 `POST /api/v1/tasks/{id}/transfer` 接口，将任务转办给另一用户。

转办实现 SHALL 使用 `flowableTaskService.setAssignee(taskId, toUser)`，并清空 `owner` 字段（区别于 delegate 的 owner 保留）。

#### Scenario: 转办后 assignee 变更

WHEN 审批人 alice 将任务转办给 bob，reason="出差代办"
THEN 任务 assignee SHALL 变为 bob
AND 任务 owner SHALL 为 null
AND `wf_task_transfer` 表 SHALL 记录 from_user=alice, to_user=bob, reason="出差代办"

#### Scenario: 转办后原审批人脱离任务

WHEN alice 转办给 bob
THEN alice 的待办列表 SHALL NOT 包含该任务
AND bob 的待办列表 SHALL 包含该任务

### Requirement: 转办审计表

系统 SHALL 新增 `wf_task_transfer` 表记录所有转办操作，包含字段：id, tenant_id, task_id, process_instance_id, from_user, to_user, reason, created_at。

#### Scenario: 转办审计记录可查

WHEN alice 转办给 bob
THEN `wf_task_transfer` 表 SHALL 插入一条记录
AND 记录的 from_user SHALL 为 alice
AND 记录的 to_user SHALL 为 bob
AND created_at SHALL 为当前时间

### Requirement: 转办权限控制

WHEN `wf_node_config.configJson.operations.allowTransfer = false`
THEN 该节点的任务 SHALL NOT 允许转办
AND 接口 SHALL 返回 400 错误

#### Scenario: 禁止转办的节点

WHEN 用户尝试转办一个 allowTransfer=false 的任务
THEN 接口 SHALL 返回 400
AND 任务 assignee SHALL NOT 变化
