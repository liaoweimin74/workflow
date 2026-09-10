## Context

工作流平台已完成 BPMN 流程设计器（Phase 1）、核心引擎集成、审批人选择器、框架 UI 增强。当前缺少表单设计器能力——流程节点（开始事件、用户任务）需要关联表单，但表单只能手写 JSON schema，非技术人员无法参与。

现有前端有一个自研 `FormBuilder.vue`（配置驱动渲染，`fields: FormField[]` → Element Plus 组件），但它是**运行时渲染器**，不是设计器。本期用 form-create 开源版替换它，同时引入 `@form-create/designer` 作为可视化设计器。

### 现有架构

```
后端:
  com.workflow
    ├─ api/controller/     REST Controller (R<T> 包装返回)
    ├─ api/dto/            请求/响应 DTO
    ├─ common/domain/      R, BaseEntity
    ├─ engine/process/     ProcessDesignService, ProcessDraft, NodeConfig, Category
    ├─ engine/task/        TaskService
    └─ system/             用户/角色/组织/字典

数据库 (Flyway 迁移):
  V2  init_data
  V3  grant_admin_menus
  V4  wf_node_config (节点配置 JSON)
  V5  wf_category (流程分类)
  V6  wf_process_draft (流程草稿)
  V7  add_process_management_menus
  V8  add_last_deployed_at
  V9  fix_version_and_deployed_at
  V11 add_category_menu

前端:
  frontend/src/
    ├─ views/designer/     BPMN 设计器 (ProcessDesigner.vue + properties/)
    ├─ components/business/ FormBuilder.vue, ApproverPicker.vue, LookupPicker.vue
    ├─ router/index.ts     懒加载路由
    └─ stores/             Pinia stores
```

### 节点表单关联现状

`wf_node_config.config_json` 中已有 `form` 字段：
```json
{
  "form": {
    "formDefId": "form_001",
    "fieldPermissions": { "reason": "EDIT", "days": "VIEW" }
  }
}
```
但 `formDefId` 目前无对应实体——本期创建 `wf_form_def` 表填补此空白。

## Goals / Non-Goals

**Goals:**

1. 用户在浏览器中通过拖拽方式构建表单（form-create designer）
2. 表单定义持久化到数据库，支持版本管理
3. 表单定义可被多个流程节点引用
4. 运行时用 form-create 渲染表单，替换自研 FormBuilder.vue
5. 字段权限最小版：表单定义设默认权限（EDIT/VIEW/HIDDEN），流程节点可覆盖
6. 自研数据源配置面板，产出 fetch 配置注入 form-create rule JSON
7. 表单实例数据持久化到通用 JSON 表（wf_form_data）

**Non-Goals:**

1. 事件脚本（PRD 3.2.4）— 推迟到下一期
2. 可视化规则引擎（PRD 3.2.5）— 推迟到下一期
3. 沙箱执行环境 — 推迟到下一期
4. 组件扩展机制（PRD 3.2.2）— 本期不做，先用内置 30+ 组件
5. 自动编号、富文本、评分、地址组件 — 难度高，后续再做
6. 页面设计器 / 低代码平台 — 未来独立选型

## Decisions

### D1: 表单引擎选型 — form-create 开源版

| 包 | 用途 |
|---|---|
| `@form-create/element-ui@next` | Vue 3 + Element Plus 运行时渲染器 |
| `@form-create/designer@next` | 可视化拖拽设计器（FcDesigner 组件） |

**理由**：设计器开箱即用（MIT），Vue 3 + Element Plus 原生，30+ 内置组件，2025-11 仍在活跃迭代。详见 brainstorm.md 方案对比。

### D2: 数据模型

```
wf_form_def (表单定义)
─────────────────────────────────────────
id                  VARCHAR(64) PK    UUID
tenant_id           VARCHAR(64)       租户隔离
name                VARCHAR(255)      表单名称
key                 VARCHAR(255)      表单标识（同租户唯一）
schema              LONGTEXT          form-create rule JSON
version             INT               版本号（从 1 开始）
status              VARCHAR(32)       DRAFT / PUBLISHED / ARCHIVED
published_version   INT               当前发布版本号
created_by          VARCHAR(50)
created_at          DATETIME
updated_at          DATETIME

  UNIQUE(tenant_id, key, version)
  INDEX(tenant_id, status)


wf_form_data (表单实例数据)
─────────────────────────────────────────
id                  VARCHAR(64) PK    UUID
tenant_id           VARCHAR(64)       租户隔离
form_def_id         VARCHAR(64)       → wf_form_def.id
form_version        INT               表单版本快照
process_instance_id VARCHAR(64)       → Flowable process instance
task_id             VARCHAR(64)       → Flowable task (可选)
data_json           LONGTEXT          { "field": "value", ... }
created_by          VARCHAR(50)
created_at          DATETIME
updated_at          DATETIME

  INDEX(form_def_id, process_instance_id)
  INDEX(tenant_id, process_instance_id)
```

**版本管理策略**：
- 表单定义每次保存创建新版本（version 自增）
- 已发布（PUBLISHED）版本的 schema 不可修改
- 修改已发布表单 → 创建新 DRAFT 版本 → 发布后新版本生效
- `wf_form_data` 记录 `form_version` 快照，保证旧数据与旧 schema 对应
- 流程节点引用 `formDefId`（不含版本），运行时加载 `published_version` 对应的 schema

### D3: 表单与流程节点的关联

```
绑定方式:
  流程级绑定: wf_node_config.__PROCESS__.form.formDefId (开始事件/全局)
  节点级绑定: wf_node_config.<nodeId>.form.formDefId (用户任务)

优先级: 节点级 > 流程级
  → 节点有配置 formDefId 时用节点的，否则继承流程级的

字段权限:
  表单定义 schema 中每个字段可携带默认权限:
    { "field": "reason", "permission": { "default": "EDIT" } }
  
  流程节点 fieldPermissions 覆盖:
    wf_node_config.<nodeId>.form.fieldPermissions = { "reason": "VIEW" }
  
  权限值: EDIT（可编辑）、VIEW（只读）、HIDDEN（隐藏）
  优先级: 节点 fieldPermissions > 表单默认 > EDIT（兜底）
```

### D4: 后端 API 设计

```
表单定义 CRUD:
  POST   /api/v1/form-definitions              创建表单定义
  GET    /api/v1/form-definitions              分页列表
  GET    /api/v1/form-definitions/{id}         获取详情（含 schema）
  PUT    /api/v1/form-definitions/{id}         更新（创建新版本）
  DELETE /api/v1/form-definitions/{id}         删除（软删除）
  POST   /api/v1/form-definitions/{id}/publish 发布表单
  GET    /api/v1/form-definitions/{id}/versions 版本列表
  GET    /api/v1/form-definitions/{id}/versions/{version} 获取特定版本

表单实例数据:
  POST   /api/v1/form-data                     保存表单数据
  GET    /api/v1/form-data                     查询（by processInstanceId + formDefId）
  GET    /api/v1/form-data/{id}                获取单条
  PUT    /api/v1/form-data/{id}                更新表单数据
```

遵循现有 pattern：
- Controller 在 `com.workflow.api.controller`
- Entity 在 `com.workflow.engine.form.entity`（新建 form 子包）
- Service 在 `com.workflow.engine.form`
- DTO 在 `com.workflow.api.dto`
- 返回 `R<T>` 包装

### D5: 前端架构

```
frontend/src/
  ├─ views/form/                    ← 新建
  │   ├─ FormListPage.vue           表单定义列表页（CRUD + 版本管理）
  │   ├─ FormDesigner.vue           表单设计器页面（全屏，嵌入 FcDesigner）
  │   └─ components/
  │       ├─ DataSourcePanel.vue    自研数据源配置面板
  │       └─ FormRenderer.vue       运行时表单渲染器（封装 form-create）
  │
  ├─ api/
  │   └─ form.ts                    表单定义 + 表单数据 API
  │
  ├─ router/index.ts                新增 /form 和 /form/designer 路由
  │
  └─ components/business/
      └─ FormBuilder.vue            ← 标记 deprecated，逐步替换为 FormRenderer
```

**设计器页面布局**：
```
┌─────────────────────────────────────────────────┐
│  工具栏: [保存] [发布] [预览] [版本]              │
├──────────┬──────────────┬──────────────────────┤
│ 组件面板  │  设计画布     │  属性配置面板          │
│          │              │                      │
│ 核心组件  │  FcDesigner  │  基本属性              │
│ 扩展组件  │  拖拽区域     │  校验规则              │
│ 布局组件  │              │  高级属性              │
│          │              │  数据源配置(自研)       │
│          │              │  字段默认权限           │
└──────────┴──────────────┴──────────────────────┘
```

### D6: 自研数据源配置面板

form-create 的 `fetch` 属性是 rule JSON 的一部分：
```json
{
  "type": "select",
  "field": "product",
  "title": "选择产品",
  "fetch": {
    "action": "/api/v1/products",
    "method": "GET",
    "to": "options",
    "parse": "res.data.map(p => ({label: p.name, value: p.id}))"
  }
}
```

DataSourcePanel.vue 作为 FcDesigner 的属性面板插件，让用户可视化配置 fetch：
- API 地址（action）
- 请求方法（method: GET/POST）
- 数据插入位置（to: options / props.options）
- 响应解析（parse: 表达式或函数）
- 请求头（headers）
- 请求参数（query / data）

产出 `fetch` 对象注入到当前选中字段的 rule 中。

### D7: 运行时渲染替换

```vue
<!-- FormRenderer.vue -->
<template>
  <FormCreate
    :rule="resolvedSchema"
    :option="renderOption"
    v-model="formData"
  />
</template>
```

- `resolvedSchema`：从 wf_form_def 加载 schema，根据字段权限注入 `disabled`/`display`
- `renderOption`：form-create 全局配置（表单布局、提交按钮等）
- `formData`：双向绑定，初始化时从 wf_form_data 加载

替换路径：
1. 本期创建 FormRenderer.vue 作为新组件
2. FormBuilder.vue 标记 deprecated，保留但不再新增使用
3. 新表单场景全部使用 FormRenderer
4. 旧使用 FormBuilder 的页面逐步迁移（不在本期强制）

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| form-create 开源版设计器无法可视化编辑 control 联动规则 | 本期不做可视化规则（PRD 3.2.5 推迟）。运行时 control API 可用，开发者可手写 JSON。下期自研规则面板 |
| form-create schema 格式与自研 FormBuilder FormField 格式不兼容 | FormBuilder.vue 保留，旧页面不强制迁移。新表单全部用 FormRenderer |
| 表单版本变更后旧数据 schema 不匹配 | wf_form_data 记录 form_version 快照。渲染旧数据时加载对应版本 schema |
| 自研数据源面板与 FcDesigner 集成可能有限制 | FcDesigner 支持自定义属性面板组件。先验证集成可行性，再实现 |
| form-create rule JSON 存储为 LONGTEXT，大表单可能性能问题 | LONGTEXT 上限 4GB，实际表单 schema 通常 < 100KB。如有需要可加压缩 |
| 人员/部门选择组件需适配 form-create 自定义组件机制 | form-create 支持自定义组件注册。复用已有 ApproverPicker 逻辑封装为 form-create 组件 |
