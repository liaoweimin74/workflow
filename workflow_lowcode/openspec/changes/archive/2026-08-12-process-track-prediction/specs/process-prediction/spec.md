## ADDED Requirements

### Requirement: 流程执行预测服务 SHALL 提供从当前活跃节点出发的后续路径遍历

流程执行预测服务 `ProcessTaskPredictionService` SHALL 从当前活跃节点出发，沿 BPMN 出线遍历后续节点，并按规则停止于有条件连线。

#### Scenario: 无条件连线直接遍历
- **WHEN** 当前节点有一条或多条无条件连线（出线）
- **THEN** 遍历引擎 SHALL 沿每条无条件连线的 targetRef 继续遍历，并将目标节点标记为 `predicted`

#### Scenario: 有条件连线停止遍历
- **WHEN** 当前节点的一条出线包含 conditionExpression
- **THEN** 遍历引擎 SHALL 停止沿该连线遍历，并将当前节点标记为 `hasBranch: true`

#### Scenario: 遍历到结束事件
- **WHEN** 遍历到达 endEvent 节点
- **THEN** 遍历引擎 SHALL 将该节点标记为 `predicted` 并停止沿该路径继续遍历

#### Scenario: 并行网关处理
- **WHEN** 当前节点是并行网关（parallelGateway）
- **THEN** 遍历引擎 SHALL 沿所有出线分别遍历，每个分支独立执行停止规则

### Requirement: 流程执行预测 API SHALL 返回完整的执行预测列表

新增 `GET /api/v1/process-instances/{id}/prediction` 接口，该接口 SHALL 返回已执行节点和预测节点的合并列表。

#### Scenario: 运行中实例返回完整列表
- **WHEN** 调用 prediction 接口，实例正在运行中
- **THEN** 返回结果 SHALL 包含：已执行完成节点（status=completed）、当前活跃节点（status=active）、预测节点（status=predicted），每个节点包含 activityId、activityName、type、status、lineType（solid/dashed）

#### Scenario: 已结束实例只返回已执行节点
- **WHEN** 调用 prediction 接口，实例已结束
- **THEN** 返回结果 SHALL 只包含已执行节点（status=completed），预测列表为空

### Requirement: 前端任务执行列表 SHALL 展示已执行和预测节点

前端新增 `ProcessTaskExecutionList` 组件，该组件 SHALL 在流程图下方以表格形式展示执行预测结果。

#### Scenario: 展示已完成节点带审批信息
- **WHEN** 行为 completed 的节点有 assigneeName、endTime、action、comment 值
- **THEN** 表格 SHALL 显示这些字段，动作列用颜色标签区分（通过=绿色、驳回=红色、转办=橙色、委派=紫色）

#### Scenario: 展示预测节点不显示审批信息
- **WHEN** 行为 predicted 的节点
- **THEN** 表格 SHALL 在办理人、办理时间、动作、意见列显示"—"，状态列显示"待执行"

#### Scenario: 连线列区分实线和虚线
- **WHEN** lineType 为 solid
- **THEN** 连线列 SHALL 显示实线箭头（→）
- **WHEN** lineType 为 dashed
- **THEN** 连线列 SHALL 显示虚线箭头（⇢）