# Proposal: unify-form-create

## Why

项目当前存在两条独立的表单轨道：

1. **自定义 FormBuilder**（已标 `@deprecated`）：7 个管理后台 CRUD 页面通过 SearchTable 使用，schema 为前端写死的 `FormField[]`，无设计器，维护成本高。
2. **form-create FormRenderer**：流程表单使用，有 FcDesigner 可视化设计器、后端持久化、版本管理、字段权限。

用户目标是统一为一条 form-create 轨道：
- 绝大部分 CRUD 表单可通过拖拽设计
- 少数复杂表单开发人员自定义页面，界面风格一致
- 定制 form-create 组件同时用于普通表单和工作流表单

## What Changes

### 新增

- **FormDefinition.formKey**：用于 CRUD 页面绑定表单定义（如 `user-crud`、`menu-crud`）
- **FormPageLayout 组件**：统一外壳，供自定义页面使用，保证 label-width、间距、按钮区等风格一致
- **LookupPicker 注册为 form-create 自定义组件**：通过 `formCreate.component()` 全局注册 + FcDesigner `addComponent()` 设计器面板入口
- **CRUD 表单初始 rule JSON**：7 个页面对应的 form-create rule schema

### 修改

- **SearchTable**：内部用 FormRenderer 替代 FormBuilder，通过 `formKey` 加载 schema；保留 columns/searchFields/buttons 前端配置不变
- **7 个 CRUD 页面**：`formConfig.fields`（FormField[]）改为 `formConfig.formKey`（string），数据提交仍走各页面的业务 Controller
- **FormRenderer**：支持 `formKey` 加载模式（不限于流程表单的 `formDefId`）
- **FormDesigner**：注册 LookupPicker 到设计器拖拽面板

### 删除

- **FormBuilder.vue**：含 RenderField 子组件
- **FormField 类型**：被 form-create Rule 类型替代
- **FormBuilder 测试**：被 FormRenderer 集成测试替代

## Capabilities

### New Capabilities

- `crud-form-binding` — CRUD 页面通过 formKey 绑定 FormDefinition，加载 schema 渲染表单
- `custom-form-components` — 定制组件（LookupPicker 等）注册为 form-create 组件，同时用于 CRUD 表单、工作流表单和设计器
- `unified-form-layout` — FormPageLayout 统一外壳，保证拖拽设计表单和自定义页面风格一致

### Modified Capabilities

- `form-rendering` — FormRenderer 支持两种加载模式：`formDefId`（流程表单）和 `formKey`（CRUD 表单）

## Impact

### 前端

| 模块 | 影响 |
|---|---|
| `SearchTable.vue` | 内部 FormBuilder → FormRenderer，接口从 `fields: FormField[]` 改为 `formKey: string` |
| `FormRenderer.vue` | 增加 `formKey` prop，支持按 key 加载 FormDefinition |
| `FormDesigner.vue` | 注册 LookupPicker 到 FcDesigner 拖拽面板 |
| `main.ts` | 注册 LookupPicker 为 form-create 全局组件 |
| 7 个 CRUD 页面 | formConfig 从 FormField[] 改为 formKey |
| `FormBuilder.vue` | 删除 |
| `types.ts` | 删除 FormField 相关类型（保留 SearchField/TableColumn 等） |
| 新增 `FormPageLayout.vue` | 统一外壳组件 |

### 后端

| 模块 | 影响 |
|---|---|
| `FormDefinition` 实体 | 增加 `formKey` 字段（可选，用于 CRUD 绑定） |
| `FormDefinitionController` | 增加按 `formKey` 查询已发布版本的接口 |
| `FormDefinitionService` | 增加按 `formKey` 查询逻辑 |

### 数据

- 7 个 CRUD 页面的 rule JSON 初始数据需要初始化（可通过 FcDesigner 设计后导出，或手写）
- FormDefinition 表增加 `form_key` 列

### 依赖

- 无新增依赖，`@form-create/element-ui` 和 `@form-create/designer` 已安装
