# Implementation Tasks

## 1. 数据库迁移

- [ ] 1.1 创建 V12 Flyway 迁移脚本，建 `wf_form_def` 表（id, tenant_id, name, key, schema, version, status, published_version, created_by, created_at, updated_at，UNIQUE(tenant_id, key, version)，INDEX(tenant_id, status)）
- [ ] 1.2 在 V12 迁移脚本中建 `wf_form_data` 表（id, tenant_id, form_def_id, form_version, process_instance_id, task_id, data_json, created_by, created_at, updated_at，INDEX(form_def_id, process_instance_id)，INDEX(tenant_id, process_instance_id)）
- [ ] 1.3 在 V12 迁移脚本中插入表单管理菜单数据（表单列表、表单设计器）

## 2. 后端 — 表单定义 Entity & Repository

- [ ] 2.1 创建 `com.workflow.engine.form` 包结构（entity, repository, service）
- [ ] 2.2 创建 `FormDefinition` JPA Entity，映射 `wf_form_def` 表
- [ ] 2.3 创建 `FormDefinitionRepository`，含按 tenant_id+key 查最大 version、按 tenant_id+status 分页查询等方法
- [ ] 2.4 创建 `FormData` JPA Entity，映射 `wf_form_data` 表
- [ ] 2.5 创建 `FormDataRepository`，含按 process_instance_id+form_def_id 查询方法

## 3. 后端 — 表单定义 Service

- [ ] 3.1 创建 `FormDefinitionService`，实现 create（生成 UUID, version=1, DRAFT）、getById、list（分页+过滤）、update（创建新版本）、delete（软删除→ARCHIVED）
- [ ] 3.2 实现 publish 方法（DRAFT→PUBLISHED, 更新 published_version）
- [ ] 3.3 实现 getVersions（版本列表）、getByVersion（特定版本）、getPublishedSchema（已发布版本 schema）方法
- [ ] 3.4 实现 key 唯一性校验（同租户内 key 不可重复）
- [ ] 3.5 创建 `FormDataService`，实现 save、getById、findByProcessInstance、update 方法

## 4. 后端 — Controller & DTO

- [ ] 4.1 创建 `FormDefinitionController`，路由 `/api/v1/form-definitions`，实现 CRUD + publish + versions 端点
- [ ] 4.2 创建 `FormDataController`，路由 `/api/v1/form-data`，实现 save + query + update 端点
- [ ] 4.3 创建 DTO 类：`FormDefinitionDTO`、`FormDefinitionSaveRequest`、`FormDataDTO`、`FormDataSaveRequest`、`FormVersionDTO`
- [ ] 4.4 Controller 返回 `R<T>` 包装，分页返回 `PageResponse<T>`，遵循现有 pattern

## 5. 前端 — 依赖安装 & 路由

- [ ] 5.1 安装 `@form-create/element-ui@next` 和 `@form-create/designer@next` 依赖
- [ ] 5.2 在 `main.ts` 中注册 form-create 和 FcDesigner 插件
- [ ] 5.3 在 `router/index.ts` 新增 `/form` 路由（表单列表页）和 `/form/designer` 路由（表单设计器，fullScreen）
- [ ] 5.4 创建 `frontend/src/api/form.ts`，封装表单定义和表单数据 API 调用

## 6. 前端 — 表单列表页

- [ ] 6.1 创建 `frontend/src/views/form/FormListPage.vue`，展示表单定义列表（表格：名称、key、版本、状态、创建时间）
- [ ] 6.2 实现新建表单按钮（调用 POST 创建 DRAFT 表单，跳转到设计器）
- [ ] 6.3 实现编辑按钮（跳转到设计器，传 formDefId）
- [ ] 6.4 实现发布按钮（调用 publish API）
- [ ] 6.5 实现版本历史查看（弹窗显示版本列表）
- [ ] 6.6 实现删除按钮（确认后调用 DELETE，软删除）

## 7. 前端 — 表单设计器页面

- [ ] 7.1 创建 `frontend/src/views/form/FormDesigner.vue`，三栏布局嵌入 FcDesigner 组件
- [ ] 7.2 实现工具栏（保存、发布、预览、版本历史按钮）
- [ ] 7.3 实现保存逻辑（从 FcDesigner 获取 rule JSON → 调用 PUT 保存 → 创建新版本）
- [ ] 7.4 实现发布逻辑（保存 → 调用 publish API）
- [ ] 7.5 实现加载已有表单 schema 逻辑（从后端获取 → 注入 FcDesigner）
- [ ] 7.6 实现预览模式（切换到 form-create 渲染当前 schema）

## 8. 前端 — 自研数据源配置面板

- [ ] 8.1 创建 `frontend/src/views/form/components/DataSourcePanel.vue`，作为 FcDesigner 属性面板插件
- [ ] 8.2 实现数据源配置表单（API 地址、请求方法、数据插入位置、响应解析表达式、请求头、请求参数）
- [ ] 8.3 实现产出 `fetch` 配置对象，注入到当前选中字段的 rule JSON
- [ ] 8.4 实现从已有 rule 读取 `fetch` 配置回填表单

## 9. 前端 — 表单运行时渲染器

- [ ] 9.1 创建 `frontend/src/views/form/components/FormRenderer.vue`，封装 form-create 渲染器
- [ ] 9.2 实现 props：formDefId、processInstanceId、taskId、fieldPermissions
- [ ] 9.3 实现加载表单定义 schema 逻辑（调用 GET 获取已发布版本 schema）
- [ ] 9.4 实现加载已有表单数据逻辑（调用 GET 获取 wf_form_data）
- [ ] 9.5 实现字段权限合并（表单默认权限 + 节点级 fieldPermissions → 注入 disabled/display）
- [ ] 9.6 实现表单数据提交逻辑（POST/PUT /api/v1/form-data）
- [ ] 9.7 在 `FormBuilder.vue` 添加 deprecated 注释标记

## 10. 前端 — BPMN 设计器表单关联增强

- [ ] 10.1 在 BPMN 设计器属性面板中，为开始事件和用户任务新增"表单"Tab
- [ ] 10.2 实现关联表单选择器（下拉框，从已发布表单定义列表加载）
- [ ] 10.3 实现字段权限配置 UI（选择表单后列出字段，每个字段权限选择器 EDIT/VIEW/HIDDEN）
- [ ] 10.4 字段权限保存到 `wf_node_config.config_json.form.fieldPermissions`

## 11. 集成测试

- [ ] 11.1 后端单元测试：FormDefinitionService CRUD + 版本管理 + 发布流程
- [ ] 11.2 后端单元测试：FormDataService 保存 + 查询 + 版本快照
- [ ] 11.3 后端集成测试：FormDefinitionController 全部端点
- [ ] 11.4 后端集成测试：FormDataController 全部端点
- [ ] 11.5 前端验证：表单设计器拖拽构建 → 保存 → 发布流程
- [ ] 11.6 前端验证：FormRenderer 加载表单 + 字段权限渲染
- [ ] 11.7 前端验证：BPMN 设计器表单关联 + 字段权限配置
- [ ] 11.8 端到端验证：创建表单 → 发布 → 流程节点关联 → 发起流程 → 填写表单 → 审批查看表单
