## 1. 数据库迁移

- [x] 1.1 创建 `wf_task_transfer` 表 Flyway 迁移脚本（id, tenant_id, task_id, process_instance_id, from_user, to_user, reason, created_at）
- [x] 1.2 创建 `WfTaskTransfer` JPA 实体 + `WfTaskTransferRepository`

## 2. 会签或签 — BPMN XML 改写

- [x] 2.1 创建 `MultiInstanceBpmnRewriter` 服务：读 `wf_node_config.configJson.approval.multiMode`，用 `BpmnXMLConverter` 解析 BPMN，注入 `multiInstanceLoopCharacteristics`（collection/elementVariable/assignee/completionCondition）
- [x] 2.2 修改 `ProcessDesignService.deploy()`：部署前调 `MultiInstanceBpmnRewriter.rewrite()`，原始 XML 仍存 `wf_process_drafts.bpmnXml`
- [x] 2.3 审批人集合注入：部署时从 `approval.userIds` 提取，作为 `approverList` 默认值写入流程变量（确认 Flowable 流程变量默认值机制）

## 3. 驳回（changeActivityState）

- [x] 3.1 创建 `RejectService.reject(taskId)`：查当前 task 的 activityId → 识别发起人节点 activityId → `moveActivityIdTo` → 校验 `allowReject` 权限
- [x] 3.2 创建 `InitiatorNodeResolver`：解析 BPMN 模型，找 startEvent outgoing 指向的第一个 userTask
- [x] 3.3 `TaskController` 新增 `POST /tasks/{id}/reject` 端点

## 4. 转办（transfer）

- [x] 4.1 创建 `WorkflowTaskService.transfer(taskId, toUser, reason)`：`setAssignee` + 清空 owner + 写 `wf_task_transfer` 审计表 + 校验 `allowTransfer` 权限
- [x] 4.2 `TaskController` 新增 `POST /tasks/{id}/transfer` 端点

## 5. 流程变量管理

- [x] 5.1 创建 `ProcessVariableService`：getVariables/getVariable/setVariables/removeVariable（封装 `runtimeService`）
- [x] 5.2 `ProcessInstanceController` 新增变量 CRUD 端点（GET/POST/DELETE）

## 6. 流程图高亮

- [x] 6.1 创建 `ProcessHighlightService`：返回 bpmnXml + activities[]（COMPLETED/ACTIVE/PENDING） + sequenceFlows[]（TRAVERSED/UNTRAVERSED）
- [x] 6.2 `ProcessInstanceController` 新增 `GET /process-instances/{id}/highlight` 端点

## 7. complete 返回值扩展

- [x] 7.1 创建 `CompleteTaskResponse` DTO（nodeCompleted/remaining/processAdvanced）
- [x] 7.2 修改 `WorkflowTaskService.completeTask()` 返回 `CompleteTaskResponse`：complete 后查同 activityId 的剩余任务数
- [x] 7.3 修改 `TaskController.complete()` 返回 `R<CompleteTaskResponse>`

## 8. 测试

- [x] 8.1 `MultiInstanceBpmnRewriterTest`：验证 countersign/or_sign/无 multiMode 三种场景的 XML 改写
- [x] 8.2 `RejectServiceTest`：单实例驳回 + MI 驳回（复用 spike 测试模式）
- [x] 8.3 `TransferServiceTest`：转办后 assignee 变更 + 审计表记录
- [x] 8.4 `ProcessVariableServiceTest`：CRUD 全流程
- [x] 8.5 `ProcessHighlightServiceTest`：COMPLETED/ACTIVE/PENDING 状态计算
- [x] 8.6 `CompleteTaskResponseTest`：单实例/会签部分完成/会签全部完成/或签 返回值
- [x] 8.7 集成测试：完整流程（部署含会签 → 启动 → 部分完成 → 驳回 → 重新提交 → 完成）
