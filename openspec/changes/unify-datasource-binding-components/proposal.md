## Why

前端数据源绑定和组件级筛选在数据表格、选择器、树形选择等配置弹窗中实现了，代码高度重复。数据表格的“配置数据源”弹窗中四个页签（数据源、显示列、操作、事件），其中“数据源”页签与 `DataSourceBindingTab.vue` 实现高度相似。四个配置入口（表格、数据引用、查找器、树形）都各实现一套数据源绑定逻辑，导致：
1. 代码重复：筛选行、数据源选择、列加载逻辑散落在多个文件
2. 维护困难：新增筛选操作或数据源类型时，需要在多个地方修改
3. 接口不统一：每个弹窗的内部 filter 结构略有差异（`fixedValue` vs `value`）

项目中已有 `DataSourceBindingTab.vue` 封装了数据源选择和组件级筛选，但从未被配置弹窗复用。统一后：
- 新增组件或筛选操作，仅需修改 `UnifiedDatasourceBinding`
- 所有配置弹窗使用同一数据源绑定入口
- 运行时组件通过统一接口读取绑定配置

## What Changes

1. **创建统一数据源绑定组件**：基于 `DataSourceBindingTab.vue` 创建 `UnifiedDatasourceBinding.vue`，支持：
   - 数据源选择和变更事件
   - 筛选条件管理（固定值 + 表单字段引用两种模式）
   - 列定义动态加载
   - 统一的 `DataSourceBindingConfig` 输出结构

2. **集成配置弹窗**：
   - `DsBindingConfigDialog.vue`：替换“数据源”页签内联表单
   - `DataPickerConfigDialog.vue`：同上
   - `LookupPickerConfigDialog.vue`：同上

3. **运行时适配**：
   - `PageDataTable.vue`、`PageDataCards.vue`、`PageDataTree.vue` 等读取统一配置结构
   - `DataPicker.vue`、`LookupPicker.vue` 读取统一数据源绑定配置

4. **兼容处理**：
   - 配置文件转换适配器
   - 向后兼容旧配置结构

## Capabilities

### New Capabilities

- `UnifiedDatasourceBinding.vue`：统一的数据源绑定和筛选配置组件，供配置弹窗和运行时组件复用。

### Modified Capabilities

- 所有配置弹窗的“数据源”页签将使用统一组件，前端代码重复显著减少。
- 运行时组件读取数据源和筛选配置的方式统一化。

## Impact

**前端**：
- `UnifiedDatasourceBinding.vue`（新）— 统一数据源绑定组件
- `DsBindingConfigDialog.vue` — 移除内联数据源表单，使用新组件
- `DataPickerConfigDialog.vue` — 同上
- `LookupPickerConfigDialog.vue` — 同上
- `PageDataTable.vue`、`PageDataCards.vue`、`PageDataTree.vue` — 适配统一配置结构读取
- `api/datasource.ts` — 如有接口变更，补充适配函数

**后端**：基本不受影响（配置结构在前端完成转换），如需迁移旧配置，由脚本完成。

**数据库**：不涉及。

**API**：不涉及。

**测试**：
- `UnifiedDatasourceBinding.test.ts`（新）— 单元测试
- 更新 `DsBindingConfigDialog.table.test.ts` 等集成测试
- 运行时组件的端到端测试验证配置正确读取