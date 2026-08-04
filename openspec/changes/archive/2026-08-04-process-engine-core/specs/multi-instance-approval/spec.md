## ADDED Requirements

### Requirement: 会签或签 BPMN XML 改写

部署流程时，系统 SHALL 读取 `wf_node_config.configJson.approval.multiMode`，当值为 `countersign` 或 `or_sign` 时，用 `BpmnXMLConverter` 解析 BPMN XML 并在对应 userTask 上注入 `multiInstanceLoopCharacteristics` 元素。

改写后的 BPMN XML SHALL 包含：
- `isSequential="false"`（并行多实例）
- `flowable:collection="${approverList}"`（审批人集合变量）
- `flowable:elementVariable="approver"`（单实例变量名）
- `flowable:assignee="${approver}"`（assignee 绑定到 elementVariable）
- `completionCondition`：
  - `countersign` → `${nrOfCompletedInstances == nrOfInstances}`
  - `or_sign` → `${nrOfCompletedInstances >= 1}`

#### Scenario: 会签节点部署后 BPMN XML 含 MI 元素

WHEN 用户部署一个含 `multiMode=countersign` 配置的流程
THEN Flowable 部署的 BPMN XML 中对应 userTask SHALL 包含 `multiInstanceLoopCharacteristics isSequential="false"`
AND `completionCondition` SHALL 为 `${nrOfCompletedInstances == nrOfInstances}`
AND `flowable:collection` SHALL 为 `${approverList}`
AND `flowable:assignee` SHALL 为 `${approver}`

#### Scenario: 或签节点部署后 completionCondition 为任一完成

WHEN 用户部署一个含 `multiMode=or_sign` 配置的流程
THEN `completionCondition` SHALL 为 `${nrOfCompletedInstances >= 1}`

#### Scenario: 无 multiMode 配置时不注入 MI

WHEN 用户部署一个 `wf_node_config` 不含 `approval.multiMode` 的流程
THEN BPMN XML SHALL 保持原样，不注入 `multiInstanceLoopCharacteristics`

### Requirement: 审批人集合注入

部署时系统 SHALL 从 `wf_node_config.configJson.approval.userIds` 提取审批人 ID 列表，作为 `approverList` 流程变量的默认值注入。

WHEN `approval.type=user` 且 `approval.userIds` 非空
THEN 部署的流程定义 SHALL 包含 `approverList` 默认值
AND 流程启动时若调用方传入 `approverList` 变量，SHALL 覆盖默认值

#### Scenario: 部署时注入审批人集合默认值

WHEN 用户部署一个 `approval.type=user` 且 `approval.userIds=["alice","bob"]` 的流程
THEN 流程定义 SHALL 包含 `approverList` 默认值 `["alice","bob"]`
AND 流程启动后 `approverList` 变量 SHALL 为 `["alice","bob"]`

#### Scenario: 启动时传入 approverList 覆盖默认值

WHEN 用户启动流程实例时传入 `approverList=["charlie","dave"]`
THEN 运行时 `approverList` 变量 SHALL 为 `["charlie","dave"]`
AND 部署时的默认值 SHALL 被覆盖

### Requirement: 会签运行时行为

会签节点的所有 MI 实例都 complete 后，流程 SHALL 前进到下一节点。每个实例的 assignee SHALL 为 `approverList` 中对应元素。

#### Scenario: 3 人会签全部完成才前进

WHEN approverList = [alice, bob, carol] 的会签节点启动
THEN 系统 SHALL 创建 3 个并行任务，assignee 分别为 alice/bob/carol
WHEN alice complete 自己的任务
THEN 流程 SHALL NOT 前进，剩余 2 个任务
WHEN bob 和 carol 也 complete
THEN 流程 SHALL 前进到下一节点

### Requirement: 或签运行时行为

或签节点的任一 MI 实例 complete 后，`completionCondition` SHALL 触发，其余未完成实例 SHALL 被引擎自动删除，流程 SHALL 前进到下一节点。

#### Scenario: 或签第一个完成后其余自动取消

WHEN approverList = [alice, bob, carol] 的或签节点启动
THEN 系统 SHALL 创建 3 个并行任务
WHEN alice complete 自己的任务
THEN 流程 SHALL 前进到下一节点
AND bob 和 carol 的任务 SHALL 从 ACT_RU_TASK 中消失
