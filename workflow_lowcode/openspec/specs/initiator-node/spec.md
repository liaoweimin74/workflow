# initiator-node Specification

## Purpose
TBD - created by archiving change initiator-node-type. Update Purpose after archive.
## Requirements
### Requirement: 发起人节点类型定义

系统 SHALL 通过 BPMN 扩展属性 `wf:nodeRole="initiator"` 标记 UserTask 为发起人节点。发起人节点的 `flowable:assignee` SHALL 自动绑定为 `${initiator}`，且设计者不可编辑。

#### Scenario: 从节点面板拖入发起人节点

- **WHEN** 设计者从节点面板拖入"发起人节点"到画布
- **THEN** 创建的 UserTask 元素 SHALL 具有 `wf:nodeRole="initiator"` 扩展属性
- **AND** 该元素的 `flowable:assignee` SHALL 为 `${initiator}`

#### Scenario: 发起人节点 assignee 不可编辑

- **WHEN** 选中一个 `wf:nodeRole="initiator"` 的发起人节点
- **THEN** 属性面板 SHALL NOT 显示审批人配置、候选用户、会签/或签、操作权限、超时设置
- **AND** 属性面板 SHALL 只显示节点名称、节点描述、表单关联

#### Scenario: 导出 XML 包含扩展属性

- **WHEN** 导出包含发起人节点的 BPMN XML
- **THEN** XML 中对应的 userTask 元素 SHALL 包含 `wf:nodeRole="initiator"` 属性
- **AND** XML SHALL 声明 `xmlns:wf="http://workflow.com/schema/bpmn/wf"` 命名空间

#### Scenario: 导入 XML 保留扩展属性

- **WHEN** 导入包含 `wf:nodeRole="initiator"` 的 BPMN XML
- **THEN** 系统 SHALL 正确解析该属性
- **AND** 选中该节点时属性面板 SHALL 显示精简配置

### Requirement: 发起人节点视觉区分

系统 SHALL 在流程图中对发起人节点进行视觉区分，使用不同于普通 UserTask 的填充色。

#### Scenario: 发起人节点渲染样式

- **WHEN** 画布上存在 `wf:nodeRole="initiator"` 的 UserTask
- **THEN** 该节点 SHALL 以浅蓝色（`#e3f2fd`）填充渲染
- **AND** 普通 UserTask SHALL 保持默认渲染样式

### Requirement: 移除 initiator_self 审批类型

系统 SHALL 从 UserTaskProperty 审批类型选项中移除 `initiator_self`（发起人自选）。

#### Scenario: 审批类型选项不含 initiator_self

- **WHEN** 设计者选中普通 UserTask 并查看审批类型选项
- **THEN** 选项 SHALL 只包含：指定用户、部门负责人、流程表达式
- **AND** 选项 SHALL NOT 包含"发起人自选"

#### Scenario: 已有 initiator_self 配置的兼容处理

- **WHEN** 加载一个已使用 `initiator_self` 审批类型的 UserTask 配置
- **THEN** 系统 SHALL 将该配置视为未配置审批类型（`type: ''`）
- **AND** 系统 SHALL NOT 报错

