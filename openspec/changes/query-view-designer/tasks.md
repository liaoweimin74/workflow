# Tasks：视图查询设计器（View Designer）与自定义页面

> 变更：query-view-designer
> 日期：2026-08-16
> 分期：阶段一 = 视图轨（轨 A，本变更核心交付）；阶段二 = 自定义页面轨（轨 B，扩展）

## 1. 数据库迁移

- [ ] 1.1 创建 `V19__create_wf_page_def.sql`：建 `wf_page_def` 表（id/tenant_id/name/key/type/form_key/schema/version/status/published_version/created_by/created_at/updated_at + 唯一键与索引）
- [ ] 1.2 同一迁移脚本创建页面管理菜单（父菜单 + 页面列表子菜单 + 按钮权限 page:create/page:edit/page:publish/page:delete/view + ROLE_ADMIN 授权，对齐 V12 模式）

## 2. 后端：PageDefinition 实体与 Repository

- [ ] 2.1 创建 `PageDefinition` 实体（JPA，@Entity 映射 wf_page_def，字段齐全）
- [ ] 2.2 创建 `PageDefinitionRepository`（对齐 FormDefinitionRepository：findByIdAndTenantId、findFirstByTenantIdAndKeyOrderByVersionDesc、findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc、findByIdForUpdate 等）

## 3. 后端：PageDefinitionService

- [ ] 3.1 实现 create（name/key/type/form_key，version=1/DRAFT，key 租户内唯一校验）
- [ ] 3.2 实现 getById / getByKey（按最新版本）/ list（分页 + status/name/type 过滤）/ getVersions / getPublishedVersion
- [ ] 3.3 实现 update（原地更新 name/key/schema/form_key，参考 FormDefinitionService.update 模式）
- [ ] 3.4 实现 delete（软删除 ARCHIVED，PUBLISHED 拒绝删除）
- [ ] 3.5 实现 publish：悲观锁 findByIdForUpdate + 旧 PUBLISHED 降 ARCHIVED + 内容未变化拒绝 + 绑定校验（复用 §4 校验器）
- [ ] 3.6 publish 阶段一的 VIEW 类型：调用 ViewCompiler 编译并持久化编译产物
- [ ] 3.7 publish 全程不调用 DynamicTableManager、不执行任何 DDL（单测断言）

## 4. 后端：发布校验器（PageValidator）

- [ ] 4.1 校验绑定表单存在且 status=PUBLISHED（复用 FormDefinitionRepository）
- [ ] 4.2 校验 searchFields/columns/detail 引用列存在（column_config key 集合比对）
- [ ] 4.3 校验搜索字段类型（JSON/TEXT 列拒绝；隐藏列拒绝引用；对齐 BizDataListPage filterable 规则）
- [ ] 4.4 VIEW 编译产物可被解析（异常 → 400）

## 5. 后端：ViewCompiler

- [ ] 5.1 实现视图配置 → form-create rule 编译：searchFields → 查询条件组件 rule（matchType: eq/like/range 映射）
- [ ] 5.2 实现 columns → el-table 列配置（width/align/sortable）
- [ ] 5.3 实现 actions → 操作按钮 rule + permissions 映射
- [ ] 5.4 实现 detail → 详情弹窗 rule（复用绑定表单 form-create schema）
- [ ] 5.5 实现 events → 目标组件 rule 的 on 处理器绑定（声明式动作链 + 模板变量 $row/$param 解析）
- [ ] 5.6 编译产物输出 `{rule, option}` 结构，保证 FormRenderer 可解析

## 6. 后端：Controller 与查询 API

- [ ] 6.1 创建 `PageDefinitionController`：GET/POST/PUT/DELETE `/api/v1/pages`、POST `/api/v1/pages/{id}/publish`、GET `/api/v1/pages/{key}`
- [ ] 6.2 创建 `PageQueryController`：GET `/api/v1/pages/{pageKey}/data`（分页 + filter 白名单化）
- [ ] 6.3 查询复用 BizDataService 分页过滤引擎（租户强制过滤、未知字段拒绝）

## 7. 后端：测试

- [ ] 7.1 `PageDefinitionServiceTest`：CRUD、key 唯一、软删除、PUBLISHED 拒绝删除、发布（含不执行 DDL 断言）
- [ ] 7.2 `PageValidatorTest`：绑定表单未发布/引用不存在列/隐藏列/JSON/TEXT 搜索字段 各失败路径
- [ ] 7.3 `ViewCompilerTest`：searchFields/columns/actions/detail/events 映射正确性、模板变量解析、未知 matchType 拒绝
- [ ] 7.4 集成测试：发布 → 查询 API 分页/过滤/白名单、并发发布防竞态

## 7A. 后端：全局数据源管理（data-source-management）

- [ ] 7A.1 创建 `V19__create_wf_page_def.sql` 增补 `wf_data_source` 表（id/tenant_id/name/type/form_key/source_key/params/status/created_by/created_at/updated_at + name 唯一键与索引）
- [ ] 7A.2 创建 `DataSourceDefinition` 实体 + `DataSourceDefinitionRepository`（findByIdAndTenantId、findByTenantId、findByTenantIdAndName、findEnabledByTenantId 等）
- [ ] 7A.3 实现 `DataSourceDefinitionService`：create（DRAFT/name 唯一/type 必填校验）、update、delete（仅 DRAFT）、enable（必填项 + 绑定表单已发布校验）、disable
- [ ] 7A.4 创建 `DataSourceAdapter` SPI（supports/query） + FORM 适配器（路由 BizDataService）+ SYSTEM/API 未启用占位（返回"数据源类型未启用"）
- [ ] 7A.5 创建 `DataSourceController`：GET/POST/PUT/DELETE `/api/v1/data-sources`、POST `/{id}/enable`、POST `/{id}/disable`
- [ ] 7A.6 `DataSourceDefinitionServiceTest`：CRUD、name 唯一、状态机流转、非 DRAFT 删除拒绝、启用未发布表单拒绝、不执行 DDL 断言

## 8. 前端：API 与路由

- [ ] 8.1 创建 `src/api/page.ts`（pageApi：CRUD/publish/data 查询接口，对齐 formApi 模式）
- [ ] 8.2 创建 `src/api/data-source.ts`（dataSourceApi：CRUD/enable/disable，对齐 formApi 模式）
- [ ] 8.3 注册路由：`/page/list`（PageListPage）、`/page/designer`（ViewDesigner，query 带 id）、`/page/:pageKey`（PageRenderer）、`/data-source/list`（DataSourceListPage）

## 9. 前端：页面管理列表（PageListPage）

- [ ] 9.1 实现 PageListPage.vue：列表（name/key/type/绑定表单/状态/版本）、创建弹窗（name/key/type/form_key 选择）、编辑、发布、删除（复用 SearchTable）
- [ ] 9.2 创建表单类型选择（VIEW/PAGE）与已发布业务表单下拉（仅 VIEW 阶段；PAGE 选项阶段二启用）

## 10. 前端：视图设计器（ViewDesigner）

- [ ] 10.1 实现 ViewDesigner.vue 布局：顶部信息栏（名称/key/绑定表单/状态）+ 配置区
- [ ] 10.2 实现绑定表单选择后自动加载 column_config（复用 getFormDefinitionByKey）
- [ ] 10.3 实现搜索栏字段勾选配置（可筛选列候选、matchType 选择约束）
- [ ] 10.4 实现表格列勾选配置（宽度/对齐/可排序）
- [ ] 10.5 实现操作按钮开关 + 权限配置
- [ ] 10.6 实现详情弹窗配置
- [ ] 10.7 实现事件配置面板（触发器 + 声明式动作链配置 + 模板变量提示）
- [ ] 10.8 实现保存（update schema）与发布（publish）流程 + 预览按钮

## 10A. 前端：数据源管理页（DataSourceListPage）

- [ ] 10A.1 实现 DataSourceListPage.vue：列表（name/type/绑定对象/status/更新时间）、按 type/status 筛选（复用 SearchTable）
- [ ] 10A.2 实现创建/编辑弹窗：type 选择（FORM/SYSTEM/API）+ 按类型动态表单（FORM→表单下拉；SYSTEM→sourceKey 枚举；API→sourceKey + params JSON）
- [ ] 10A.3 实现启用/禁用/删除操作（按钮权限 data-source:manage；禁用/删除失败提示）
- [ ] 10A.4 PageDesigner 数据源下拉只列出 ENABLED 数据源（阶段二接入）

## 11. 前端：通用渲染页（PageRenderer）

- [ ] 11.1 实现 PageRenderer.vue：按 pageKey 加载页面定义（VIEW 编译产物 / PAGE schema）
- [ ] 11.2 集成 FormRenderer 渲染 rule；加载失败/未发布展示错误提示
- [ ] 11.3 注入 PageDataSource（query/detail/create/update/remove，复用 bizDataApi）
- [ ] 11.4 绑定视图事件：声明式动作链执行器（openDetail/openLink/openCreate/edit/delete/refresh/export/message + $row/$param 模板替换）

## 12. 前端：ScriptSandbox

- [ ] 12.1 实现 ScriptSandbox（白名单上下文注入 + 受限执行 + 异常捕获，选型验证后确定实现）
- [ ] 12.2 视图脚本事件的注册开关配置（默认关闭）
- [ ] 12.3 ScriptSandbox 单测（上下文注入、异常隔离、资源受限）

## 13. 阶段二（预留）：自定义页面轨（轨 B）

- [ ] 13.1 页面组件库：注册布局/展示/交互/数据组件到 form-create（独立于表单组件库；含 el-tree 树形数据组件）
- [ ] 13.2 PageDesigner（复用 @form-create/designer，页面组件库模式 + 数据源绑定配置：dataSourceId 下拉来自页面 dataSources 绑定层）
- [ ] 13.3 PageRenderer 支持直接渲染 PAGE schema + 按 dataSources 绑定层实例化 DataSourceRegistry（refId 解析全局数据源；组件按 dataSourceId 关联；单数据源默认绑定 dataSources[0]）
- [ ] 13.4 页面动作总线（actions）：trigger/componentId/event + steps（set-filter/refresh/set-value/open-detail/call-api），目标引用数据源 id；联动过滤受 searchFields 白名单约束（左树右表场景 = node-click → set-filter + refresh 验收）
- [ ] 13.5 页面事件总线与脚本交互（复用 ScriptSandbox；脚本上下文含 registry 与 actions）
- [ ] 13.6 PAGE 类型发布校验扩展：dataSources 条目 refId 命中 ENABLED 全局数据源、组件 dataSourceId 命中绑定层、actions 引用存在、set-filter 字段白名单（集中遍历一次）
- [ ] 13.7 阶段二前端测试（设计器交互、多数据源渲染断言、左树右表联动 end-to-end、事件交互）

## 14. 验收与收尾

- [ ] 14.1 全量回归：现有表单设计器/发布建表/BizDataListPage 行为不变（存量测试全绿）
- [ ] 14.2 端到端演示路径：创建业务表单并发布 → 创建视图绑定该表单 → 配置搜索/列/操作/事件 → 发布 → /page/<key> 查询 + 事件验证
- [ ] 14.3 端到端演示路径（阶段二）：创建全局数据源（FORM×2：分类+商品）→ 自定义页面绑定两数据源 → 配置左树右表联动动作 → 发布 → 树节点点击过滤表格验证
- [ ] 14.4 更新 docs（PRD 3.2 补充视图/页面/全局数据源能力说明；docs/features.md）