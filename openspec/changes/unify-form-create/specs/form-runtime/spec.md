# form-runtime Delta Specification

## MODIFIED Requirements

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
- **AND** 将数据填充到表单字段中

#### Scenario: 新流程实例无表单数据

- **WHEN** FormRenderer 组件接收 processInstanceId 参数
- **AND** 该流程实例无保存的表单数据
- **THEN** 表单字段显示为空（或 schema 中配置的默认值）

## REMOVED Requirements

### Requirement: FormBuilder 自定义表单组件

**Reason**: FormBuilder 已被 form-create 统一架构替代，所有 CRUD 表单通过 FormRenderer 渲染。

**Migration**: 
- FormBuilder.vue 的所有消费方（7 个 CRUD 页面通过 SearchTable）迁移到 FormRenderer + formKey
- FormField 类型替换为 form-create Rule 类型
- LookupPicker 从 FormBuilder 内部组件改为 form-create 全局自定义组件
- FormBuilder.vue、RenderField 子组件、FormField 类型定义和相关测试文件删除
