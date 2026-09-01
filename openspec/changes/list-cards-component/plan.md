# ListCards Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏 SearchTable 的前提下，为代码页面和 form-create 页面设计器提供统一数据契约驱动的结构化数据型卡片列表。

**Architecture:** 保持 SearchTable 与 ListCards 独立渲染，复用分页查询、字段和操作语义。ListCards 使用 Element Plus 原语管理查询状态、响应式网格、卡片字段、CRUD、错误/空状态和分页；页面设计器通过 `page-list-cards` 与既有 dataSourceId/action-bus 链路接入。

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Element Plus, form-create Element UI, Vitest, Vue Test Utils, Vite/Vue TSC。

## Global Constraints

- MUST 使用 `fetchApi -> Promise<{ rows, total }>` 与 `page/size/filter/sort` 查询契约。
- MUST 支持 `fetchApi` 和 `dataSourceId`，设计器配置 MUST 为 JSON 可序列化值。
- MUST 使用 Element Plus，不新增 Ant Design Vue、Naive UI 或 Vuetify 依赖。
- 首版 MUST NOT 实现选择/批量操作、无限滚动、虚拟滚动或卡片内部任意 form-create rule。
- 所有功能变更采用 TDD（先写失败测试，再写最小实现，再回归）。

---

## Task 1: Shared contracts and card field model

**Files:**
- Modify: `frontend/src/components/business/types.ts`
- Test: `frontend/src/components/business/__tests__/ListCards.test.ts`

**Interfaces:**
- Produces `ListQueryParams`, `ListPageResult<T>`, `CardColumn`, and ListCards prop/action types consumed by later tasks.

- [ ] **Step 1: Write the failing type/behavior test** for a row with `title`, `subtitle`, `tag`, hidden, formatter, and valueType fields.
- [ ] **Step 2: Run** `npm --prefix frontend exec vitest run src/components/business/__tests__/ListCards.test.ts` and confirm the new component/types are absent.
- [ ] **Step 3: Add** serializable card-column unions and the shared paged result/query interfaces without changing existing TableColumn fields.
- [ ] **Step 4: Run** `npm --prefix frontend exec vue-tsc --noEmit` and confirm the contracts type-check.
- [ ] **Step 5: Commit** the contracts and their test together with a focused feature commit.

## Task 2: Core ListCards query state and rendering

**Files:**
- Create: `frontend/src/components/business/ListCards.vue`
- Test: `frontend/src/components/business/__tests__/ListCards.test.ts`

**Interfaces:**
- Consumes `ListQueryParams`, `ListPageResult`, `CardColumn`.
- Produces `ListCards` props/events: `fetchApi`, rows/total state, `row-click`, retry, page/size changes, card field rendering.

- [ ] **Step 1: Add failing tests** for initial fetch, `{ rows, total }` rendering, hidden fields, title/subtitle/field roles, and formatter output.
- [ ] **Step 2: Run** `npm --prefix frontend exec vitest run src/components/business/__tests__/ListCards.test.ts` and verify failures.
- [ ] **Step 3: Implement** the minimal fetch lifecycle with request sequence protection, default page/size, and replacement of rows/total.
- [ ] **Step 4: Implement** the fixed title/field/action card structure with CSS Grid and `cardMinWidth`/responsive column support.
- [ ] **Step 5: Add** loading skeleton, Element Plus empty state, error state with retry, and deterministic fallback for invalid roles.
- [ ] **Step 6: Run** the focused test file and confirm all core scenarios pass.
- [ ] **Step 7: Run** `npm --prefix frontend run build` and fix only errors introduced by this component.
- [ ] **Step 8: Commit** ListCards implementation and direct tests together.

## Task 3: Pagination, click isolation, and CRUD actions

**Files:**
- Modify: `frontend/src/components/business/ListCards.vue`
- Modify: `frontend/src/components/business/types.ts`
- Test: `frontend/src/components/business/__tests__/ListCards.test.ts`

**Interfaces:**
- Consumes existing `ActionButton`, `FormConfig`, permission and confirmation conventions from SearchTable.
- Produces bottom pagination, isolated card/action click behavior, and create/edit/delete/view/custom action hooks.

- [ ] **Step 1: Add failing tests** for bottom pagination, reset-to-first-page after query changes, `row-click`, action click stopping propagation, visibility and read-only action filtering.
- [ ] **Step 2: Run** the focused tests and confirm failures.
- [ ] **Step 3: Implement** `el-pagination` binding to page/size/total and reload behavior, including page reset on data-source/query identity changes.
- [ ] **Step 4: Implement** card click emission and action event isolation; reuse existing ActionButton callback/permission/confirm contracts rather than inventing a second action format.
- [ ] **Step 5: Wire** view/create/edit/delete to the existing form configuration path and refresh after successful writes.
- [ ] **Step 6: Run** focused tests plus `npm --prefix frontend run build`.
- [ ] **Step 7: Commit** pagination/action behavior with its regression tests.

## Task 4: Public export and page data-source wrapper

**Files:**
- Modify: `frontend/src/components/business/index.ts`
- Create: `frontend/src/views/page/components/PageDataCards.vue`
- Test: `frontend/src/views/page/components/__tests__/PageDataCards.test.ts`

**Interfaces:**
- Consumes `dataSourceApi`, `activeDsBindings`, existing `PageDataTable` data-source and action-bus conventions.
- Produces page-level `PageDataCards` with `dataSourceId`, optional `dsRefId`, metadata-derived columns, records/loaded/ready events, and writable action filtering.

- [ ] **Step 1: Add failing wrapper tests** for valid binding, unresolved binding, metadata columns, and read-only data source.
- [ ] **Step 2: Run** `npm --prefix frontend exec vitest run src/views/page/components/__tests__/PageDataCards.test.ts` and verify failures.
- [ ] **Step 3: Implement** refId resolution using the existing store/path; unresolved bindings MUST skip invalid requests and show a deterministic renderable error state.
- [ ] **Step 4: Implement** metadata-to-card-column adaptation and page query adapter returning `{ rows, total }`.
- [ ] **Step 5: Register** the public business component export and run wrapper tests plus `npm --prefix frontend run build`.
- [ ] **Step 6: Commit** the page wrapper, export, and direct tests together.

## Task 5: form-create/page designer registration

**Files:**
- Modify: `frontend/src/views/form/components/FormRenderer.vue`
- Modify: relevant form-create registry/designer configuration files identified by existing `page-table` registration
- Test: `frontend/src/views/form/components/__tests__/FormRenderer.test.ts` or a focused `PageListCards.test.ts`

**Interfaces:**
- Consumes `PageDataCards` and serializable `page-list-cards` props.
- Produces runtime recognition, rendering, defaults, structured field configuration, metadata refresh, and action-bus integration.

- [ ] **Step 1: Add failing tests** for loading a saved `page-list-cards` rule, JSON serialization without functions, default props, unsupported role fallback, and dataSourceId mapping.
- [ ] **Step 2: Run** the focused form-create tests and confirm failures.
- [ ] **Step 3: Register** `page-list-cards` beside the existing page-table runtime mapping without changing old schema behavior.
- [ ] **Step 4: Add** structured property configuration for card roles, value types, min width/columns, pagination/search, and actions; do not expose arbitrary nested rule editing.
- [ ] **Step 5: Connect** metadata and action-bus behavior, including hiding/disabling write actions for read-only data sources.
- [ ] **Step 6: Run** focused tests and `npm --prefix frontend run build`.
- [ ] **Step 7: Commit** designer/runtime registration and tests together.

## Task 6: Documentation and integration regression

**Files:**
- Modify: `docs/features.md` or the project’s existing component/configuration documentation
- Test: existing page renderer/form renderer suites and new ListCards suites

- [ ] **Step 1: Add** a documented code usage example and a serialized `page-list-cards` example, including explicit first-version non-goals.
- [ ] **Step 2: Run** `npm --prefix frontend test -- --run` and record the complete result.
- [ ] **Step 3: Run** `npm --prefix frontend run build` and confirm TypeScript/Vite success.
- [ ] **Step 4: Run** targeted page-designer smoke verification for query, pagination, CRUD, click isolation, and responsive grid behavior; record any manual-only check for later verification.
- [ ] **Step 5: Review** changed files for stale generated output, unhandled function values in serialized config, and accidental SearchTable behavior changes.
- [ ] **Step 6: Commit** documentation and final regression adjustments.
