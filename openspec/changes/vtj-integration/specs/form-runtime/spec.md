# form-runtime Delta Spec

## MODIFIED Requirements

### Requirement: 表单运行时渲染

系统 SHALL 提供 FormRenderer.vue 组件，封装 @vtj/renderer 渲染器，用于渲染表单。

FormRenderer SHALL 支持以下渲染模式：
1. **formDefId 模式**：通过 FormDefinition ID 从后端加载 VTJ DSL（用于流程表单）
2. **rule 模式**：直接接收 VTJ DSL 对象渲染（用于需要直接传入 DSL 的场景）

当接收 `formDefId` 参数时，FormRenderer SHALL 调用 `GET /api/v1/form-definitions/{id}` 加载表单定义，解析 schema 字段为 VTJ DSL。

FormRenderer SHALL 接收 `initialValues` prop，用于预填充表单数据。

FormRenderer SHALL 接收 processInstanceId 和 taskId 参数，从后端加载已保存的表单数据。

FormRenderer SHALL 支持 v-model 双向绑定表单数据。

FormRenderer SHALL 使用 @vtj/renderer 的 Renderer 组件渲染 VTJ DSL。

FormRenderer SHALL 暴露 `getFormData()` 方法供父组件获取表单数据。

#### Scenario: 通过 formDefId 加载表单（流程表单）

- **WHEN** FormRenderer 组件接收 formDefId 参数
- **THEN** 组件调用 GET /api/v1/form-definitions/{id} 获取表单定义
- **AND** 解析 schema 字段为 VTJ DSL
- **AND** 使用 @vtj/renderer 渲染 DSL

#### Scenario: CRUD 表单编辑预填充

- **WHEN** FormRenderer 组件接收 initialValues 参数
- **THEN** 组件将 initialValues 填充到表单字段中

#### Scenario: CRUD 表单提交获取数据

- **WHEN** 父组件调用 FormRenderer 的 getFormData() 方法
- **THEN** FormRenderer 返回当前表单数据对象
- **AND** 父组件使用该数据调用业务接口

#### Scenario: 加载已有表单数据

- **WHEN** FormRenderer 组件接收 processInstanceId 参数
- **AND** 该流程实例已有保存的表单数据
- **THEN** 组件调用 GET /api/v1/form-data 获取数据
- **AND** 将数据填充到表单

## MODIFIED Requirements

### Requirement: 字段权限控制

FormRenderer SHALL 根据字段权限控制表单字段的渲染状态。

字段权限值 SHALL 为以下之一：EDIT（可编辑）、VIEW（只读）、HIDDEN（隐藏）。

权限优先级 SHALL 为：流程节点 fieldPermissions > EDIT（兜底）。

FormRenderer SHALL 在渲染前遍历 VTJ DSL 节点树，找到所有 XField 节点，根据 fieldPermissions 设置 XField 的 props：
- EDIT：字段正常渲染，可编辑
- VIEW：字段渲染为只读（XField disabled prop 设为 true）
- HIDDEN：字段不渲染（XField visible prop 设为 false）

#### Scenario: 节点级权限控制字段只读
- **WHEN** 流程节点的 fieldPermissions 中"事由"设置为 VIEW
- **THEN** FormRenderer 遍历 DSL 找到 name 为"事由"的 XField 节点
- **AND** 设置该节点 disabled prop 为 true
- **AND** renderer 渲染该字段为只读

#### Scenario: 节点级权限控制字段隐藏
- **WHEN** 流程节点的 fieldPermissions 中"附件"设置为 HIDDEN
- **THEN** FormRenderer 遍历 DSL 找到 name 为"附件"的 XField 节点
- **AND** 设置该节点 visible prop 为 false
- **AND** renderer 不渲染该字段

#### Scenario: 无权限配置时默认可编辑
- **WHEN** 流程节点未配置 fieldPermissions
- **THEN** 所有 XField 字段正常渲染为可编辑

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: 替换自研 FormBuilder

**Reason**: FormBuilder.vue 已在之前的迭代中废弃，此 requirement 不再需要。

**Migration**: 无需迁移，FormBuilder.vue 已不再使用。
