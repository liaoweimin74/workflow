## 1. 类型定义更新

- [ ] 1.1 在 `frontend/src/components/business/DataSourceConfigPanel.vue` 中定义 `DataSourceFilter` 和 `FilterCondition` 类型
- [ ] 1.2 扩展 `DataSourceBinding` 接口，添加可选的 `filter` 字段

## 2. LookupPicker 组件重构

- [ ] 2.1 重构 `LookupPickerConfigDialog.vue`，去除 sourceType、sourceFormKey、action、method、headers、data 等表单项
- [ ] 2.2 添加 dataSourceId 下拉选择（从 formDataSources prop 获取）
- [ ] 2.3 添加组件级 filter 配置 UI（复用现有 filterRows 逻辑）
- [ ] 2.4 修改 handleConfirm，输出简化后的 props 结构
- [ ] 2.5 修改 watch 回填逻辑，适配新的 props 结构

## 3. DataPicker 组件重构

- [ ] 3.1 重构 `DataPickerConfigDialog.vue`，去除 sourceFormKey 直接选表单
- [ ] 3.2 添加 dataSourceId 下拉选择（从 formDataSources prop 获取）
- [ ] 3.3 添加组件级 filter 配置 UI（复用现有 filterRows 逻辑）
- [ ] 3.4 修改 handleConfirm，输出简化后的 props 结构
- [ ] 3.5 修改 watch 回填逻辑，适配新的 props 结构

## 4. FormDesigner 适配

- [ ] 4.1 简化传递给 LookupPickerConfigDialog 的 props（去除 targetForms、enabledDataSources）
- [ ] 4.2 简化传递给 DataPickerConfigDialog 的 props（去除 targetForms）
- [ ] 4.3 修改 handleLookupSourceChange 和 handlePickerSourceChange，适配新的数据源引用方式

## 5. Filter 合并工具函数

- [ ] 5.1 创建 `mergeFilters(dsFilter, componentFilter)` 工具函数
- [ ] 5.2 在组件查询数据时调用 mergeFilters 合并 filter

## 6. 运行期 field 引用解析

- [ ] 6.1 创建 `resolveFilterFieldReferences(filter, formData)` 工具函数
- [ ] 6.2 在查询数据源前调用解析函数，将 field 引用替换为实际值

## 7. 测试

- [ ] 7.1 为 mergeFilters 函数编写单元测试
- [ ] 7.2 为 resolveFilterFieldReferences 函数编写单元测试
- [ ] 7.3 验证 LookupPicker 和 DataPicker 组件在设计器中正常工作
