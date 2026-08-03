# 表单设计器 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 基于 form-create 开源版实现工作流表单设计器，支持拖拽构建表单、版本管理、字段权限控制，并与流程节点关联。

**Architecture:** 后端新增 `com.workflow.engine.form` 包，提供表单定义 CRUD + 版本管理 + 表单数据持久化 API。前端集成 `@form-create/designer` 作为可视化设计器，`@form-create/element-ui` 作为运行时渲染器（替换自研 FormBuilder）。自研数据源配置面板补齐设计器 UI 缺失。字段权限采用混合模式（表单默认 + 节点覆盖）。

**Tech Stack:** Spring Boot + JPA + Flyway（后端），Vue 3 + Element Plus + @form-create/element-ui + @form-create/designer（前端），MySQL（数据库）

---

## Task 1: 数据库迁移

- [ ] **Step 1:** 创建 `backend/src/main/resources/db/migration/V12__create_form_tables.sql`，建 `wf_form_def` 表（id VARCHAR(64) PK, tenant_id, name, key, schema LONGTEXT, version INT, status VARCHAR(32), published_version INT, created_by, created_at, updated_at, UNIQUE(tenant_id, key, version), INDEX(tenant_id, status)）
- [ ] **Step 2:** 在同一迁移脚本中建 `wf_form_data` 表（id VARCHAR(64) PK, tenant_id, form_def_id, form_version INT, process_instance_id, task_id, data_json LONGTEXT, created_by, created_at, updated_at, INDEX(form_def_id, process_instance_id), INDEX(tenant_id, process_instance_id)）
- [ ] **Step 3:** 在同一迁移脚本中插入表单管理菜单（表单列表、表单设计器）到 `sys_menu` 表，参考 V7 的菜单插入 pattern
- [ ] **Step 4:** 运行 `mvn flyway:info` 确认 V12 待执行，运行 `mvn flyway:migrate` 执行迁移，确认两张表创建成功

## Task 2: 后端 Entity & Repository

- [ ] **Step 1:** 创建包 `com.workflow.engine.form.entity` 和 `com.workflow.engine.form.repository`
- [ ] **Step 2:** 创建 `FormDefinition` JPA Entity，映射 `wf_form_def` 表，参考 `ProcessDraft` entity pattern（String id, @PrePersist 生成 UUID）
- [ ] **Step 3:** 创建 `FormDefinitionRepository extends JpaRepository`，添加方法：`findMaxVersionByTenantAndKey`、`findByTenantIdAndStatus`、`findByTenantIdAndKeyOrderByVersionDesc`
- [ ] **Step 4:** 创建 `FormData` JPA Entity，映射 `wf_form_data` 表
- [ ] **Step 5:** 创建 `FormDataRepository extends JpaRepository`，添加方法：`findByProcessInstanceIdAndFormDefId`、`findByTenantIdAndProcessInstanceId`
- [ ] **Step 6:** 运行 `mvn compile` 确认编译通过

## Task 3: 后端 Service 层

- [ ] **Step 1:** 创建 `com.workflow.engine.form.FormDefinitionService`，注入 `FormDefinitionRepository`
- [ ] **Step 2:** 实现 `create(name, key)` → 生成 UUID, version=1, status=DRAFT, 保存
- [ ] **Step 3:** 实现 `update(id, schema)` → 查询当前版本 → 创建新版本记录（version+1, status=DRAFT）→ 保存
- [ ] **Step 4:** 实现 `publish(id)` → 查询当前 DRAFT → status=PUBLISHED, published_version=version → 保存
- [ ] **Step 5:** 实现 `getById`、`list(tenantId, status, page, size)`、`delete(id)`（软删除→ARCHIVED）
- [ ] **Step 6:** 实现 `getVersions(id)`、`getByVersion(id, version)`、`getPublishedSchema(id)`
- [ ] **Step 7:** 实现 key 唯一性校验（create 时检查同租户 key 是否已存在）
- [ ] **Step 8:** 创建 `FormDataService`，实现 `save`、`getById`、`findByProcessInstance`、`update`
- [ ] **Step 9:** 运行 `mvn compile` 确认编译通过

## Task 4: 后端 Controller & DTO

- [ ] **Step 1:** 创建 DTO 类：`FormDefinitionDTO`（id, name, key, version, status, publishedVersion, createdAt）、`FormDefinitionDetailDTO`（含 schema）、`FormDefinitionSaveRequest`（schema）、`FormDataDTO`、`FormDataSaveRequest`、`FormVersionDTO`
- [ ] **Step 2:** 创建 `FormDefinitionController`，路由 `/api/v1/form-definitions`，参考 `ProcessDesignController` pattern
- [ ] **Step 3:** 实现端点：POST（创建）、GET（列表）、GET/{id}（详情）、PUT/{id}（更新→新版本）、DELETE/{id}（软删除）、POST/{id}/publish（发布）、GET/{id}/versions（版本列表）、GET/{id}/versions/{version}（特定版本）
- [ ] **Step 4:** 创建 `FormDataController`，路由 `/api/v1/form-data`
- [ ] **Step 5:** 实现端点：POST（保存）、GET（按 processInstanceId+formDefId 查询）、GET/{id}（单条）、PUT/{id}（更新）
- [ ] **Step 6:** 所有端点返回 `R<T>` 包装，分页返回 `PageResponse<T>`
- [ ] **Step 7:** 运行 `mvn compile` 确认编译通过

## Task 5: 后端测试

- [ ] **Step 1:** 创建 `FormDefinitionServiceTest`，测试 create（验证 UUID/version/status）、update（验证新版本创建）、publish（验证状态变更）、key 唯一性校验
- [ ] **Step 2:** 创建 `FormDataServiceTest`，测试 save、findByProcessInstance、update
- [ ] **Step 3:** 创建 `FormDefinitionControllerTest`，测试全部端点的 HTTP 请求/响应
- [ ] **Step 4:** 创建 `FormDataControllerTest`，测试全部端点
- [ ] **Step 5:** 运行 `mvn test` 确认全部测试通过

## Task 6: 前端依赖 & 路由

- [ ] **Step 1:** 在 `frontend/` 执行 `npm install @form-create/element-ui@next @form-create/designer@next`
- [ ] **Step 2:** 在 `frontend/src/main.ts` 中注册 form-create 和 FcDesigner：`app.use(FormCreate)` + `app.use(FcDesigner)`
- [ ] **Step 3:** 在 `frontend/src/router/index.ts` 新增路由：`/form`（FormListPage，AdminLayout 子路由）和 `/form/designer`（FormDesigner，fullScreen）
- [ ] **Step 4:** 创建 `frontend/src/api/form.ts`，封装 API 调用函数：`createFormDefinition`、`getFormDefinitions`、`getFormDefinition`、`updateFormDefinition`、`deleteFormDefinition`、`publishFormDefinition`、`getFormVersions`、`getFormVersion`、`saveFormData`、`getFormData`、`updateFormData`
- [ ] **Step 5:** 运行 `npm run dev` 确认前端启动无报错

## Task 7: 前端表单列表页

- [ ] **Step 1:** 创建 `frontend/src/views/form/FormListPage.vue`，使用 Element Plus Table 展示表单定义列表（列：名称、key、版本、状态、创建时间、操作）
- [ ] **Step 2:** 实现"新建表单"按钮 → 调用 `createFormDefinition` API → 跳转 `/form/designer?id={newId}`
- [ ] **Step 3:** 实现"编辑"按钮 → 跳转 `/form/designer?id={formDefId}`
- [ ] **Step 4:** 实现"发布"按钮 → 确认弹窗 → 调用 `publishFormDefinition` API → 刷新列表
- [ ] **Step 5:** 实现"版本历史"按钮 → 弹窗显示版本列表（调用 `getFormVersions`）
- [ ] **Step 6:** 实现"删除"按钮 → 确认弹窗 → 调用 `deleteFormDefinition` → 刷新列表
- [ ] **Step 7:** 运行 `npm run dev` 验证列表页功能

## Task 8: 前端表单设计器页面

- [ ] **Step 1:** 创建 `frontend/src/views/form/FormDesigner.vue`，三栏布局嵌入 `<fc-designer ref="designerRef" />`
- [ ] **Step 2:** 实现工具栏（保存、发布、预览按钮），定位在设计器顶部
- [ ] **Step 3:** 实现 `onMounted` 加载逻辑：从路由参数获取 `id` → 调用 `getFormDefinition(id)` → 获取 schema → `designerRef.value.setRule(schema)`
- [ ] **Step 4:** 实现保存逻辑：`designerRef.value.getRule()` 获取 JSON → 调用 `updateFormDefinition(id, { schema })` → 提示成功
- [ ] **Step 5:** 实现发布逻辑：先保存 → 调用 `publishFormDefinition(id)` → 提示成功
- [ ] **Step 6:** 实现预览逻辑：切换到预览模式 → 使用 `<form-create :rule="previewRule" v-model="previewData" />` 渲染当前 schema
- [ ] **Step 7:** 运行 `npm run dev` 验证设计器拖拽、保存、发布、预览功能

## Task 9: 自研数据源配置面板

- [ ] **Step 1:** 创建 `frontend/src/views/form/components/DataSourcePanel.vue`，包含表单：API 地址、请求方法(GET/POST)、数据插入位置(to)、响应解析表达式(parse)、请求头(key-value)、请求参数(key-value)
- [ ] **Step 2:** 实现 DataSourcePanel 作为 FcDesigner 的自定义属性面板组件，监听当前选中字段
- [ ] **Step 3:** 实现产出 `fetch` 配置对象（{ action, method, to, parse, headers, data }），写入当前选中字段的 rule
- [ ] **Step 4:** 实现从已有 rule 读取 `fetch` 配置回填表单
- [ ] **Step 5:** 在设计器中验证：选中 select 组件 → 配置数据源 → 保存 → 重新打开确认回填

## Task 10: 表单运行时渲染器

- [ ] **Step 1:** 创建 `frontend/src/views/form/components/FormRenderer.vue`，使用 `<form-create :rule="resolvedSchema" :option="renderOption" v-model="formData" />`
- [ ] **Step 2:** 实现 props：`formDefId`、`processInstanceId`、`taskId`、`fieldPermissions`（可选，节点级覆盖）
- [ ] **Step 3:** 实现 `loadSchema` 方法：调用 `getFormDefinition(formDefId)` → 获取已发布版本 schema → 存入 `resolvedSchema`
- [ ] **Step 4:** 实现 `loadData` 方法：调用 `getFormData({ processInstanceId, formDefId })` → 存入 `formData`
- [ ] **Step 5:** 实现 `applyPermissions` 方法：遍历 schema 字段，合并表单默认权限 + 节点 fieldPermissions → VIEW 注入 `disabled: true`，HIDDEN 注入 `display: false`
- [ ] **Step 6:** 实现 `submit` 方法：调用 `saveFormData` 或 `updateFormData`，传入 formDefId、processInstanceId、data_json
- [ ] **Step 7:** 在 `FormBuilder.vue` 顶部添加 `@deprecated` 注释，标注替代组件为 FormRenderer
- [ ] **Step 8:** 运行 `npm run dev` 验证 FormRenderer 加载表单、权限控制、提交功能

## Task 11: BPMN 设计器表单关联增强

- [ ] **Step 1:** 在 `frontend/src/views/designer/properties/` 中创建 `FormPropertyTab.vue`，作为节点属性面板的"表单"Tab
- [ ] **Step 2:** 实现关联表单选择器：`el-select` 下拉框 → 调用 `getFormDefinitions({ status: 'PUBLISHED' })` 加载选项 → 选中后更新 `nodeConfig.form.formDefId`
- [ ] **Step 3:** 实现字段权限配置 UI：选中表单后 → 从表单 schema 提取字段列表 → 每个字段显示 `el-select`（EDIT/VIEW/HIDDEN）→ 默认值取表单 schema 中的 permission.default
- [ ] **Step 4:** 字段权限变更时更新 `nodeConfig.form.fieldPermissions`
- [ ] **Step 5:** 在开始事件和用户任务的属性面板中注册 FormPropertyTab
- [ ] **Step 6:** 运行 `npm run dev` 验证：打开 BPMN 设计器 → 选中用户任务 → 表单 Tab → 选择表单 → 配置字段权限 → 保存

## Task 12: 端到端集成验证

- [ ] **Step 1:** 创建表单"请假申请单"（事由、天数、附件、审批意见）→ 发布
- [ ] **Step 2:** 在 BPMN 设计器中创建请假流程 → 开始事件关联表单 → 用户任务配置字段权限（事由/天数/附件=VIEW，审批意见=EDIT）
- [ ] **Step 3:** 部署流程 → 发起流程实例 → FormRenderer 渲染表单（全部字段 EDIT）→ 填写并提交
- [ ] **Step 4:** 经理审批节点 → FormRenderer 渲染表单（事由/天数/附件=VIEW，审批意见=EDIT）→ 填写审批意见 → 提交
- [ ] **Step 5:** 验证 wf_form_data 中有两条记录（发起人数据 + 审批人数据），form_version 快照正确
- [ ] **Step 6:** 修改表单定义并发布新版本 → 验证旧流程实例仍使用旧版本 schema 渲染
