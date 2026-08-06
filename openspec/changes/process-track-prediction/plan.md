# 流程执行跟踪与预测 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 在流程跟踪页面新增任务执行列表，展示已执行节点和预测的后续节点，实现 BPMN 拓扑遍历引擎

**Architecture:**
- 后端新增 `ProcessTaskPredictionService`，通过 `BpmnModel` 解析 BPMN 拓扑，从当前活跃节点出发沿出线遍历，无条件连线直接走，有条件连线停止
- 新增 `GET /{id}/prediction` 接口返回 `ExecutionNodeVO` 列表
- 前端新增 `ProcessTaskExecutionList` 组件，表格展示已执行/预测节点，审批记录时间线改为折叠区域

**Tech Stack:** Spring Boot + Flowable + BpmnModel + Vue 3 + Element Plus

---

## Task 1: ExecutionNodeVO DTO

- [ ] **Step 1:** 创建 `ExecutionNodeVO` 类，字段：activityId, activityName, type, status, assigneeName, endTime, action, comment, hasBranch, lineType
- [ ] **Step 2:** 创建 `ProcessPredictionVO` 类，包含 `List<ExecutionNodeVO> nodes` 作为响应体

## Task 2: ProcessTaskPredictionService

- [ ] **Step 1:** 创建 `ProcessTaskPredictionService`，注入 `HistoryService`、`RuntimeService`、`RepositoryService`
- [ ] **Step 2:** 实现 `getHistoryNodes()`：从 `HistoricActivityInstance` 获取已完成的 userTask，合并 `TaskComment` 的审批意见和动作
- [ ] **Step 3:** 实现 `getActiveNodes()`：从 `RuntimeService.getActivityInstances()` 获取当前活跃节点
- [ ] **Step 4:** 实现 `traversePrediction()`：从 `BpmnModel` 获取流程定义，从当前活跃节点出发沿出线递归遍历；无条件连线继续，有条件连线停止，到达 endEvent 停止
- [ ] **Step 5:** 实现 `getPrediction(processInstanceId)`：合并历史节点、活跃节点、预测节点，按时间+拓扑排序

## Task 3: API 接口

- [ ] **Step 1:** `ProcessInstanceController` 新增 `GET /{id}/prediction` 端点，调用 `ProcessTaskPredictionService.getPrediction()`
- [ ] **Step 2:** 编写 Controller 测试

## Task 4: ProcessTaskExecutionList 组件

- [ ] **Step 1:** 创建 `ProcessTaskExecutionList.vue`，表格列：状态、节点名称、连线、办理人、办理时间、动作、意见
- [ ] **Step 2:** 实现状态标签（已完成/进行中/待执行）和动作标签（通过/驳回/转办/委派）
- [ ] **Step 3:** 实现连线列，实线箭头（→）和虚线箭头（⇢）
- [ ] **Step 4:** 导出组件到 `components/business/index.ts`

## Task 5: 页面整合

- [ ] **Step 1:** `processInstanceApi` 新增 `prediction(id)` 方法，添加 `ExecutionNodeVO` 前端类型
- [ ] **Step 2:** 修改 `ProcessInstanceTrackPage.vue`：加载 prediction 数据，替换审批记录卡片为执行记录卡片
- [ ] **Step 3:** 审批记录时间线改为折叠区域（el-collapse），默认收起
- [ ] **Step 4:** 前端编译验证

## Task 6: 测试

- [ ] **Step 1:** 编写 `ProcessTaskPredictionServiceTest`（Mock BpmnModel，验证无条件/有条件连线遍历）
- [ ] **Step 2:** 运行所有测试，确保 0 失败