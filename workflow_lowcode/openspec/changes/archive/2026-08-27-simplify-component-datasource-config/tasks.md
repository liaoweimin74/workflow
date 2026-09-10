## 1. 类型定义更新

- [x] 1.1 在 `frontend/src/components/business/DataSourceConfigPanel.vue` 中定义 `DataSourceBinding.filter` 字段（复用现有 `LookupFilterConfig`）
- [x] 1.2 在 `frontend/src/components/business/types.ts` 中添加 `FORM_DS_BINDINGS_KEY` 和 `DataSourceBindingContext`

## 2. LookupPicker 组件重构

- [x] 2.1 重构 `LookupPickerConfigDialog.vue`，去除 sourceType、sourceFormKey、action、method、headers、data 等表单项
- [x] 2.2 添加 dataSourceId 下拉选择（从 formDataSources prop 获取）
- [x] 2.3 添加组件级 filter 配置 UI（复用现有 filterRows 逻辑）
- [x] 2.4 修改 handleConfirm，输出简化后的 props 结构
- [x] 2.5 修改 watch 回填逻辑，适配新的 props 结构

## 3. DataPicker 组件重构

- [x] 3.1 重构 `DataPickerConfigDialog.vue`，去除 sourceFormKey 直接选表单
- [x] 3.2 添加 dataSourceId 下拉选择（从 formDataSources prop 获取）
- [x] 3.3 添加组件级 filter 配置 UI（复用现有 filterRows 逻辑）
- [x] 3.4 修改 handleConfirm，输出简化后的 props 结构
- [x] 3.5 修改 watch 回填逻辑，适配新的 props 结构

## 4. FormDesigner 适配

- [x] 4.1 简化传递给 LookupPickerConfigDialog 的 props（去除 targetForms、enabledDataSources、sourceChange）
- [x] 4.2 简化传递给 DataPickerConfigDialog 的 props（去除 targetForms、sourceChange）
- [x] 4.3 移除 handleLookupSourceChange 和 handlePickerSourceChange 及相关状态

## 5. Filter 合并工具函数

- [x] 5.1 创建 `frontend/src/utils/filterMerge.ts`，实现 `mergeFilters(dsFilter, componentFilter)`
- [x] 5.2 为 mergeFilters 编写单元测试（7 个场景）

## 6. 运行期 field 引用解析

- [x] 6.1 创建 `frontend/src/utils/filterResolve.ts`，实现 `resolveFilterFieldReferences(filter, formData)`
- [x] 6.2 为 resolveFilterFieldReferences 编写单元测试（7 个场景）

## 7. 运行时上下文提供

- [x] 7.1 `FormRenderer.vue` 中通过 provide 传递表单级数据源绑定（含从 schema.dataSources 自动加载）
- [x] 7.2 `PageRendererPage.vue` 中通过 provide 传递页面级数据源绑定
- [x] 7.3 扩展 `DataSourceQueryParams` 支持 filter 字段

## 8. 测试

- [x] 8.1 为 mergeFilters 函数编写单元测试（14/14 通过）
- [x] 8.2 为 resolveFilterFieldReferences 函数编写单元测试（14/14 通过）
- [ ] 8.3 在设计器中验证 LookupPicker 和 DataPicker 组件正常工作（需手动验证）
