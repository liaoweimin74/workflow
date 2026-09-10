## Why

前端设计器已支持会签/或签/转办/驳回等审批策略配置（存入 `wf_node_config` JSON），但后端运行时完全不读配置——`completeTask` 裸调 `flowableTaskService.complete()`，配置是"死"的。本期补齐运行时执行能力，让会签/或签/驳回/转办/变量/高亮真正生效。Spike 已验证 BPMN MI 原生路线和 changeActivityState 路线均可行（4/4 通过）。

## What Changes

**会签/或签运行时生效**
- From: `deploy()` 直接部署前端传来的 BPMN XML，不读 `wf_node_config`；`completeTask` 不处理多实例
- To: `deploy()` 读 `wf_node_config.configJson.approval.multiMode`，用 `BpmnXMLConverter` 改写 XML 注入 `multiInstanceLoopCharacteristics`；审批人集合通过流程变量 `approverList` 注入
- Reason: 配置需在运行时生效，spike 验证 MI 原生路线可行
- Impact: 非破坏性，已部署流程不受影响，新部署走改写逻辑

**驳回到发起人节点**
- From: 无驳回接口
- To: `POST /tasks/{id}/reject`，用 `changeActivityState.moveActivityIdTo` 回退到 start 后第一个 userTask；单实例 + MI 节点均支持（MI 整体回退）
- Reason: 审批退回是核心流程能力
- Impact: 新增接口，非破坏

**转办（transfer）**
- From: 只有 `delegate`（委派，owner 保留，完成后回到原审批人）
- To: 新增 `POST /tasks/{id}/transfer`，`setAssignee` + `wf_task_transfer` 审计表；原审批人彻底脱离
- Reason: 转办与委派语义不同，需独立接口
- Impact: 新增接口 + 新增表

**流程变量管理**
- From: 变量只能在 `completeTask` 时传
- To: 新增实例级变量 CRUD 接口（`GET/POST/DELETE /process-instances/{id}/variables`）
- Reason: PRD 3.3.1 要求流程变量管理
- Impact: 新增接口，非破坏

**流程图高亮跟踪**
- From: 无高亮接口
- To: `GET /process-instances/{id}/highlight`，返回 bpmnXml + activity 状态列表 + sequenceFlow 状态列表
- Reason: PRD 3.3.1 要求流程图高亮跟踪
- Impact: 新增接口，非破坏

**complete 返回值扩展**
- From: `POST /tasks/{id}/complete` 返回 `R<Void>`
- To: 返回 `R<CompleteTaskResponse>`（nodeCompleted/remaining/processAdvanced）
- Reason: 会签场景需即时反馈"还剩几人"
- Impact: 破坏性（返回值类型变化），但当前无外部消费方，前端同步改

## Capabilities

### New Capabilities
- `multi-instance-approval`: 会签/或签运行时——部署时 BPMN XML 改写注入 MI 元素，审批人集合通过流程变量注入
- `task-reject`: 任务驳回到发起人节点——changeActivityState 路线，单实例 + MI 整体回退
- `task-transfer`: 任务转办——setAssignee + 审计表，区别于委派
- `process-variable-management`: 流程变量实例级 CRUD
- `process-diagram-highlight`: 流程图高亮跟踪——后端返回状态数据，前端 bpmn-js 渲染

### Modified Capabilities
- `task-completion`: complete 返回值从 Void 扩展为 CompleteTaskResponse（nodeCompleted/remaining/processAdvanced）

## Impact

**代码影响**：
- `ProcessDesignService.deploy()` — 新增 BPMN XML 改写逻辑（读 wf_node_config，注入 MI）
- `WorkflowTaskService` — 新增 reject/transfer 方法，completeTask 返回值扩展
- `TaskController` — 新增 reject/transfer 端点，complete 返回值变化
- `ProcessInstanceController` — 新增 variables/highlight 端点

**数据库**：
- 新增 `wf_task_transfer` 表（Flyway 迁移）

**API**：
- 新增 7 个端点
- 1 个端点返回值变化（complete）

**依赖**：
- 无新增第三方依赖，复用 Flowable 8 原生 API

**前端**：
- `complete` 接口消费方需适配新返回值
- 流程图高亮需前端 bpmn-js 渲染逻辑（本期后端只提供数据）
