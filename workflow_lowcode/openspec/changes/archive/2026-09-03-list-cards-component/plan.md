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

## Task 0: Shared Configuration Extension (先做共享配置)

### 0.1 QueryColumnsConfig 卡片模式扩展

- [ ] **Step 1:** 读取 QueryColumnsConfig.vue 理解当前字段配置结构
- [ ] **Step 2:** 保留公共字段/查询属性（metadata candidates、display/hidden/order/label、search/filter/sort、custom、formatter/template/expression），并添加 card-specific 属性到 CardColumn 配置
- [ ] **Step 3:** 在 QueryColumnsConfig 中增加 card mode 扩展入口，公共字段编辑逻辑不复制
- [ ] **Step 4:** 添加 CardColumnAdvancedConfig.vue 用于卡片专属高级配置（role/layout/valueType/prefix/suffix/color/truncate）
- [ ] **Step 5:** 编写可测试场景：验证卡片角色配置保存为 JSON 可序列化

### 0.2 ActionsConfig 卡片模式支持

- [ ] **Step 1:** 扩展 ActionsConfig 支持 card/item placement，保留 CRUD、权限、确认、事件链、详情、表单模式和表单容器联动
- [ ] **Step 2:** 添加可测试场景：验证卡片模式下按钮 placement 正确映射且旧 column 配置兼容

### 0.3 EventsConfig 卡片触发器

- [ ] **Step 1:** 增加 card capability 过滤；保留 row-click、refresh、CRUD success、open-container、load-record、save-container、close-container
- [ ] **Step 2:** 添加可测试场景：验证 card 仍可联动 form-container，且仅隐藏首版不支持的 selection/cell 能力

### 0.4 DsBindingConfigDialog 双模式支持

- [ ] **Step 1:** 将 table/card 视为 list display 模式，复用数据源、字段、操作、事件配置
- [ ] **Step 2:** 保留容器 binding 模式的配置
- [ ] **Step 3:** 添加可测试场景：验证 tableMode false 时显示容器配置

---

## Task 1: Shared contracts and card field model

- [ ] 1.1 Extend `frontend/src/components/business/types.ts` with serializable ListCards query/result and card-column/action types - expect shared TypeScript contracts for fetchApi, dataSourceId, roles, value types, and responsive layout
- [ ] 1.2 Add `frontend/src/components/business/ListCards.vue` with fetch lifecycle, request race protection, structured card areas, and Element Plus states - expect standalone data-card renderer without SearchTable regressions
- [ ] 1.3 Add `frontend/src/components/business/__tests__/ListCards.test.ts` for initial query, pagination, loading, empty, error/retry, formatters, and event isolation - expect executable coverage of core rendering behavior

## Task 2: CRUD and business integration

- [ ] 2.1 Reuse existing SearchTable action/form conventions in ListCards for view/create/edit/delete/custom actions - expect permission, confirmation, and refresh behavior consistent with existing lists
- [ ] 2.2 Add ListCards export in `frontend/src/components/business/index.ts` and verify existing imports/build - expect public component availability without changing current callers
- [ ] 2.3 Add integration tests for CRUD action visibility, read-only metadata, and row-click versus action-click behavior - expect no action bubbling and correct writable handling

## Task 3: Pages wrapper

- [ ] 3.1 Add a page-level card list wrapper beside `frontend/src/views/page/components/PageDataTable.vue` - expect dataSourceId resolution through the existing unified data-source API and `{ rows, total }` adapter
- [ ] 3.2 Add page wrapper tests for valid, unresolved, and read-only data-source bindings - expect deterministic error handling and action filtering

## Task 4: form-create and designer support

- [ ] 4.1 Register `page-list-cards` in the form-create/runtime component registry and render mapping - expect saved rules to instantiate ListCards
- [ ] 4.2 Add structured card property configuration using existing table column/data-source configuration patterns - expect serializable columns, roles, value types, layout, pagination, and actions
- [ ] 4.3 Add form-create/page-renderer tests for rule serialization, metadata refresh, defaults, and unsupported role fallback - expect backward-compatible rendering and JSON-only configuration

## Task 5: Validation and documentation

- [ ] 5.1 Run frontend unit tests and TypeScript/Vite build, fixing only regressions introduced by this change - expect green automated validation
- [ ] 5.2 Run targeted page-designer smoke verification at the existing integration boundary - expect card query, pagination, CRUD, and responsive layout evidence
- [ ] 5.3 Update relevant component/configuration documentation with ListCards examples and explicit non-goals - expect maintainers can configure code and designer variants
