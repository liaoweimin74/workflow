## Context

当前流程跟踪页面（ProcessInstanceTrackPage）只展示了 BPMN 流程图的高亮（已完成节点绿色、当前活跃节点蓝色），以及底部一个审批记录时间线。用户无法直观地看到：

1. 已执行节点的完整信息（谁在什么时候做了什么操作、审批结果和意见）
2. 后续将要执行的节点路径

这两个信息分散在流程图的颜色标记和审批记录时间线中，缺乏统一的视图。

## Goals / Non-Goals

**Goals:**
- 在流程跟踪页面新增任务执行列表，展示已执行节点和预测的后续节点
- 后端实现 BPMN 拓扑遍历引擎，预测从当前活跃节点出发的后续路径
- 表格中区分已执行（实线）和预测（虚线）状态
- 保留审批记录时间线，改为可折叠区域

**Non-Goals:**
- 不基于条件表达式评估分支走向（遇到有条件连线即停止）
- 不修改流程图高亮逻辑
- 不修改部署/设计器相关功能

## Decisions

### 1. 后端：ProcessTaskPredictionService

新增服务 `ProcessTaskPredictionService`，负责：

1. **获取已执行活动**：复用 `ProcessHighlightService` 的历史活动查询逻辑
2. **BPMN 拓扑遍历**：使用 `BpmnModel` 解析 XML，从当前活跃节点出发：
   - 获取该节点的出线（outgoing flows）
   - 无条件连线 → 沿着 targetRef 继续遍历
   - 有条件连线 → 停止，标记当前节点为"有分支"
   - 记录遍历路径上的所有节点
3. **组装预测结果**：合并已执行节点和预测节点，每项包含：
   - `activityId`：BPMN 节点 ID
   - `activityName`：BPMN 节点名称
   - `type`：userTask / endEvent / exclusiveGateway 等
   - `status`：completed / active / predicted
   - `assigneeName`：办理人姓名（仅已执行节点）
   - `endTime`：完成时间（仅已执行节点）
   - `action`：审批动作（仅已执行节点，如 complete / reject / transfer）
   - `comment`：审批意见（仅已执行节点）
   - `hasBranch`：是否有分支（当前节点后有条件连线）
   - `lineType`：solid / dashed（实线/虚线）

### 2. 后端：API 接口

新增 `GET /api/v1/process-instances/{id}/prediction` 接口，返回完整的执行预测数据。

### 3. 前端：ProcessTaskExecutionList

新增组件 `ProcessTaskExecutionList`，位于流程图下方，用表格展示：

| 状态 | 节点名称 | 连线 | 办理人 | 办理时间 | 动作 | 意见 |
|------|---------|------|--------|---------|------|------|
| ✅ 已完成 | 发起申请 | → | 王五 | 08-06 08:00 | 提交 | — |
| ✅ 已完成 | 直属上级审批 | → | 李四 | 08-06 09:00 | 通过 | 同意 |
| 🔄 进行中 | 部门审批 | → | 张三 | 08-06 10:30 | — | — |
| ⏳ 待执行 | 人事审批 | ⇢ | — | — | — | — |
| ⏳ 待执行 | 结束 | — | — | — | — | — |

- 连线列用箭头图标表示：实线箭头（→）已完成，虚线箭头（⇢）预测
- 状态列用标签：已完成（绿色）、进行中（蓝色）、待执行（灰色）
- 动作列用标签：通过（绿色）、驳回（红色）、转办（橙色）、委派（紫色）
- 审批记录时间线改为折叠区域，默认收起

### 4. 前端：ProcessInstanceTrackPage 修改

- 新增 `processInstanceApi.prediction()` 调用
- 将"审批记录"卡片改为"执行记录"卡片，包含新表格
- 审批记录时间线折叠在"执行记录"卡片内

## Risks / Trade-offs

1. **并行网关**：多个活跃节点同时存在时，表格按当前活跃节点的出线分别遍历，表格行按时间倒序排列（已执行节点）后接预测节点（按拓扑顺序）
2. **默认流**：排他网关的 `default` 属性在本次设计中视为有条件连线，不遍历
3. **已结束实例**：已结束的实例没有活跃节点，预测列表为空，只展示已执行节点
4. **BPMN 模型解析开销**：每次请求都需要从 RepositoryService 获取 BpmnModel，建议加内存缓存