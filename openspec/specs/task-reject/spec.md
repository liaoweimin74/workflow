# task-reject Specification

## Purpose
TBD - created by archiving change process-engine-core. Update Purpose after archive.
## Requirements
### Requirement: 驳回到发起人节点

系统 SHALL 提供 `POST /api/v1/tasks/{id}/reject` 接口，将当前审批任务驳回至发起人节点。

驳回实现 SHALL 使用 `runtimeService.createChangeActivityStateBuilder().moveActivityIdTo(currentActivityId, initiatorActivityId).changeState()`。

#### Scenario: 单实例任务驳回回发起人

WHEN 经理审批任务（managerApproval）被驳回
THEN 流程 SHALL 回退到发起人节点（initiatorTask）
AND managerApproval 任务 SHALL 从 ACT_RU_TASK 消失
AND initiatorTask SHALL 重新出现，assignee 为原发起人
AND 流程变量 SHALL 保留

#### Scenario: 驳回后重新提交流程继续

WHEN 发起人节点被驳回后重新 complete
THEN 流程 SHALL 再次到达原审批节点
AND 审批节点 assignee SHALL 为原审批人

### Requirement: 发起人节点自动识别

系统 SHALL 通过解析 BPMN 模型自动识别发起人节点：`startEvent` 的 `outgoing` sequenceFlow 指向的第一个 `userTask`。

WHEN 流程含 start → initiatorTask → managerApproval 结构
THEN 驳回时 initiatorActivityId SHALL 为 `initiatorTask`

#### Scenario: 线性流程发起人识别

WHEN 流程结构为 start → fillForm → managerApproval → end
THEN 系统识别的发起人节点 SHALL 为 `fillForm`

### Requirement: MI 节点驳回整体回退

MI 会签/或签节点被驳回时，`moveActivityIdTo` SHALL 对 MI 节点生效，所有 MI 实例（含已完成和待办）SHALL 全部回收，发起人节点 SHALL 重新出现，`approverList` 变量 SHALL 保留，发起人重新提交后 MI 节点 SHALL 用原 `approverList` 重新展开全部实例。

#### Scenario: 会签节点部分完成后整体驳回

WHEN approverList = [bob, carol, dave] 的会签节点，bob 已完成，carol 待办
AND carol 点驳回
THEN bob 和 carol 的任务 SHALL 全部消失
AND initiatorTask SHALL 重新出现
WHEN 发起人重新提交
THEN 会签节点 SHALL 重新展开 3 个实例 [bob, carol, dave]
AND bob SHALL 需要重新审批

### Requirement: 驳回权限控制

当 `wf_node_config.configJson.operations.allowReject = false` 时，该节点的任务 SHALL NOT 允许驳回，接口 SHALL 返回 400 错误。

#### Scenario: 禁止驳回的节点

WHEN 用户尝试驳回一个 allowReject=false 的任务
THEN 接口 SHALL 返回 400
AND 任务状态 SHALL NOT 变化

