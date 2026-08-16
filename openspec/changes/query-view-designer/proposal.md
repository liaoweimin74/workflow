# Proposal：视图查询设计器（View Designer）与自定义页面

> 变更：query-view-designer
> 日期：2026-08-16

## Why

现状表单发布 BUSINESS 表单会自动建物理表，而查询界面只需**绑定**已建表，不需要建表；现有业务数据列表页（BizDataListPage）按 column_config 自动生成、**完全不可配置**，无法挑选列、定制搜索匹配、操作按钮、详情弹窗与事件。用户既需要默认快速的声明式查询界面，又需要覆盖卡片/看板等异形风格与复杂交互的自定义页面，且发布动作不能触发 DDL。本变更以"视图 + 自定义页面"双轨补齐可配置查询界面能力，两轨共享 form-create 运行时，扩展路径清晰。

## What Changes

**新增 `wf_page_def` 页面定义模型**
- From: 无页面定义能力，查询界面只有 BizDataListPage 自动生成页
- To: 独立 `wf_page_def` 表 + `PageDefinition` 实体，type=VIEW（视图）/ PAGE（自定义页面），form_key 绑定业务表单，版本管理 + 悲观锁发布
- Reason: 查询界面配置需独立于表单定义存储与版本化
- Impact: 非破坏性，纯增量

**发布行为：不建表**
- From: BUSINESS 表单发布触发 DDL 建表
- To: `PageDefinitionService.publish()` 不调用 DynamicTableManager、不执行任何 DDL，仅做绑定/字段校验并编译视图
- Reason: 查询界面不拥有数据，只绑定已发布表单物理表
- Impact: 非破坏性，现有表单发布不受影响

**视图轨（轨 A）：声明式查询界面 + 双层事件**
- From: 无配置化查询界面
- To: ViewDesigner 清单勾选配置 searchFields/columns/actions/detail/events；发布时 ViewCompiler 编译为 form-create rule；事件支持"声明式动作链 + 沙箱脚本"
- Reason: 覆盖 80% 表格查询场景且支持自定义事件
- Impact: 非破坏性，新增页面/API

**自定义页面轨（轨 B，阶段二）：form-create 自由布局**
- From: 无自由布局页面能力
- To: PageDesigner（复用 @form-create/designer）+ 页面组件库 + 数据源注入（PageDataSource）+ 原生 on 事件/脚本
- Reason: 覆盖异形风格与复杂交互
- Impact: 非破坏性，阶段一数据模型已预留（type=PAGE）

## Capabilities

### New Capabilities
- `query-view-definition`: 视图定义管理——CRUD、发布（不建表 + 绑定/字段校验）、ViewCompiler 编译为 form-create rule、双层事件机制（声明式动作链 + ScriptSandbox 沙箱脚本）
- `query-page-renderer`: 页面消费层——`/page/:pageKey` 通用渲染器（PageRenderer）、`PageQueryController` 白名单分页查询 API、菜单注册
- `custom-page-designer`: 自定义页面轨——页面组件库、PageDesigner（form-create 拖拽）、数据源注入 PageRuntime、页面事件与脚本交互（阶段二）

### Modified Capabilities
- （无——现有能力无需求变更）

## Impact

- **新增文件**：`V19__create_wf_page_def.sql` 迁移；后端 `PageDefinition` 实体/Repository/Service/Controller、`ViewCompiler`；前端 `PageListPage.vue`、`ViewDesigner.vue`、`PageDesigner.vue`（阶段二）、`PageRenderer.vue`、`ScriptSandbox`
- **复用**：`FormRenderer`、`SearchTable`、`BizDataService` 查询引擎、绑定表单 form-create schema（弹窗）、`formCreateInject` 注入机制
- **不受影响**：`FormDefinitionService.publish()`、`DynamicTableManager`、`FormDesigner.vue`、`BizDataListPage.vue`（保留为兼容入口）
- **API 新增**：`GET/POST/PUT/DELETE /api/v1/pages`、`POST /api/v1/pages/{id}/publish`、`GET /api/v1/pages/{pageKey}/data`
- **依赖**：无新增依赖（复用现有 form-create 生态）