# Unified HTTP Data Source Adapter — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Collapse the 3 data-source adapters into one `UnifiedDataSourceAdapter` that executes `internal://` (SYSTEM/ FORM, in-process) and external `https://` (API), with SYSTEM exposed as internal REST + a single read-only-autofilled API config tab in the UI.

**Architecture:** `UnifiedDataSourceAdapter` (evolved from `ApiDataSourceAdapter`) is the sole `DataSourceAdapter` bean. It dispatches `internal://` to `InternalDataSourceRouter` (allowlist → controller bean methods) and `https://` to `HttpLogicExecutor`. A new `SystemInternalController` (`/api/v1/internal/system/*`) exposes SYSTEM CRUD; FORM reuses the existing `BizDataController` (`/api/v1/biz-data/{formKey}`). `DataSourceDefinitionService.enable()/create()` auto-generates read-only `params` JSON for FORM/SYSTEM.

**Tech Stack:** Spring Boot (Java 17), Spring Web MVC, JPA (`OrganizationService`/`UserService`/`BizDataController`), `HttpLogicExecutor`, Vue 3 + TypeScript + Element Plus.

**Global Constraints:**
- TDD: RED → GREEN → REFACTOR per task; tests must pass before commit.
- No breaking changes to `DataSourceController` six endpoints (consumer contract stable).
- `internal://` MUST be allowlist-only (no arbitrary internal path dispatch) — SSRF safety.
- SYSTEM tree SHALL be flat with `parentId` (matches `BizDataPageVO` row model + `DEPT_COLUMNS`).
- Existing 3 adapters' tests migrate into `UnifiedDataSourceAdapterTest`.

---

## Task 1: SystemInternalController (internal SYSTEM REST API)

- [ ] **1.1 Write failing tests:** `SystemInternalControllerTest` — dept-tree flat rows + parentId=root 空串；users 分页 + keyword；CRUD 路由到 service mock。
- [ ] **1.2 Run → RED.**
- [ ] **1.3 Implement** `backend/src/main/java/com/workflow/api/controller/SystemInternalController.java`:
  - `GET /api/v1/internal/system/dept-tree` → flatten `OrganizationService.tree()` to flat rows
  - `GET /api/v1/internal/system/users` → `UserService.list` → BizDataPageVO
  - CRUD: POST/PUT/DELETE → `dept-tree`→OrganizationService, `users`→UserService
  - metadata: `GET /.../metadata` → column defs + writable=true
- [ ] **1.4 Run → GREEN** (`mvn test -Dtest=SystemInternalControllerTest`).
- [ ] **1.5 Commit** `feat(system): internal SYSTEM rest api`.

## Task 2: InternalDataSourceRouter (internal:// dispatch)

- [ ] **2.1 Write failing test:** `InternalDataSourceRouterTest` — FORM formKey→BizDataController method；SYSTEM sourceKey→SystemInternalController method；unknown path→400。
- [ ] **2.2 Run → RED.**
- [ ] **2.3 Implement** `engine/datasource/InternalDataSourceRouter.java`: sourceKey/formKey allowlist → controller bean + method; tenant via TenantProvider.
- [ ] **2.4 Run → GREEN** (`mvn test -Dtest=InternalDataSourceRouterTest`).
- [ ] **2.5 Commit** `feat(datasource): internal:// router`.

## Task 3: UnifiedDataSourceAdapter (collapse 3→1)

- [ ] **3.1 Write failing tests:** `UnifiedDataSourceAdapterTest` — internal:// FORM list→BizDataPageVO；internal:// SYSTEM dept-tree；external API list with parse/totalParse；read-only → 400. (迁移旧 Form/System/Api adapter 测试。)
- [ ] **3.2 Run → RED.**
- [ ] **3.3 Implement** `engine/datasource/UnifiedDataSourceAdapter.java`:
  - if action starts with `internal://` → router.execute(...)
  - else → HttpLogicExecutor.execute(...) (原 ApiDataSourceAdapter 逻辑)
  - metadata：internal 走 metadata 接口；API 走 params.columns
- [ ] **3.4 Delete** `FormDataSourceAdapter.java` + `SystemDataSourceAdapter.java` (bean 移除)；在 `DataSourceDefinitionService` 让 `adapters` 仅含 UnifiedDataSourceAdapter。
- [ ] **3.5 Run → GREEN** (`mvn test`); fix compile errors from removed adapters.
- [ ] **3.6 Commit** `refactor(datasource): unify to single HTTP adapter`.

## Task 4: Auto-params + DataSourceDefinitionService

- [ ] **4.1 Write failing test:** `DataSourceDefinitionServiceTest` — enable FORM 回填 `/api/v1/biz-data/{formKey}` params；enable SYSTEM 回填 `/api/v1/internal/system/{internalKey}`；SYSTEM 非法 key→400。
- [ ] **4.2 Run → RED.**
- [ ] **4.3 Implement** paramsGenerator in `DataSourceDefinitionService`: read-only params JSON (list/get/create/update/delete action + parse/totalParse) for FORM/SYSTEM。
- [ ] **4.4 Run → GREEN** (`mvn test -Dtest=DataSourceDefinitionServiceTest`).
- [ ] **4.5 Commit** `feat(datasource): auto-generate read-only params for FORM/SYSTEM`.

## Task 5: 前端单页签配置

- [ ] **5.1 Write failing test:** `DataSourceListPage.spec.ts` — SYSTEM 类型仅读展示；API 类型可编辑；type 切换不丢失。
- [ ] **5.2 Run → RED** (`npm run test:unit -- DataSourceListPage`).
- [ ] **5.3 Refactor** `frontend/src/views/dataSource/DataSourceListPage.vue`：单 API 配置页签；type 选择器→自动回显只读 / API 可编辑。
- [ ] **5.4 Run → GREEN** + lint (`npm run lint`).
- [ ] **5.5 Commit** `feat(frontend): single API config tab`.

## Task 6: 回归 & E2E

- [ ] **6.1** `mvn test` (全模块) — 确认旧 adapter 移除后无残留引用。
- [ ] **6.2** `npm run build` — 前端编译。
- [ ] **6.3** E2E：product-dashboard 左右树切换 FORM/SYSTEM 数据源 → 走 UnifiedDataSourceAdapter。
- [ ] **6.4 Commit** `test: e2e datasource unification`.

> 提示：实现完成后由用户执行 `/opsx-apply` 进入实现阶段；本 plan.md 为 `/opsx-ff` 产物，供 apply 解析微任务。
