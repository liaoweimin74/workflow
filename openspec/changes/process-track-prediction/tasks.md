## 1. 后端：ProcessTaskPredictionService

- [ ] 1.1 创建 `ProcessTaskPredictionService`，注入 `HistoryService`、`RuntimeService`、`RepositoryService`
- [ ] 1.2 实现 `getPrediction(processInstanceId)` 方法，返回 `List<ExecutionNodeVO>`
- [ ] 1.3 实现已执行节点查询：从 `HistoricActivityInstance` 获取已完成的 userTask 节点，合并 `TaskComment` 的审批信息
- [ ] 1.4 实现当前活跃节点查询：从 `RuntimeService.getActivityInstances()` 获取当前活跃节点
- [ ] 1.5 实现 BPMN 拓扑遍历方法 `traversePrediction(bpmnModel, activeNodeId)`
- [ ] 1.6 创建 `ExecutionNodeVO` DTO（activityId, activityName, type, status, assigneeName, endTime, action, comment, hasBranch, lineType）
- [ ] 1.7 编写单元测试 `ProcessTaskPredictionServiceTest`

## 2. 后端：API 接口

- [ ] 2.1 `ProcessInstanceController` 新增 `GET /{id}/prediction` 端点
- [ ] 2.2 编写 Controller 测试 `ProcessInstanceControllerTest`

## 3. 前端：ProcessTaskExecutionList 组件

- [ ] 3.1 创建 `ProcessTaskExecutionList.vue`，表格展示执行节点列表
- [ ] 3.2 实现状态列：已执行（绿色标签）、进行中（蓝色标签）、待执行（灰色标签）
- [ ] 3.3 实现连线列：实线箭头（→）、虚线箭头（⇢）
- [ ] 3.4 实现动作列：通过（绿）、驳回（红）、转办（橙）、委派（紫）
- [ ] 3.5 导出组件并注册到 `components/business/index.ts`

## 4. 前端：API 和页面整合

- [ ] 4.1 `processInstanceApi` 新增 `prediction(id)` 方法
- [ ] 4.2 修改 `ProcessInstanceTrackPage.vue`，加载 prediction 数据
- [ ] 4.3 替换"审批记录"卡片为"执行记录"卡片，审批记录时间线折叠收起
- [ ] 4.4 前端编译验证

## 5. 集成测试

- [ ] 5.1 端到端测试：启动流程 → 完成一个任务 → 验证 prediction 接口返回正确
- [ ] 5.2 验证已结束实例的 prediction 返回空预测列表