# 数据源统一为单一 HTTP 适配器 — Brainstorm

## Design Summary

项目当前状态（通过 codegraph 核实 + `docs/superpowers/specs/2026-08-17-data-source-unified-api-design.md` 已确认）：

- `DataSourceAdapter` SPI 已统一接口（`supports/metadata/query/get` + 写方法 default）；
- 现存 3 个 `@Component` adapter，按 `DataSourceDefinitionService.adapterOf()` 路由：
  - **FormDataSourceAdapter** → `BizDataService` → DB (`wf_biz_<formKey>`)；
  - **SystemDataSourceAdapter** → `OrganizationService`/`UserService` 直调（部门树/用户，read-only）；
  - **ApiDataSourceAdapter** → `HttpLogicExecutor` → 外部 HTTP。
- `DataSourceController` 已暴露六个统一数据端点；
- `BizDataController` 已把 FORM CRUD 作为 HTTP API 暴露 (`/api/v1/biz-data/{formKey}`)。

本次收敛：把 **SYSTEM 也暴露为内部 HTTP API**，并扩展 adapter 处理 `internal://` 与外部 HTTP，从而让 **唯一执行器 = 单一 HTTP 适配器**，最终实现「一种数据源 / 一个 adapter / 一张 API 配置页」。

## Alternatives Considered

### 方案 A：混合 — 保留 3 个 adapter + 新增 System REST
- **做法**：SYSTEM 新增 `/api/v1/internal/system/*`，ApiAdapter 增加 `internal://` 支持；FormDataSourceAdapter/SystemDataSourceAdapter 保留并行。
- **优点**：改动最小，回归风险低。
- **缺点**：两个派发路径并存（直调 + HTTP），抽象不统一，违反「单一数据源」目标。
- **为何未採用**：用户明确希望「配置界面单页签、FORM/SYSTEM 自动填充只读 API」，混合方案无法彻底收敆类型。

### 方案 B（Agreed）：收敛为 1 个 UnifiedDataSourceAdapter，全部走 HTTP
- **做法**：删除 `FormDataSourceAdapter` + `SystemDataSourceAdapter`；ApiDataSourceAdapter 进化为 `UnifiedDataSourceAdapter`，处理 `internal://` (SYSTEM dept-tree/user-tree + FORM biz-data) 与外部 `https://`。`adapterOf()` 退化为单一 bean。
- **优点**：一个 adapter、一种配置模型、新增来源只需新增 internal API + sourceKey 映射。FORM 端几近免费（BizDataController 已存在）。
- **缺点**：需要 `internal://` 本地派发器；SYSTEM 组织树需扁平化 (parentId)；现存 3 adapter 的测试需迁移。
- **为何勝出**：直接匹配用户目标，架构收敛，可扩展性最佳。

### 方案 C：全部走 localhost 回环 HTTP
- **做法**：SYSTEM/FORM 暴露为 normal HTTP，adapter 统一走 localhost。
- **优点**：adapter 极度简单。
- **缺点**：内部调用多一次 socket 回环，无实益；`internal://` 直呼更快更安全。
- **为何未採用**：性能/开销退步。

## Agreed Approach

**方案 B**：`UnifiedDataSourceAdapter` 作为唯一执行器。SYSTEM 暴露 `/api/v1/internal/system/dept-tree` + `/api/v1/internal/system/users`；FORM 复用已有 `/api/v1/biz-data/{formKey}`。`internal://` 由 `InternalDataSourceRouter` 本地派发（非 MockMvc 走 socket），外部请求仍走 `HttpLogicExecutor`。

## Key Decisions

| 决策 | 结论 | 依据 |
|------|------|------|
| `internal://` 派发 | **直接方法映射** (scheme→controller bean)，非 MockMvc/回环 | 性能 & 安全，codegraph 确认 controller bean 可直接调用 |
| SYSTEM 组织树形态 | **扁平 + parentId** (`id/parentId/label/code`) | 沿用现有 `SystemDataSourceAdapter` flatten 逻辑 + `DEPT_COLUMNS` |
| FORM 存取 | 复用 `/api/v1/biz-data/{formKey}` CRUD | `BizDataController` 已就绪，零新增 API |
| 参数生成 | FORM/SYSTEM `params` 自动生成只读；仅 API 类型可编辑 | 前端单页签约定 |
| 数据源类型 | 保留 `type` 字段 (FORM/SYSTEM/API) 用于 UI 区分 + 参数推导；查询统一走 adapter | 兼容现有 `DataSourceController`/前端下拉 |
| 列元数据 | SYSTEM 新增 `columns` 元数据接口返回列定义；FORM 复用 `column_config`；API 复用 `params.columns` | `DataSourceMetadata.columns` 契约不变 |

## Open Questions

- Q1: 现存 DRAFT/ENABLED 的 FORM/SYSTEM 数据源 `params` 为空，启用时是否回填？ → **是**，lazy 生成于 `enable()`，不改历史 `type` 语义。
- Q2: System 数据源 `sourceKey` 枚举范围？ → 现有 `user-tree` / `dept-tree`(默认) 两个；API 路径一一映射。
- Q3: 降级容灯 — `InternalDataSourceRouter` 解析失败如何兜底？ → 抛 `BusinessException(400, "internal route not found")`。
