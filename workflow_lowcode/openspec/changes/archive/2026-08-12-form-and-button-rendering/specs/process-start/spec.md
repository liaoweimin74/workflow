# process-start Delta

## MODIFIED Requirements

### Requirement: 发起表单渲染

发起页面 SHALL 渲染流程定义关联的表单。表单字段权限从发起人节点（第一个 userTask）的 NodeConfig 解析，若发起人节点未配置表单则使用流程默认表单的 fieldPermissions。字段权限通过 DeployedProcessDefinition 响应的 `fieldPermissions` 字段传递给 FormRenderer。无关联表单的流程 SHALL 直接展示流程信息与"确认发起"按钮。

#### Scenario: 有关联表单的流程

- **WHEN** 流程定义关联了表单（DeployedProcessDefinition.formDefId 不为空）
- **THEN** 系统 SHALL 渲染 FormRenderer 组件
- **AND** 将 DeployedProcessDefinition.fieldPermissions 传递给 FormRenderer
- **AND** FormRenderer 按字段权限控制每个字段的编辑/只读/隐藏
- **AND** 操作区展示"提交"与"取消"按钮

#### Scenario: 无关联表单的流程

- **WHEN** 流程定义未关联表单
- **THEN** 系统 SHALL 展示流程信息 + "确认发起"按钮，无需填写表单

#### Scenario: 发起表单无字段权限配置

- **WHEN** DeployedProcessDefinition.fieldPermissions 为 null 或空对象
- **THEN** FormRenderer SHALL 视所有字段为可编辑（EDIT）

## ADDED Requirements

### Requirement: 发起页接口返回字段权限

`GET /api/v1/deployed-processes/{id}` 响 SHALL 新增 `fieldPermissions` 字段（`Map<String, String>`）。

字段权限来源：
1. 优先从发起人节点（BPMN 中第一个 userTask）的 NodeConfig 解析 `form.fieldPermissions`
2. 发起人节点未配置表单时，从流程级配置（`__PROCESS__`）的 `form.fieldPermissions` 取
3. 均未配置时为 null

表单和字段权限 SHALL 作为整体从同一层取（同 extractFormConfig 逻辑）。

#### Scenario: 发起人节点配置了表单和字段权限

- **WHEN** 发起人节点 NodeConfig 含 form.formDefId 和 form.fieldPermissions
- **THEN** DeployedProcessDefinition.formDefId SHALL 为发起人节点的 formDefId
- **AND** DeployedProcessDefinition.fieldPermissions SHALL 为发起人节点的 fieldPermissions

#### Scenario: 发起人节点未配置表单，流程有默认表单

- **WHEN** 发起人节点 NodeConfig 的 form.formDefId 为空
- **AND** 流程级 NodeConfig（`__PROCESS__`）含 form.formDefId
- **THEN** DeployedProcessDefinition.formDefId SHALL 为流程级 formDefId
- **AND** DeployedProcessDefinition.fieldPermissions SHALL 为流程级 fieldPermissions

#### Scenario: 均未配置表单

- **WHEN** 发起人节点和流程级均未配置表单
- **THEN** DeployedProcessDefinition.formDefId SHALL 为 null
- **AND** DeployedProcessDefinition.fieldPermissions SHALL 为 null
