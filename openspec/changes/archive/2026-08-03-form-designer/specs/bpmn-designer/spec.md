## MODIFIED Requirements

### Requirement: 节点属性配置

设计器 SHALL 支持配置选中节点的属性，属性面板按节点类型动态展示对应配置项。

选中节点时，属性面板 SHALL 显示该节点类型的属性编辑组件。属性面板 SHALL 支持以下节点类型的属性配置：

**开始事件：** 名称（必填）、描述（可选）、关联表单（可选，从已发布表单定义中选择）
**用户任务：** 名称（必填）、描述（可选）、审批人设置、关联表单（可选，从已发布表单定义中选择）、表单字段权限
**网关（排他/并行/包含）：** 名称（必填）、默认流转
**结束事件：** 名称（必填）
**连线：** 条件表达式（可选）、描述（可选）

关联表单选择器 SHALL 从已发布（PUBLISHED）的表单定义列表中选择。

表单字段权限 SHALL 在关联表单后显示，支持对表单中每个字段设置权限（EDIT/VIEW/HIDDEN）。

属性面板中修改的值 SHALL 实时更新到 designerStore，不直接操作 bpmn-js 模型。

#### Scenario: 选中节点显示属性
WHEN 用户点击 Canvas 上的用户任务节点
THEN 右侧属性面板显示"基本信息"、"审批人设置"和"表单" Tab

#### Scenario: 修改节点名称
WHEN 用户在属性面板中修改节点名称
THEN designerStore 中对应 nodeConfig 更新
AND 流程图节点上的显示名称同步更新

#### Scenario: 配置审批人
WHEN 用户在用户任务的"审批人设置"中选择审批人类型为"指定用户"
AND 选择具体用户
AND 选择多人审批方式为"会签"
THEN designerStore 中存储对应的审批人配置

#### Scenario: 关联表单
WHEN 用户在用户任务的"表单" Tab 中点击关联表单下拉框
THEN 系统从后端加载已发布的表单定义列表
AND 用户选择一个表单定义
THEN designerStore 中 nodeConfig.form.formDefId 更新为所选表单定义的 id

#### Scenario: 配置字段权限
WHEN 用户为用户任务关联表单后
THEN 属性面板显示该表单的所有字段列表
AND 每个字段可设置权限为 EDIT、VIEW 或 HIDDEN
AND designerStore 中 nodeConfig.form.fieldPermissions 更新

#### Scenario: 开始事件关联表单
WHEN 用户在开始事件的属性面板中关联表单
THEN designerStore 中开始节点的 nodeConfig.form.formDefId 更新
AND 该表单作为流程级默认表单
