# form-runtime Specification

## Purpose
TBD - created by archiving change form-designer. Update Purpose after archive.
## Requirements
### Requirement: 表单运行时渲染

系统 SHALL 提供 FormRenderer.vue 组件，封装 form-create 渲染器，用于渲染表单。

FormRenderer SHALL 支持两种渲染模式：
1. **formDefId 模式**：通过 FormDefinition ID 从后端加载 schema（用于流程表单）
2. **rule 模式**：直接接收 form-create rule 数组渲染（用于 CRUD 表单）

当接收 `formDefId` 参数时，FormRenderer SHALL 调用 `GET /api/v1/form-definitions/{id}` 加载表单定义。

当接收 `rule` 参数时（且未传入 `formDefId`），FormRenderer SHALL 直接使用 rule 数组渲染表单，不调后端 API。

`formDefId` 和 `rule` 参数 SHALL 互斥，同时传入时 `formDefId` 优先。

FormRenderer SHALL 接收 `initialValues` prop，用于预填充表单数据（CRUD 编辑场景）。

FormRenderer SHALL 接收 processInstanceId 和 taskId 参数，从后端加载已保存的表单数据（仅流程表单场景）。

FormRenderer SHALL 支持 v-model 双向绑定表单数据。

FormRenderer SHALL 使用 @form-create/element-ui 渲染器渲染表单。

FormRenderer SHALL 暴露 `getFormData()` 方法供父组件获取表单数据（用于 CRUD 表单提交）。

FormRenderer SHALL 接收 `fieldPermissions` prop（类型 `Record<string, 'EDIT' | 'VIEW' | 'HIDDEN'>`），在 form-create 初始化前应用字段权限到 rule 数组：
- **EDIT**：不修改 rule（保持可编辑）
- **VIEW**：设置 `rule.props.disabled = true`（只读）
- **HIDDEN**：从 rule 数组中移除该字段（不渲染、不提交）

字段权限应用 SHALL 在 form-create 实例创建前一次性完成，不可在初始化后动态修改（form-create 初始化后 option 不响应变化）。

当 `fieldPermissions` 为空或未传入时，FormRenderer SHALL 视所有字段为 EDIT 权限。

#### Scenario: 通过 formDefId 加载表单（流程表单）

- **WHEN** FormRenderer 组件接收 formDefId 参数
- **THEN** 组件调用 GET /api/v1/form-definitions/{id} 获取表单定义
- **AND** 使用 form-create 渲染 schema

#### Scenario: 通过 rule 直接渲染（CRUD 表单）

- **WHEN** FormRenderer 组件接收 rule 参数
- **AND** 未传入 formDefId
- **THEN** 组件直接使用 rule 数组渲染表单
- **AND** 不调后端 API

#### Scenario: CRUD 表单编辑预填充

- **WHEN** FormRenderer 组件接收 initialValues 参数
- **THEN** 组件将 initialValues 填充到表单字段中

#### Scenario: CRUD 表单提交获取数据

- **WHEN** 父组件（SearchTable）调用 FormRenderer 的 getFormData() 方法
- **THEN** FormRenderer 返回当前表单数据对象
- **AND** 父组件使用该数据调用业务接口

#### Scenario: 加载已有表单数据

- **WHEN** FormRenderer 组件接收 processInstanceId 参数
- **AND** 该流程实例已有保存的表单数据
- **THEN** 组件调用 GET /api/v1/form-data 获取数据
- **AND** 将数据填充到表单中

#### Scenario: 应用字段权限 - 只读字段

- **WHEN** FormRenderer 接收 fieldPermissions，且某字段权限为 VIEW
- **THEN** 该字段 SHALL 渲染为只读（disabled）
- **AND** 字段值 SHALL 可见但不可编辑

#### Scenario: 应用字段权限 - 隐藏字段

- **WHEN** FormRenderer 接收 fieldPermissions，且某字段权限为 HIDDEN
- **THEN** 该字段 SHALL 不渲染
- **AND** 该字段值 SHALL 不包含在表单提交数据中

#### Scenario: 应用字段权限 - 可编辑字段

- **WHEN** FormRenderer 接收 fieldPermissions，且某字段权限为 EDIT
- **THEN** 该字段 SHALL 正常渲染为可编辑

#### Scenario: 无字段权限配置

- **WHEN** FormRenderer 未接收 fieldPermissions 或 fieldPermissions 为空对象
- **THEN** 所有字段 SHALL 默认为可编辑（EDIT）

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

### Requirement: 表单配置解析

后端 SHALL 提供 `extractFormConfig(processDefId, taskDefKey)` 方法，返回表单配置对象 `{ formDefId, fieldPermissions }`。

解析逻辑：
1. 优先从节点配置（NodeConfig, nodeId=taskDefKey）读取 `form.formDefId` 和 `form.fieldPermissions`
2. 节点未配置 formDefId 时，从流程级配置（NodeConfig, nodeId=`__PROCESS__`）读取 `form.formDefId` 和 `form.fieldPermissions`
3. 均未配置时返回 null

表单和字段权限 SHALL 作为整体从同一配置层取，不跨层合并。

当选中层的 `fieldPermissions` 为 null 或空时，SHALL 视为所有字段默认 EDIT。

#### Scenario: 节点配置了表单

- **WHEN** 节点 NodeConfig 含 form.formDefId
- **THEN** extractFormConfig SHALL 返回该 formDefId 和该节点的 fieldPermissions
- **AND** 不读取流程级表单配置

#### Scenario: 节点未配置表单，流程有默认表单

- **WHEN** 节点 NodeConfig 的 form.formDefId 为空
- **AND** 流程级 NodeConfig（`__PROCESS__`）含 form.formDefId
- **THEN** extractFormConfig SHALL 返回流程级 formDefId 和流程级的 fieldPermissions

#### Scenario: 节点和流程都未配置表单

- **WHEN** 节点未配置 formDefId 且流程级也未配置
- **THEN** extractFormConfig SHALL 返回 null

#### Scenario: 选中层未配置字段权限

- **WHEN** 选中的配置层有 formDefId 但无 fieldPermissions
- **THEN** extractFormConfig SHALL 返回 formDefId 和空 fieldPermissions
- **AND** 前端 SHALL 视所有字段为 EDIT

