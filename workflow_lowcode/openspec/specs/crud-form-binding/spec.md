# crud-form-binding Specification

## Purpose
TBD - created by archiving change unify-form-create. Update Purpose after archive.
## Requirements
### Requirement: CRUD 页面通过前端 rule JSON 驱动 FormRenderer

系统 SHALL 允许 CRUD 页面在前端定义 form-create rule JSON，传入 SearchTable 的 FormConfig，由 FormRenderer 直接渲染。

CRUD 表单的 rule JSON SHALL 定义在各页面文件中（前端代码），不存入后端 FormDefinition 表。

#### Scenario: CRUD 页面渲染表单

- **WHEN** 页面在 formConfig 中配置了 `rule = [{ type: 'input', field: 'name', title: '名称' }, ...]`
- **THEN** SearchTable 将 rule 传给 FormRenderer
- **AND** FormRenderer 直接使用 rule 渲染表单（不调后端 API）
- **AND** 用户可填写表单

### Requirement: SearchTable 集成 FormRenderer

SearchTable 组件 SHALL 在创建/编辑弹窗中使用 FormRenderer 替代 FormBuilder 渲染表单。

SearchTable 的 `FormConfig` 接口 SHALL 将 `fields: FormField[]` 替换为 `rule: any[]`。

SearchTable SHALL 在弹窗打开时将 rule 传入 FormRenderer，在提交时通过 FormRenderer 的 `getFormData()` 获取表单数据并调用页面的 create/update API。

SearchTable SHALL 保留对 columns、searchFields、actionButtons 的现有配置方式不变。

#### Scenario: 创建操作

- **WHEN** 用户点击"新增"按钮
- **THEN** SearchTable 打开弹窗
- **AND** FormRenderer 接收 rule prop 渲染表单
- **AND** 表单字段为空（或 rule 中配置的默认值）
- **AND** 用户填写后点击确定
- **AND** SearchTable 调用 `getFormData()` 获取数据
- **AND** 调用页面的 `onCreate(data)` 提交到业务后端

#### Scenario: 编辑操作

- **WHEN** 用户点击行的"编辑"按钮
- **THEN** SearchTable 打开弹窗
- **AND** FormRenderer 通过 formKey 加载表单 schema
- **AND** SearchTable 将当前行数据作为 initialValues 传入 FormRenderer
- **AND** 用户修改后点击确定
- **AND** SearchTable 调用 `getFormData()` 获取数据
- **AND** 调用页面的 `onUpdate(id, data)` 提交到业务后端

### Requirement: CRUD 表单数据走业务接口

CRUD 表单的 schema SHALL 只负责表单渲染和校验，不负责数据持久化。

表单提交数据 SHALL 由各 CRUD 页面的 `onCreate` / `onUpdate` 回调处理，写入对应的业务表。

系统 SHALL NOT 将 CRUD 表单数据写入 FormData 表（FormData 仅用于流程表单）。

#### Scenario: 用户管理页面提交

- **WHEN** UserPage 的创建表单提交
- **THEN** SearchTable 调用 `onCreate(data)`
- **AND** UserPage 调用 `POST /api/v1/users` 写入用户表
- **AND** 不写入 FormData 表

