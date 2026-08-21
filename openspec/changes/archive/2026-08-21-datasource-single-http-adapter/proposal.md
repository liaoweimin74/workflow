# Proposal: Unified HTTP Data Source Adapter

## Why

当前数据源管理存在 3 个适配器 (Form/System/Api) 且仅 FORM 可查询；SYSTEM 与 API 在 `data-source-management` spec 中明文「不实装查询」——用户在配置界面只能看到 API 数据源的真正可配参数，而 FORM/SYSTEM 的存取路径分散(直调 service / DB)，配置 UI 又是 3 种类型各出一套。把 SYSTEM 以内部 REST 暴露、让 FORM 走已有的 `/api/v1/biz-data/{formKey}`，再用单一 HTTP 适配器统一 internal:// + https，就可用一张 API 配置页、 FORM/SYSTEM 自动填写只读路径、仅第三方 API 可编辑，真正实现「一种数据源」。

## What Changes

**<DataSourceAdapter 路由>**
- From: 3 个 adapter (`FormDataSourceAdapter`/`SystemDataSourceAdapter`/`ApiDataSourceAdapter`) + `adapterOf(type)` 路由
- To: 1 个 `UnifiedDataSourceAdapter`，处理 `internal://` 与外部 `https://`；`adapterOf` 退化为单 bean
- Reason: 消除分裂；新增来源即加 internal endpoint + sourceKey 映射
- Impact: breaking — 移除 2 adapter；迁移其测试

**<SystemDataSourceAdapter>**
- From: 直调 `OrganizationService`/`UserService`
- To: 走新 `/api/v1/internal/system/dept-tree` 与 `/users` (扁平+parentId)
- Reason: 让 SYSTEM 也成为可 HTTP 访问的数据源
- Impact: breaking；存量 SYSTEM source lazy 回填 params

**<FormDataSourceAdapter>**
- From: 直调 `BizDataService`
- To: 走已有 `/api/v1/biz-data/{formKey}` (internal://)
- Reason: 统一 HTTP 路径，零新增 API
- Impact: breaking；迁移测试

**<ApiDataSourceAdapter>** (evolves)
- From: 仅外部 HTTP
- To: `UnifiedDataSourceAdapter` — 兼 `internal://` 派发 (Direct Method Mapping, allowlist) + 原外部 HTTP
- Reason: 统一执行器
- Impact: non-breaking for API sources

**<DataSourceDefinitionService>**
- From: `enable()` 仅判字段必填
- To: `enable()`/`create()` 对 FORM/SYSTEM 自动生成只读 `params` JSON (接口 action + parse/totalParse 规则)
- Reason: 支撑单页签只读展示
- Impact: non-breaking (params 多填充)

**<前端 DataSourceListPage>**
- From: 3 个类型各自字段
- To: 单 API 配置页；FORM/SYSTEM 显示自动生成的接口配置只读，API 类型可编辑
- Reason: 统一配置体验
- Impact: breaking (UI 重构，API 契约不变)

## Capabilities

### New Capabilities
- `system-internal-api` — 部门树/用户列表的内部 REST endpoint (dept-tree/users) + 列元数据，供 SYSTEM 数据源 HTTP 访问
- `internal-datasource-router` — `internal://` 方案到本进程 controller bean 的派发器（allowlist）
- `datasource-auto-params` — FORM/SYSTEM 数据源 params JSON 自动生成 + 单页签 API 配置 UI (只读回显)

### Modified Capabilities
- `data-source-management` — 改动: 全部 3 类类型现均可查询 (SYSTEM 不再返回"not enabled"); FORM/SYSTEM 配置自动生成只读; `DataSourceAdapter SPI 预留` 改为全实装；API 查询存量行为不变

## Impact
- **backend**: 移除 `FormDataSourceAdapter`+`SystemDataSourceAdapter`，新增 `SystemInternalController` + `InternalDataSourceRouter`，`ApiDataSourceAdapter`→`UnifiedDataSourceAdapter`，`BizDataController` 被复用。
- **tests**: `FormDataSourceAdapterTest`/`SystemDataSourceAdapterTest` 合并到 `UnifiedDataSourceAdapterTest` (internal:// + external)。
- **frontend**: `DataSourceListPage.vue` 单页签。
- **reuse**: `business-form-data` spec (BizDataController CRUD) 作为 FORM 的 internal API 来源；`user-batch-query` 复用 `UserService.list` (无修改)。
