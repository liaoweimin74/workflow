# process-tracking Specification

## Purpose
TBD - created by archiving change process-todo-center. Update Purpose after archive.
## Requirements
### Requirement: 流程实例跟踪页

"我发起的"列表点击"跟踪" SHALL 跳转到流程实例详情页 `/process/instance/:instanceId`，展示流程基本信息、流程图高亮当前活动节点、完整审批记录时间线。

#### Scenario: 进入跟踪页

WHEN 用户在"我发起的"列表点击"跟踪"
THEN 系统 SHALL 跳转到 `/process/instance/:instanceId`
AND 调用 `GET /api/v1/process-instances/{id}` 加载实例信息
AND 调用 `GET /api/v1/process-instances/{id}/highlight` 加载高亮图
AND 调用 `GET /api/v1/process-instances/{id}/history` 加载审批记录

### Requirement: 流程图高亮展示

跟踪页 SHALL 展示流程定义的 BPMN 图，已完成节点高亮为绿色，当前活动节点高亮为蓝色（复用 PRD 3.3.1 流程图高亮跟踪能力）。

#### Scenario: 展示高亮图

WHEN 跟踪页加载完成
THEN 系统 SHALL 渲染 BPMN 图（基于 bpmn-js Viewer 模块）
AND 已完成节点 SHALL 高亮为绿色
AND 当前活动节点 SHALL 高亮为蓝色

### Requirement: 审批记录时间线

跟踪页 SHALL 展示完整审批记录时间线，每条记录包含：节点名称、办理人、处理时间、审批意见、操作类型（提交/通过/驳回/转办/委派/加签/转签）。时间线按时间正序排列。

#### Scenario: 展示审批记录

WHEN 跟踪页加载完成
THEN 时间线 SHALL 按时间正序展示所有已处理的审批记录
AND 每条记录 SHALL 显示节点名称、办理人姓名、处理时间、审批意见、操作类型标签

#### Scenario: 流程进行中显示当前节点

WHEN 流程实例仍在进行中
THEN 时间线末尾 SHALL 显示"当前节点：<节点名称>，办理人：<办理人>"的待处理标记

### Requirement: 审批记录历史 API

系统 SHALL 新增 `GET /api/v1/process-instances/{id}/history` 端点，返回流程实例的审批记录时间线数据。响应 SHALL 为列表，每项包含：activityId、activityName、assignee、assigneeName、startTime、endTime、action（操作类型）、comment（审批意见）。

#### Scenario: 查询审批记录

WHEN 请求 `GET /api/v1/process-instances/{id}/history`
THEN 系统 SHALL 基于 Flowable HistoryService 查询历史活动节点与历史变量
AND 聚合返回审批记录列表，按时间正序排列

#### Scenario: 审批意见存储

WHEN 用户在任务处理时填写审批意见并提交
THEN 系统 SHALL 将审批意见持久化（存储到 wf_task_comment 表或 Flowable comment 变量）
AND 审批记录 API SHALL 能查询到该意见

### Requirement: 进行中实例催办

流程实例详情页中，若实例状态为"进行中"，SHALL 允许发起人执行催办操作，对待办审批人发起催办。催办 SHALL 受频率限制。

#### Scenario: 发起人催办

WHEN 发起人在进行中的流程实例详情页点击"催办"
THEN 系统 SHALL 调用 `POST /api/v1/tasks/{taskId}/remind`
AND 若未超过频率限制 SHALL 通知当前待办审批人
AND 页面显示催办成功提示

#### Scenario: 催办频率限制

WHEN 同一任务在限制周期内（默认 24 小时）已被催办
THEN 系统 SHALL 拒绝重复催办并返回提示"该任务近期已催办，请稍后再试"

### Requirement: 已结束实例只读

已结束的流程实例（状态为已通过/已驳回/已终止）SHALL 以只读模式展示完整流程记录，无催办按钮。

#### Scenario: 查看已结束实例

WHEN 流程实例状态为已结束
THEN 跟踪页 SHALL 只读展示完整审批记录时间线
AND 不展示催办按钮

