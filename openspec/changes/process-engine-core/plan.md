# Process Engine Core Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 让会签/或签/驳回/转办/变量/高亮在运行时真正生效，后端读 wf_node_config 驱动 Flowable。

**Architecture:** 部署时后端用 BpmnXMLConverter 改写 BPMN XML 注入 MI 元素；运行时用 changeActivityState 实现驳回（单实例 + MI 整体回退），setAssignee + 审计表实现转办，runtimeService 实现变量 CRUD，历史表 + 活跃 activityId 实现高亮。complete 返回值扩展返回节点状态。

**Tech Stack:** Flowable 8 BPMN MI 原生、changeActivityState API、Spring Boot 3、JPA/Hibernate、Flyway、H2(test)/MySQL(prod)

---

## Task 1: 数据库迁移 — wf_task_transfer 表

- [ ] **Step 1:** 创建 Flyway 迁移脚本 `V{next}__create_wf_task_transfer.sql`
- [ ] **Step 2:** 创建 `WfTaskTransfer` JPA 实体（字段映射表结构）
- [ ] **Step 3:** 创建 `WfTaskTransferRepository extends JpaRepository`

## Task 2: 会签或签 — BPMN XML 改写

- [ ] **Step 1:** 创建 `MultiInstanceBpmnRewriter` 服务类
- [ ] **Step 2:** 用 `BpmnXMLConverter` 把 XML 字符串解析为 `BpmnModel` 对象
- [ ] **Step 3:** 遍历 userTask，查对应 `wf_node_config`，若有 `multiMode` 则注入 `multiInstanceLoopCharacteristics`
- [ ] **Step 4:** 注入 completionCondition（countersign: `==nrOfInstances`，or_sign: `>=1`）
- [ ] **Step 5:** 注入 `collection="${approverList}"` + `elementVariable="approver"` + `assignee="${approver}"`
- [ ] **Step 6:** 序列化回 XML 字符串
- [ ] **Step 7:** 修改 `ProcessDesignService.deploy()`：部署前调 rewriter，原始 XML 仍存 draft
- [ ] **Step 8:** 编写 `MultiInstanceBpmnRewriterTest`（countersign/or_sign/无 multiMode 三场景）

## Task 3: 驳回（changeActivityState）

- [ ] **Step 1:** 创建 `InitiatorNodeResolver`：用 `RepositoryService.getBpmnModel()` 解析 startEvent outgoing → 第一个 userTask
- [ ] **Step 2:** 创建 `RejectService.reject(taskId)`：查 task → 校验 `allowReject` → `moveActivityIdTo(currentActivityId, initiatorActivityId)`
- [ ] **Step 3:** `TaskController` 新增 `POST /tasks/{id}/reject` 端点
- [ ] **Step 4:** 编写 `RejectServiceTest`（单实例驳回 + MI 驳回，复用 spike 测试模式）

## Task 4: 转办（transfer）

- [ ] **Step 1:** `WorkflowTaskService` 新增 `transfer(taskId, toUser, reason)`：校验 `allowTransfer` → `setAssignee` + 清空 owner → 写 `wf_task_transfer`
- [ ] **Step 2:** `TaskController` 新增 `POST /tasks/{id}/transfer` 端点
- [ ] **Step 3:** 编写 `TransferServiceTest`

## Task 5: 流程变量管理

- [ ] **Step 1:** 创建 `ProcessVariableService`（getVariables/getVariable/setVariables/removeVariable）
- [ ] **Step 2:** `ProcessInstanceController` 新增 4 个变量端点
- [ ] **Step 3:** 编写 `ProcessVariableServiceTest`

## Task 6: 流程图高亮

- [ ] **Step 1:** 创建 `ProcessHighlightService`：查 `ACT_HI_ACTINST` 算 COMPLETED + `getActiveActivityIds` 算 ACTIVE + BPMN 模型全量算 PENDING
- [ ] **Step 2:** sequenceFlow 状态：`ACT_HI_ACTINST` activityType=sequenceFlow 有记录即 TRAVERSED
- [ ] **Step 3:** 返回 bpmnXml + activities[] + sequenceFlows[]
- [ ] **Step 4:** `ProcessInstanceController` 新增 `GET /process-instances/{id}/highlight` 端点
- [ ] **Step 5:** 编写 `ProcessHighlightServiceTest`

## Task 7: complete 返回值扩展

- [ ] **Step 1:** 创建 `CompleteTaskResponse` DTO（nodeCompleted/remaining/processAdvanced）
- [ ] **Step 2:** 修改 `WorkflowTaskService.completeTask()` 返回 `CompleteTaskResponse`：complete 后查同 activityId 剩余任务数
- [ ] **Step 3:** 修改 `TaskController.complete()` 返回 `R<CompleteTaskResponse>`
- [ ] **Step 4:** 编写 `CompleteTaskResponseTest`（单实例/会签部分/会签全部/或签）

## Task 8: 集成测试

- [ ] **Step 1:** 编写端到端集成测试：部署含会签流程 → 启动 → 部分完成 → 驳回 → 重新提交 → 完成
- [ ] **Step 2:** 验证完整流程无报错，状态正确
