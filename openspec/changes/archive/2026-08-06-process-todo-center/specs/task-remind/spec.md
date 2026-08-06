## ADDED Requirements

### Requirement: 催办 API

系统 SHALL 新增 `POST /api/v1/tasks/{taskId}/remind` 端点，允许发起人对当前待办审批人发起催办。催办 SHALL 记录到 `wf_task_remind` 表（Flyway 迁移），含 taskId、processInstanceId、remindFrom（发起人）、remindTo（被催办人）、remindTime 字段。

#### Scenario: 正常催办

WHEN 发起人请求 `POST /api/v1/tasks/{taskId}/remind`
AND 该任务未被催办或已超过频率限制周期
THEN 系统 SHALL 记录催办到 wf_task_remind 表
AND 向当前待办审批人发送催办通知
AND 返回成功

#### Scenario: 任务不存在

WHEN 请求的 taskId 不存在
THEN 系统 SHALL 返回 404 错误

### Requirement: 催办频率限制

同一任务在限制周期内（默认 24 小时，可配置）SHALL 不允许重复催办。频率限制基于 wf_task_remind 表的最后催办时间判断。

#### Scenario: 频率限制内重复催办

WHEN 同一任务在 24 小时内已被催办
AND 再次请求催办
THEN 系统 SHALL 返回错误"该任务近期已催办，请稍后再试"
AND 不记录催办、不发送通知

#### Scenario: 频率限制外催办

WHEN 同一任务上次催办超过 24 小时
THEN 系统 SHALL 允许催办并记录

### Requirement: 催办通知

催办成功后系统 SHALL 向当前待办审批人发送催办通知（PRD 3.7 通知场景之一）。通知内容 SHALL 包含流程名称、任务名称、发起人姓名。

#### Scenario: 发送催办通知

WHEN 催办成功
THEN 系统 SHALL 向当前任务的 assignee 或 candidate 用户发送站内信通知
AND 通知内容包含流程名称、任务名称、发起人姓名

### Requirement: 催办状态展示

待办列表中已被催办的任务 SHALL 显示催办角标，提示当前办理人该任务已被催办。

#### Scenario: 待办列表显示催办标记

WHEN 待办任务已被催办且未处理
THEN 待办列表中该任务行 SHALL 显示催办角标图标
