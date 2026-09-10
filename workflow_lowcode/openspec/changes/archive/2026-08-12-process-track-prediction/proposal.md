## Why

当前流程跟踪页面只能展示流程图高亮和审批记录时间线，用户无法在一个视图中同时看到"已经执行了哪些任务、谁做的、结果如何"以及"接下来会走到哪"。用户需要切换到不同页面或反复查看才能理解流程执行全貌，体验割裂。本次变更填补这一空白，通过 BPMN 拓扑遍历引擎预测后续执行路径，将已执行节点和预测节点统一展示在任务执行列表中。

## What Changes

**流程跟踪页面 — 任务执行记录**
- From: 只展示流程图高亮 + 底部审批记录时间线
- To: 流程图下方新增"执行记录"表格，展示已执行节点和预测的后续节点，审批记录时间线折叠在卡片内
- Reason: 用户需要在一个视图中看到流程执行全貌
- Impact: 非破坏性，新增功能不影响现有页面

**后端 — 新增预测 API**
- From: 无
- To: 新增 `GET /api/v1/process-instances/{id}/prediction` 接口，返回已执行 + 预测节点列表
- Reason: 前端需要后端提供 BPMN 拓扑遍历结果
- Impact: 非破坏性，新增接口

## Capabilities

### New Capabilities
- `process-prediction`: 流程执行预测引擎，通过 BPMN 拓扑遍历从当前活跃节点出发预测后续路径，支持已执行节点和预测节点的统一列表返回

### Modified Capabilities
- (无)

## Impact

- **新增后端服务**：`ProcessTaskPredictionService`，约 200 行
- **新增后端接口**：`ProcessInstanceController` 新增 `GET /{id}/prediction`
- **新增前端组件**：`ProcessTaskExecutionList.vue`
- **修改前端页面**：`ProcessInstanceTrackPage.vue`，替换审批记录卡片为执行记录卡片
- **新增前端 API**：`processInstanceApi.prediction()`
- **依赖**：`bpmn-js` 模型解析（已有），Flowable `BpmnModel`（已有）