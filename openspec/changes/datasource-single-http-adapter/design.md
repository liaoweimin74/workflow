# Unified HTTP Data Source Adapter — Design

## Context

- 架构状态（codegraph 核实 + 2026-08-17 spec 确认）：现存 3 个 `DataSourceAdapter` (`FormDataSourceAdapter`→DB, `SystemDataSourceAdapter`→service 直调, `ApiDataSourceAdapter`→外部 HTTP)，`DataSourceDefinitionService.adapterOf()` 按 `type` 路由。
- `data-source-management` spec 第 111 条："SYSTEM/API 适配器 SHALL 预留接口但返回'not enabled'" —— 当前 SYSTEM 与 API 实质不可查询。
- `BizDataController` (`/api/v1/biz-data/{formKey}`) 已把 FORM CRUD 作为 HTTP 暴露。
- 用户目标：界面统一为单页签 API 配置；FORM/SYSTEM 自动填充只读 API 路径；唯一执行器为 HTTP 适配器。

## Goals / Non-Goals

**Goals:**
- 唯一数据访问路径：`UnifiedDataSourceAdapter` 执行 `internal://` 与外部 `https://`。
- SYSTEM 暴露为内部 REST (`/api/v1/internal/system/dept-tree`, `/api/v1/internal/system/users`)；FORM 复用已有 `BizDataController` CRUD。
- UI 单页签 API 配置；FORM/SYSTEM `params` 自动生成且只读；仅 API 类型可编辑。

**Non-Goals:**
- 不改租户隔离、状态机（DRAFT/ENABLED/DISABLED）、页面发布校验 (`PageValidator`/`PageQueryController`)。
- 不增新 3方 API 格式；现有 API 数据源配置行为不变。
- 不改 `wf_data_source` / `wf_biz_*` 表结构。

## Decisions

| 决策 | 结论 | 理由 |
|------|------|------|
| 执行器 | 收敛为 1 个 `UnifiedDataSourceAdapter` | 匹配「单一数据源 / 单 adapter」目标 |
| `internal://` 派发 | **Direct Method Mapping** (allowlist: sourceKey → controller bean) | 避开 socket 回环，codegraph 确认 bean 可直呼 |
| SYSTEM 树形态 | **扁平 + parentId** | 沿用 `SystemDataSourceAdapter` flatten 逻辑 + `DEPT_COLUMNS` |
| FORM 存取 | 复用 `/api/v1/biz-data/{formKey}` | 已就绪，零新增 API |
| 类型字段 | 保留 `type` (FORM/SYSTEM/API) 用于 UI 区分 + 参数推导；查询统一走 adapter | 兼容 `DataSourceController` / 下拉 |
| 列元数据 | SYSTEM 新增 metadata 接口返回列定义；FORM 复用 `column_config`；API 复用 `params.columns` | `DataSourceMetadata.columns` 契约不变 |

## Risks / Trade-offs

- **Risk**: `internal://` 路由若为任意路径 → SSRF/滥用内部端点。**Mitigation**: `InternalDataSourceRouter` 仅 allowlist 注册的 sourceKey→controller 方法，拒绝未注册路径。
- **Risk**: SYSTEM 扁平化丢失树形语义（树模式渲染）。**Mitigation**: 输出 `parentId`，客户端回拼；后续如需真·树形再加独立 endpoint。
- **Risk**: 存量 SYSTEM/FORM 数据源 `params` 为空。**Mitigation**: `enable()` 时 lazy 补填 params；`type` 不变不破坏存量下拉。
- **Trade-off**: 内部调用一次派发层。**Mitigation**: in-process，直接方法映射，无网络开销。
- **Risk**: 移除 `FormDataSourceAdapter`/`SystemDataSourceAdapter` 需迁移其测试。**Mitigation**: 合并到 `UnifiedDataSourceAdapterTest`。

## Migration Plan

- DRAFT 存量 source: enable 时回填 params。
- ENABLED 存量 source: 配置不变；部署 UnifiedDataSourceAdapter 为唯一 bean，adapterOf 退化为单 bean。
- 部署顺序: SystemInternalController → InternalDataSourceRouter → UnifiedDataSourceAdapter → UI 单页签。
- 回滚: git revert adapter 路由；旧 adapter 位于历史。

## Open Questions
- Q1: system sourceKey 枚举 → `dept-tree`(默认) / `user-tree`，API 路径一一映射。[决定]
- Q2: `internal://` 是否绕过鉴权？→ 继承当前租户上下文（TenantProvider），不新鉴权。
