## Why

当前表单设计器和页面设计器中，查找带回（LookupPicker）和数据引用（DataPicker）组件各自维护独立的数据源配置（sourceType、sourceFormKey、apiUrl、headers 等），与页面级数据源绑定（DataSourceConfigPanel）功能重叠。这导致：1）配置分散，同一数据源在多处重复配置；2）维护成本高，改一处需同步多处；3）容易不一致。现在页面数据源绑定已完善，全局数据源已包含 headers/params 等 API 配置，是简化的合适时机。预期收益：配置入口单一，组件配置简化，一致性自动保证。

## What Changes

**LookupPickerConfigDialog 组件**
- From: 组件维护 sourceType(form/api)、sourceFormKey、action、method、headers、data 等完整数据源配置
- To: 组件只存储 dataSourceId（页面内标识），通过页面数据源绑定引用全局数据源
- Reason: 全局数据源已包含所有 API 配置，组件无需重复
- Impact: breaking，所有已发布的表单中 LookupPicker 组件配置需重新编辑（用户明确不需要兼容）

**DataPickerConfigDialog 组件**
- From: 组件直接选择 sourceFormKey（底表表单）
- To: 组件只存储 dataSourceId（页面内标识），通过页面数据源绑定引用全局数据源
- Reason: 统一数据源引用方式，避免配置分散
- Impact: breaking，所有已发布的表单中 DataPicker 组件配置需重新编辑

**DataSourceBinding 类型扩展**
- From: `{ id, refId, searchFields? }`
- To: `{ id, refId, searchFields?, filter?: DataSourceFilter }`
- Reason: 支持数据源级筛选条件，与组件级 filter 形成继承机制
- Impact: non-breaking，新增可选字段

## Capabilities

### New Capabilities
- `datasource-filter-inheritance`: 数据源级与组件级 filter 的两层继承机制，支持 AND 合并

### Modified Capabilities
- `lookup-picker-config`: 查找带回组件配置简化，去除独立数据源配置，改用 dataSourceId 引用
- `data-picker-config`: 数据引用组件配置简化，去除直接表单选择，改用 dataSourceId 引用

## Impact

**前端文件：**
- `frontend/src/views/form/components/LookupPickerConfigDialog.vue` — 大幅重构
- `frontend/src/views/form/components/DataPickerConfigDialog.vue` — 大幅重构
- `frontend/src/views/form/FormDesigner.vue` — props 传递简化
- `frontend/src/views/page/PageDesigner.vue` — 无需改动（已使用 DataSourceConfigPanel）
- `frontend/src/components/business/DataSourceConfigPanel.vue` — 需支持 filter 配置（可选后续）

**后端文件：**
- 无需改动，PageQueryController 已支持 dataSourceId → refId 解析

**类型定义：**
- `frontend/src/components/business/types.ts` — LookupFetchConfig 可能需要调整
