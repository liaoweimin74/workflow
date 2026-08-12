## Why

当前系统的表单设计器与渲染器仅服务于"工作流表单"——表单必须绑定流程节点、随任务渲染，数据以 JSON 快照形式挂在流程实例下，无法形成独立可查的业务数据。PRD §3.2.1 规划的"数据引用组件"（从业务表/表单选取数据）与 §3.4 的"数据源"能力均以业务表单（底表）为前置基础。缺少底表能力，系统只能做审批流转，无法沉淀可查询、可约束、可报表的业务数据。现在处理：设计器、渲染器、表单定义版本管理等基础设施已齐备，只需扩展"宿主绑定层"即可低成本补齐。预期收益：业务表单与工作流表单共用一套设计体系，为 data-picker 引用、流程数据落库等后续能力奠定数据源基础。

## What Changes

1. **表单定义支持类型**：`wf_form_def` 新增 `type`（WORKFLOW/BUSINESS）与 `column_config`（JSON 列映射）字段；创建/列表接口支持类型；列映射配置随表单保存。
2. **业务表单发布建表**：发布 BUSINESS 类型表单时，后端基于列映射通过运行时受控 DDL 创建/变更物理表 `wf_biz_<formKey>`（共享表 + tenant_id 列）；列名/类型/长度白名单校验；仅允许增列/改列宽/改必填/加索引，禁止删列与类型跨类变更。
3. **业务数据 CRUD API**：新增 `BizDataController`，提供 `POST/GET/PUT/DELETE /api/v1/biz-data/{formKey}[/{id}]`，分页查询支持字段筛选/排序，动态 SQL 全参数化并强制 tenant_id 过滤，更新走乐观锁。
4. **前端业务数据管理页**：表单管理列表增加类型筛选；业务表单行提供"管理数据"入口，跳转 `/biz-data/:formKey` 通用数据表格页（动态列/筛选/排序/分页，编辑复用 FormRenderer）；发布 BUSINESS 表单时弹出列映射确认对话框（自动映射草案可调整）。

## Capabilities

### New Capabilities

- `business-form-data`: 业务表单（底表）数据的增删改查能力——物理表管理、通用 CRUD API、前端数据管理页。

### Modified Capabilities

- `form-definition`: 表单定义新增 type 与 column_config 属性，发布 BUSINESS 表单时同步创建/变更物理表结构。
- `form-designer`: 设计器支持选择表单类型（工作流/业务），发布业务表单前展示列映射确认。

## Impact

**后端：**
- `FormDefinition` 实体 + DTO — 新增 `type`、`columnConfig` 字段
- `FormDefinitionService` — 发布流程扩展：BUSINESS 类型触发动态建表/变更（`DynamicTableManager`）
- 新增 `ColumnTypeMapper`（组件→列类型映射）、`DdlBuilder`（受控 DDL 生成）、`DynamicTableManager`（建表/变更/表信息查询）、`BizDataService`（动态 SQL CRUD）
- 新增 `BizDataController` 与请求/响应 DTO
- Flyway 迁移 — `wf_form_def` 加列

**前端：**
- `FormListPage.vue` — 类型筛选、业务表单"管理数据"入口
- `FormDesigner.vue` — 创建时类型选择、发布前列映射确认对话框
- 新增 `BizDataListPage.vue`（通用数据表格）+ 路由 `/biz-data/:formKey`
- `api/form.ts` / 新增 `api/bizData.ts` — API 客户端与类型

**数据库：** `wf_form_def` 加 `type`（默认 'WORKFLOW'）与 `column_config` 列，向后兼容；运行期动态创建 `wf_biz_<formKey>` 表。

**API：** 新增 `/api/v1/biz-data/**` 接口组；`form-definitions` 创建/列表接口支持 `type` 参数，响应体新增字段，向后兼容。
