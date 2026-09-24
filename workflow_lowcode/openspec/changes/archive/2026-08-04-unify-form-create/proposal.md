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

- **FormPageLayout 组件**：统一外壳，供自定义页面使用，保证 label-width、间距、按钮区等风格一致
- **LookupPicker 注册为 form-create 自定义组件**：通过 `formCreate.component()` 全局注册 + FcDesigner `addComponent()` 设计器面板入口
- **CRUD 表单 rule JSON**：7 个页面对应的 form-create rule schema，前端定义

### 修改

- **SearchTable**：内部用 FormRenderer 替代 FormBuilder，通过 `rule` prop 传入 schema；保留 columns/searchFields/buttons 前端配置不变
- **7 个 CRUD 页面**：`formConfig.fields`（FormField[]）改为 `formConfig.rule`（form-create Rule[]），数据提交仍走各页面的业务 Controller
- **FormRenderer**：支持 `rule` prop 直接渲染模式（不限于流程表单的 `formDefId`）
- **FormDesigner**：注册 LookupPicker 到设计器拖拽面板

### 删除

- **FormBuilder.vue**：含 RenderField 子组件
- **FormField 类型**：被 form-create Rule 类型替代
- **FormBuilder 测试**：被 FormRenderer 集成测试替代

## Capabilities

### New Capabilities

- `crud-form-binding` — CRUD 页面通过前端 rule JSON 驱动 FormRenderer 渲染表单，数据走业务接口
- `custom-form-components` — 定制组件（LookupPicker 等）注册为 form-create 组件，同时用于 CRUD 表单、工作流表单和设计器
- `unified-form-layout` — FormPageLayout 统一外壳，保证拖拽设计表单和自定义页面风格一致

### Modified Capabilities

- `form-runtime` — FormRenderer 支持两种模式：`formDefId`（流程表单，后端加载）和 `rule`（CRUD 表单，前端直接传入）

## Impact

### 前端

| 模块 | 影响 |
|---|---|
| `SearchTable.vue` | 内部 FormBuilder → FormRenderer，接口从 `fields: FormField[]` 改为 `rule: any[]` |
| `FormRenderer.vue` | 增加 `rule` prop（直接渲染）和 `initialValues` prop，暴露 `getFormData()` |
| `FormDesigner.vue` | 注册 LookupPicker 到 FcDesigner 拖拽面板 |
| `main.ts` | 注册 LookupPicker 为 form-create 全局组件 |
| 7 个 CRUD 页面 | formConfig 从 FormField[] 改为 rule JSON（前端定义） |
| `FormBuilder.vue` | 删除 |
| `types.ts` | 删除 FormField 相关类型（保留 SearchField/TableColumn 等） |
| 新增 `FormPageLayout.vue` | 统一外壳组件 |

### 后端

无改动。CRUD 表单 schema 前端定义，以后如需在线编辑可再持久化到后端。

### 数据

无数据库迁移。7 个页面的 rule JSON 定义在前端代码中。

### 依赖

- 无新增依赖，`@form-create/element-ui` 和 `@form-create/designer` 已安装
