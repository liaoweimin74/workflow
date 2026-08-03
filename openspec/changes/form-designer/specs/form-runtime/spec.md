## ADDED Requirements

### Requirement: 表单运行时渲染

系统 SHALL 提供 FormRenderer.vue 组件，封装 form-create 渲染器，用于在流程运行时渲染表单。

FormRenderer SHALL 接收 formDefId 参数，从后端加载已发布版本的 schema。

FormRenderer SHALL 接收 processInstanceId 和 taskId 参数，从后端加载已保存的表单数据。

FormRenderer SHALL 支持 v-model 双向绑定表单数据。

FormRenderer SHALL 使用 @form-create/element-ui 渲染器渲染表单。

#### Scenario: 加载表单定义
- **WHEN** FormRenderer 组件接收 formDefId 参数
- **THEN** 组件调用 GET /api/v1/form-definitions/{id} 获取已发布版本的 schema
- **AND** 使用 form-create 渲染 schema

#### Scenario: 加载已有表单数据
- **WHEN** FormRenderer 组件接收 processInstanceId 参数
- **AND** 该流程实例已有保存的表单数据
- **THEN** 组件调用 GET /api/v1/form-data 获取数据
- **AND** 将数据填充到表单字段中

#### Scenario: 新流程实例无表单数据
- **WHEN** FormRenderer 组件接收 processInstanceId 参数
- **AND** 该流程实例无保存的表单数据
- **THEN** 表单字段显示为空（或 schema 中配置的默认值）

### Requirement: 字段权限控制

FormRenderer SHALL 根据字段权限控制表单字段的渲染状态。

字段权限值 SHALL 为以下之一：EDIT（可编辑）、VIEW（只读）、HIDDEN（隐藏）。

权限优先级 SHALL 为：流程节点 fieldPermissions > 表单定义默认权限 > EDIT（兜底）。

FormRenderer SHALL 在渲染前合并权限配置，将权限注入 form-create 的 option 或 rule 中：
- EDIT：字段正常渲染，可编辑
- VIEW：字段渲染为只读（disabled）
- HIDDEN：字段不渲染

#### Scenario: 节点级权限覆盖表单默认权限
- **WHEN** 表单定义中字段"事由"的默认权限为 EDIT
- **AND** 流程节点的 fieldPermissions 中"事由"设置为 VIEW
- **THEN** FormRenderer 渲染"事由"字段为只读

#### Scenario: 无节点级权限时使用表单默认权限
- **WHEN** 表单定义中字段"附件"的默认权限为 HIDDEN
- **AND** 流程节点未配置 fieldPermissions
- **THEN** FormRenderer 不渲染"附件"字段

#### Scenario: 无任何权限配置时默认可编辑
- **WHEN** 表单定义中字段"备注"未配置默认权限
- **AND** 流程节点未配置 fieldPermissions
- **THEN** FormRenderer 渲染"备注"字段为可编辑

### Requirement: 表单数据提交

FormRenderer SHALL 支持表单数据的保存和提交。

用户点击提交按钮时，FormRenderer SHALL 调用 POST /api/v1/form-data 保存表单数据，包含 formDefId、processInstanceId、taskId、data_json。

#### Scenario: 保存表单数据
- **WHEN** 用户填写完表单并点击提交
- **THEN** FormRenderer 调用 POST /api/v1/form-data
- **AND** 请求体包含 formDefId、processInstanceId、data_json
- **AND** 后端持久化到 wf_form_data 表

#### Scenario: 更新已有表单数据
- **WHEN** 用户修改已有表单数据并点击保存
- **THEN** FormRenderer 调用 PUT /api/v1/form-data/{id}
- **AND** 后端更新 data_json 字段

### Requirement: 替换自研 FormBuilder

系统 SHALL 使用 FormRenderer 替换自研 FormBuilder.vue 组件。

自研 FormBuilder.vue SHALL 标记为 deprecated，保留但不新增使用。

新表单场景 SHALL 全部使用 FormRenderer。

#### Scenario: 新表单使用 FormRenderer
- **WHEN** 开发者在新页面中需要表单渲染
- **THEN** 使用 FormRenderer 组件
- **AND** 不使用 FormBuilder.vue

#### Scenario: 旧页面保留 FormBuilder
- **WHEN** 已有页面使用 FormBuilder.vue
- **THEN** 本期不强制迁移
- **AND** FormBuilder.vue 保持可用
