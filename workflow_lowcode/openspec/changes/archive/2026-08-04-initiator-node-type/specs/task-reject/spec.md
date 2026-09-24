## MODIFIED Requirements

### Requirement: 发起人节点自动识别

系统 SHALL 通过解析 BPMN 模型自动识别发起人节点：优先查找 `wf:nodeRole="initiator"` 的 UserTask，找不到时回退到 `startEvent` 的 `outgoing` sequenceFlow 指向的第一个 `userTask`。

#### Scenario: 线性流程发起人识别

- **WHEN** 流程结构为 start → fillForm → managerApproval → end
- **AND** fillForm 节点具有 `wf:nodeRole="initiator"` 属性
- **THEN** 系统识别的发起人节点 SHALL 为 `fillForm`

#### Scenario: 无 nodeRole 标记时回退到第一个 UserTask

- **WHEN** 流程结构为 start → fillForm → managerApproval → end
- **AND** fillForm 节点没有 `wf:nodeRole` 属性
- **THEN** 系统识别的发起人节点 SHALL 为 `fillForm`（第一个 UserTask）

#### Scenario: 多个 nodeRole=initiator 时取第一个

- **WHEN** 流程中有多个 `wf:nodeRole="initiator"` 的 UserTask
- **THEN** 系统 SHALL 取 BPMN 模型中第一个匹配的节点作为发起人节点
