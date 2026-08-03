# crud-form-binding Specification

## ADDED Requirements

### Requirement: CRUD 表单通过 formKey 绑定 FormDefinition

系统 SHALL 允许 CRUD 页面通过 `formKey` 绑定一个已发布的 FormDefinition，用于加载表单 schema 进行渲染。

FormDefinition 实体 SHALL 增加可选字段 `formKey`（String），用于 CRUD 页面的语义化绑定。`formKey` 在所有已发布的 FormDefinition 中 SHALL 唯一。

后端 SHALL 提供 `GET /api/v1/form-definitions/by-key/{formKey}` 接口，返回该 formKey 对应的已发布版本的 FormDefinition（含 schema）。

#### Scenario: CRUD 页面加载表单 schema

- **WHEN** 页面配置了 `formKey = "user-crud"`
- **THEN** 前端调用 `GET /api/v1/form-definitions/by-key/user-crud`
- **AND** 后端返回 status = PUBLISHED 的最新版本的 FormDefinition
- **AND** 前端使用返回的 schema 渲染表单

#### Scenario: formKey 不存在

- **WHEN** 页面配置了 `formKey = "nonexistent"`
- **AND** 后端没有匹配的已发布 FormDefinition
- **THEN** 后端返回 404
- **AND** 前端显示"表单定义未找到"提示

#### Scenario: formKey 对应未发布的草稿

- **WHEN** FormDefinition 存在但 status = DRAFT
- **THEN** 后端返回 404（只返回已发布版本）
- **AND** 前端显示"表单未发布"提示

### Requirement: SearchTable 集成 FormRenderer

SearchTable 组件 SHALL 在创建/编辑弹窗中使用 FormRenderer 替代 FormBuilder 渲染表单。

SearchTable 的 `FormConfig` 接口 SHALL 将 `fields: FormField[]` 替换为 `formKey: string`。

SearchTable SHALL 在弹窗打开时通过 formKey 加载 schema，在提交时通过 FormRenderer 的 `getFormData()` 获取表单数据并调用页面的 create/update API。

SearchTable SHALL 保留对 columns、searchFields、actionButtons 的现有配置方式不变。

#### Scenario: 创建操作

- **WHEN** 用户点击"新增"按钮
- **THEN** SearchTable 打开弹窗
- **AND** FormRenderer 通过 formKey 加载表单 schema
- **AND** 表单字段为空（或 schema 默认值）
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
