# form-create 选项数据数据源绑定实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改 form-create 依赖源码的前提下，为选项类组件增加可配置的数据源绑定和运行时选项转换。

**Architecture:** 在项目自有 vendor 层新增标准化 datasource 配置模型与 resolver。规则配置只保存 datasource 描述，配置界面复用 DataPicker/LookupPicker 的数据源选择和过滤约定；设计器预览与正式渲染共用 resolver，数据源无效或不存在时保留旧 options/effect.fetch 路径。

**Tech Stack:** Vue、TypeScript/JavaScript、现有 `dataSourceApi`、form-create vendor 规则、项目现有前端测试与构建工具。

## Global Constraints

- 不修改 form-create 依赖源码。
- 第一版只支持 FORM、SYSTEM、API、WORKFLOW 现有数据源。
- 数据源绑定必须可序列化并兼容没有 datasource 节点的历史 schema。
- 每个新增行为先写失败测试，再写最小实现。
- 不新增后端端点；复用现有数据源查询 API。

---

### Task 1: 数据源配置模型与查询适配器

**Files:**
- Create: `frontend/src/vendor/datasource/optionDataSource.ts`（若项目现有目录约定不同，以 vendor 下实际模块为准）
- Modify: `frontend/src/api/dataSource.ts`
- Test: `frontend/src/vendor/datasource/optionDataSource.test.ts`

**Interfaces:**
- Produces `OptionDataSourceConfig`：`type`, `sourceKey`, `formKey`, `filters`, `labelField`, `valueField`, `childrenField?`, `parentField?`。
- Produces `resolveOptionDataSource(config, queryContext): Promise<OptionNode[]>`。
- Produces `mapOptionRecords(records, config): OptionNode[]`，普通记录输出 `{ label, value }`，树形记录追加 children。

- [ ] **Step 1: Write the failing tests** for FORM/API/SYSTEM/WORKFLOW config normalization, label/value mapping, tree mapping, empty records, and invalid required fields.
- [ ] **Step 2: Run the focused test** with the repository’s frontend test command and confirm the resolver/model assertions fail before implementation.
- [ ] **Step 3: Implement the typed config and pure record mapper** using the existing data source API response shape; reject missing label/value mappings without adding legacy fallbacks.
- [ ] **Step 4: Implement the query adapter** that translates the config into the existing `dataSourceApi` call and returns normalized records.
- [ ] **Step 5: Run the focused tests** and confirm all model/mapper/query tests pass.
- [ ] **Step 6: Commit** with `git add frontend/src/vendor/datasource frontend/src/api/dataSource.ts` and `git commit -m "feat: add option datasource resolver"`.

### Task 2: 两页签数据源配置弹窗

**Files:**
- Create or modify: `frontend/src/vendor/components/DataSourceConfig.vue`
- Modify or extract: `frontend/src/views/form/components/DsBindingConfigDialog.vue` data-source tab logic
- Test: existing frontend component test location for vendor components

**Interfaces:**
- Consumes `OptionDataSourceConfig` and emits `update:modelValue`/project-equivalent v-model events.
- Produces a serializable configuration containing source selection, filters, label/value mapping, and optional hierarchy mapping.

- [ ] **Step 1: Write failing component tests** for opening the two-tab dialog, selecting a source in the reused data-source tab, loading metadata, saving four field mappings, and validating missing mappings.
- [ ] **Step 2: Run focused component tests** and verify the new component behavior fails.
- [ ] **Step 3: Reuse or extract the `DsBindingConfigDialog` data-source tab** instead of duplicating source selection and filter forms.
- [ ] **Step 4: Add only four dropdown controls** (显示字段、值字段、子节点字段、父节点字段), make children/parent mutually exclusive, and wire save/cancel events to the serialized model.
- [ ] **Step 5: Run focused component tests** and verify configuration, validation, and re-open behavior pass.
- [ ] **Step 6: Commit** the configuration UI and its tests with `git commit -m "feat: add option datasource config"`.

### Task 3: 规则工厂与 vendor 注册

**Files:**
- Modify: `frontend/src/vendor/utils/index.js`
- Modify: `frontend/src/vendor/config/rule/select.js`
- Modify: `frontend/src/vendor/config/rule/cascader.js`
- Modify: `frontend/src/vendor/config/rule/transfer.js`
- Modify: `frontend/src/vendor/config/rule/treeSelect.js` and other rules using the common options factory
- Modify: `frontend/src/vendor/index.js`
- Modify: `frontend/src/vendor/locale/zh-cn.js`
- Test: rule factory/registration test location used by the frontend project

**Interfaces:**
- `makeOptionsRule` exposes datasource option value `6` and renders `DataSourceConfig`.
- All affected rules persist datasource config independently of `effect.fetch`.

- [ ] **Step 1: Write failing rule tests** asserting datasource option presence, component registration, localized labels, and independent schema persistence.
- [ ] **Step 2: Run focused rule tests** and confirm they fail.
- [ ] **Step 3: Add datasource option type `6` to the project-owned rule factory** while leaving values 1, 2, 4, and 5 unchanged.
- [ ] **Step 4: Register `DataSourceConfig` and wire the affected rules**; clear datasource state when switching back to another option type.
- [ ] **Step 5: Add Chinese locale text** for “数据源” and “配置数据源”.
- [ ] **Step 6: Run rule tests and frontend type/lint checks** relevant to modified files; confirm form-create package files remain untouched.
- [ ] **Step 7: Commit** with `git commit -m "feat: expose datasource option type"`.

### Task 4: 设计器预览与正式渲染接入

**Files:**
- Modify: `frontend/src/views/form/components/FormRenderer.vue`
- Modify: `frontend/src/views/form/FormDesigner.vue` if preview uses a separate path
- Modify or create: shared vendor option resolver integration module
- Test: `frontend/src/views/form/components/FormRenderer` tests and resolver integration tests

**Interfaces:**
- Consumes `resolveOptionDataSource(config, queryContext)` from Task 1.
- Produces form-create rules whose options are populated from datasource results before component consumption.

- [ ] **Step 1: Write failing integration tests** for datasource precedence, legacy static/JSON/text/fetch behavior, preview/form rendering parity, empty data, failed request, and switching back to static options.
- [ ] **Step 2: Run focused integration tests** and confirm failures identify the missing runtime hook.
- [ ] **Step 3: Add the shared runtime hook** so valid datasource bindings resolve before options are passed to select/cascader/transfer/tree consumers.
- [ ] **Step 4: Preserve the old path** when datasource is absent, invalid, or explicitly cleared; expose request errors through the existing component status convention.
- [ ] **Step 5: Run focused integration tests**, then run the full frontend test suite and production build.
- [ ] **Step 6: Commit** with `git commit -m "feat: load form options from datasource"`.

### Task 5: 完整验证与交付记录

**Files:**
- Test: all tests added in Tasks 1-4
- Verify: `openspec/changes/form-create-datasource-binding/verify.md`

- [ ] **Step 1: Run the frontend type check, lint, focused tests, full tests, and production build** from the repository’s documented commands; record exact results.
- [ ] **Step 2: Inspect the final diff** to verify only project-owned frontend files and change artifacts changed, with no form-create dependency source edits.
- [ ] **Step 3: Manually exercise** designer configuration, save/reopen, preview, and rendered form for one normal list and one tree data source.
- [ ] **Step 4: Write `verify.md`** with commands, pass/fail output, residual risks, and the compatibility check.
- [ ] **Step 5: Commit** verification records and any artifact-only updates with `git commit -m "chore: verify form option datasource binding"`.
