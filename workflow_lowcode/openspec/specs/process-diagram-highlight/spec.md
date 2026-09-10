# process-diagram-highlight Specification

## Purpose
TBD - created by archiving change process-engine-core. Update Purpose after archive.
## Requirements
### Requirement: 流程图高亮数据接口

系统 SHALL 提供 `GET /api/v1/process-instances/{id}/highlight` 接口，返回流程图高亮渲染所需的数据。

响应 SHALL 包含：
- `bpmnXml`：流程定义的 BPMN XML 字符串
- `activities`：节点状态列表，每个元素含 activityId, activityType, activityName, status, startTime, endTime
- `sequenceFlows`：连线状态列表，每个元素含 flowId, sourceRef, targetRef, status

#### Scenario: 返回完整高亮数据

WHEN 调用 GET /process-instances/{id}/highlight
THEN 响应 SHALL 包含 bpmnXml 字符串
AND activities 列表 SHALL 包含流程中所有 activityId
AND sequenceFlows 列表 SHALL 包含所有 sequenceFlow

### Requirement: 节点状态计算

节点 status SHALL 按以下规则计算：
- `COMPLETED`：`ACT_HI_ACTINST` 中有 endTime IS NOT NULL 的记录
- `ACTIVE`：`runtimeService.getActiveActivityIds(pid)` 返回的 activityId
- `PENDING`：BPMN 模型全量 activityId 减去 COMPLETED 和 ACTIVE

#### Scenario: 已完成节点标记 COMPLETED

WHEN 流程经过 startEvent 和 initiatorTask，当前在 managerApproval
THEN startEvent status SHALL 为 COMPLETED
AND initiatorTask status SHALL 为 COMPLETED
AND managerApproval status SHALL 为 ACTIVE
AND endEvent status SHALL 为 PENDING

### Requirement: 连线状态计算

连线 status SHALL 按以下规则计算：
- `TRAVERSED`：`ACT_HI_ACTINST` 中有 activityType=sequenceFlow 的记录
- `UNTRAVERSED`：无记录

#### Scenario: 已走过的连线标记 TRAVERSED

WHEN 流程从 start 经过 f1 到达 initiatorTask
THEN f1 status SHALL 为 TRAVERSED
AND 未走过的 f2 status SHALL 为 UNTRAVERSED

### Requirement: 驳回后高亮显示

流程被驳回（changeActivityState）后，被取消的节点 SHALL 有 endTime（来自 ACT_HI_ACTINST），该节点 status SHALL 为 COMPLETED（不区分 REJECTED）。

#### Scenario: 驳回后被取消节点显示 COMPLETED

WHEN managerApproval 被驳回回 initiatorTask
THEN managerApproval 在历史表有 endTime 记录
AND highlight 接口返回的 managerApproval status SHALL 为 COMPLETED
AND initiatorTask status SHALL 为 ACTIVE（第二次出现）

