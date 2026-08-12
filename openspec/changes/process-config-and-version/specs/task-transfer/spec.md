# task-transfer Specification (Delta)

## Purpose

修改任务转办能力：转办权限控制叠加流程级开关（AND 规则）；转办接口统一走 `TransferService`（`setAssignee` 实现天然支持多实例节点，运行时效果等价于转签），前端不再提供独立"转签"入口；`/forward-sign` 接口保留为兼容 API。

## MODIFIED Requirements

### Requirement: 转办权限控制（MODIFIED）

当节点 `operations.allowTransfer = false` **或** 流程级 `operations.allowTransfer = false` 时，该节点的任务 SHALL NOT 允许转办，接口 SHALL 返回 400 错误。生效规则 = 流程级 AND 节点级。

#### Scenario: 节点禁止转办

WHEN 节点 `operations.allowTransfer = false`（流程级允许）
THEN 用户尝试转办该任务时接口 SHALL 返回 400
AND 任务 assignee SHALL NOT 变化

#### Scenario: 流程级禁止转办

WHEN 流程级 `operations.allowTransfer = false`（节点级允许）
THEN 用户尝试转办该任务时接口 SHALL 返回 400
AND 任务 assignee SHALL NOT 变化

## ADDED Requirements

### Requirement: 转办接口多实例节点语义（ADDED）

`POST /api/v1/tasks/{id}/transfer` SHALL 统一走 `TransferService.transfer`（`setAssignee` + 清空 owner）。该实现天然覆盖多实例节点：会签/或签节点中每个子任务独立，改 assignee 后原办理人待办消失、目标用户待办出现，其他实例不受影响——运行时效果等价于转签。

前端 SHALL NOT 再提供独立的"转签"入口，转签场景统一通过"转办"操作触发。`POST /api/v1/tasks/{id}/forward-sign` 接口保留（兼容已有调用方），但不从前端"更多操作"菜单暴露。

#### Scenario: 普通节点转办

WHEN 用户对非 MI 节点任务调用 transfer 接口
THEN 系统 SHALL 走 TransferService 逻辑
AND 任务 assignee SHALL 变为目标用户
AND owner SHALL 为 null
AND 审计记录 action SHALL 为 transfer

#### Scenario: 会签节点转办（转签语义）

WHEN 用户对会签（MI）节点任务调用 transfer 接口
THEN 系统 SHALL 走 TransferService 逻辑（setAssignee）
AND 原办理人的待办 SHALL 消失
AND 目标用户获得该子任务待办
AND 其他 MI 实例 SHALL 不受影响
AND 审计记录 action SHALL 为 transfer（运行时效果等价于转签）

#### Scenario: 权限校验在转办执行前

WHEN 节点或流程级 `allowTransfer = false`
THEN 接口 SHALL 返回 400
AND 任务 assignee SHALL NOT 变化
