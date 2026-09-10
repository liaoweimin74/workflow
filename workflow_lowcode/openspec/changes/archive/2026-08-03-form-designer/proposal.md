## Why

当前工作流平台的流程节点（开始事件、用户任务）需要关联表单，但表单只能手写 JSON schema，非技术人员无法参与表单设计。现有自研 FormBuilder.vue 是配置驱动渲染器，不支持可视化设计。需要引入表单设计器，让用户通过拖拽方式构建表单，并与流程节点关联，实现流程表单的全生命周期管理。

## What Changes

**表单设计器（新增）**
- 新增表单设计器页面，基于 `@form-create/designer` 实现拖拽式表单构建
- 支持核心组件（文本、数字、选择、日期、文件上传等）和扩展组件（人员/部门选择、数据引用、子表/嵌套表单、分组/分割线）
- 自研数据源配置面板，可视化配置 form-create `fetch` 属性
- 属性配置面板：基本属性、校验规则、高级属性、字段默认权限

**表单定义管理（新增）**
- 表单定义 CRUD API，支持创建、查询、更新、删除
- 表单定义版本管理：每次保存创建新版本，已发布版本不可修改
- 表单定义发布机制：DRAFT → PUBLISHED → ARCHIVED

**表单运行时（新增）**
- FormRenderer.vue 组件，封装 form-create 渲染器
- 替换自研 FormBuilder.vue（标记 deprecated，旧页面保留不强制迁移）
- 根据字段权限（EDIT/VIEW/HIDDEN）控制渲染

**表单实例数据（新增）**
- 表单数据持久化到通用 JSON 表（wf_form_data）
- 按流程实例 + 表单定义关联查询

**字段权限（增强）**
- 表单定义 schema 支持字段默认权限标记
- 流程节点 fieldPermissions 可覆盖表单默认权限
- 权限优先级：节点级 > 表单默认 > EDIT（兜底）

**数据库新增**
- `wf_form_def`：表单定义表（含 schema JSON、版本、状态）
- `wf_form_data`：表单实例数据表（含 data_json、流程实例关联）

## Capabilities

### New Capabilities

- `form-designer`: 表单设计器，可视化拖拽构建表单，产出 form-create rule JSON schema
- `form-definition`: 表单定义管理，CRUD + 版本管理 + 发布机制
- `form-runtime`: 表单运行时渲染，封装 form-create，支持字段权限控制
- `form-data`: 表单实例数据持久化，通用 JSON 存储，按流程实例关联查询

### Modified Capabilities

- `bpmn-designer`: 流程节点的表单关联从占位字段变为真实引用 wf_form_def，节点属性面板的表单选择器从无到有

## Impact

- **前端**：新增 `frontend/src/views/form/` 模块（FormListPage、FormDesigner、FormRenderer、DataSourcePanel），新增 `frontend/src/api/form.ts`，安装 `@form-create/element-ui`、`@form-create/designer` 依赖，新增路由和菜单
- **后端**：新增 `com.workflow.engine.form` 包（FormDefinitionService、FormDataService、entity、repository），新增 `FormDefinitionController`、`FormDataController`，新增 DTO
- **数据库**：新增 V12 迁移脚本，创建 `wf_form_def` 和 `wf_form_data` 两张表
- **依赖**：前端新增 `@form-create/element-ui@next`、`@form-create/designer@next`
- **现有代码**：FormBuilder.vue 标记 deprecated；BPMN 设计器属性面板的表单选择器需对接真实表单定义 API
