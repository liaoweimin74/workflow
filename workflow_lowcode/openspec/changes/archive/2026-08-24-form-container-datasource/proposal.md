# Proposal: FORM 容器数据源绑定

## Why

工作流表单、业务表单、系统结构、API 已接入统一数据源（`DataSourceAdapter` SPI + 六端点），但取数方式仍碎片化：表单设计器仅有 DataPicker/LookupPicker 两个特殊组件各自取数，页面设计器的表格/树组件单独绑定数据源，基础表单组件完全无法绑定数据源。用户希望业务表单、工作流表单、页面统一取数方式。

现处时机：统一数据源基建（SPI/元数据/增删改查端点/数据源管理页）已完成，FORM 容器方案仅需前端增量即可落地，无需改后端。预期收益：配置化数据联动能力（左树右表、表单回填）、消除重复取数逻辑、三端统一取数。

## What Changes

**新增 FORM 容器组件（值绑定）**
- From: 基础表单组件无法绑定数据源；取数仅限 DataPicker/LookupPicker/页面表格树
- To: 新增 FORM 容器组件（`subForm: 'object'`），可绑定全局数据源 + 记录定位；基础组件拖入容器内即继承数据源上下文；一个表单可含多个容器（各自绑定不同数据源）
- Reason: 容器方案配置面小（数据源配一次子组件继承）、语义清晰（容器=一条记录）、天然解决多数据源字段命名冲突（容器即命名空间）
- Impact: 非破坏性。新增能力，存量表单零迁移（引擎扫描无容器即 no-op）

**渲染层数据源绑定引擎（读/写）**
- From: 表单渲染无数据源读写能力
- To: 引擎按容器加载记录回显（读：记录上下文变化 → `getData` → 填充），组件值变化防抖实时写回（写：`updateData` 乐观锁）
- Reason: 实现"值绑定"核心能力，三端（业务表单/工作流表单/页面）共用一套引擎
- Impact: 非破坏性。FormRenderer/PageRendererPage 挂载，无容器即跳过

**统一联动模型（事件总线 + 模板变量 + 动作链）**
- From: 页面动作总线仅支持 node-click/row-click 触发器，表单场景无数据源联动
- To: 触发器泛化（field-change/record-change/data-source-change），动作含 set-filter/refresh/reload-record/set-value/save-record，模板变量 `{node.id}/{row.xxx}/{field.xxx}/{record.xxx}/{param.xxx}` 统一上下文
- Reason: 复用并泛化 PageDesigner 已验证的动作总线模型，贯穿四层联动（L1 数据源→组件、L2 组件→数据源、L3 组件→组件、L4 组件→数据源→组件）
- Impact: 非破坏性。页面动作总线保留，新增表单场景联动配置

## Capabilities

### New Capabilities
- `form-container-datasource`: FORM 容器组件（绑定数据源 + 记录定位 + 子组件继承 + 内嵌子表单），渲染层绑定引擎（读回显/写保存/乐观锁），统一联动模型（事件总线 + 模板变量 + 动作链）——三端（业务表单/工作流表单/页面）统一取数

### Modified Capabilities
- `form-designer`: 组件面板新增 FORM 容器组件；属性面板支持数据源下拉 + 记录定位配置
- `form-runtime`: FormRenderer 挂载绑定引擎，支持容器数据源读回显/写保存
- `custom-page-designer`: 页面可注册 FORM 容器组件；动作总线触发器泛化（field-change）

## Impact

- **前端**：`frontend/src/vendor/config/rule/formContainer.js`（新增容器规则）、`frontend/src/vendor/config/index.js`（注册）、`frontend/src/views/form/components/DsBindingEngine.ts`（新增引擎）、`DsActionBus.ts`（新增联动总线）、`FormRenderer.vue`（挂载引擎）、`FormDesigner.vue`（容器属性面板）、`PageDesigner.vue`/`PageRendererPage.vue`（容器注册 + 动作泛化）
- **后端**：无改动（复用现成 DataSourceAdapter SPI：metadata/query/get/create/update/delete）
- **数据**：表单 schema 新增容器节点（`type: formContainer` + `props.dataSourceId/recordLocator` + `children`），与现有 rule 结构兼容
- **依赖**：无新增依赖（form-create 容器机制原生支持）
