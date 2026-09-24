# Simplify Component DataSource Config Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 简化查找带回和数据引用组件的数据源配置，统一使用页面数据源绑定，支持 filter 两层继承机制。

**Architecture:** 组件通过 dataSourceId 引用页面数据源绑定（DataSourceBinding），不再维护独立的数据源配置。filter 支持数据源级和组件级两层，运行期 AND 合并。全局数据源已包含 API 配置（headers/params），组件无需重复。

**Tech Stack:** Vue 3 + TypeScript + Element Plus + form-create

---

## Task 1: 类型定义更新

- [ ] **Step 1:** 在 `frontend/src/components/business/DataSourceConfigPanel.vue` 中定义 `DataSourceFilter` 和 `FilterCondition` 接口
- [ ] **Step 2:** 扩展 `DataSourceBinding` 接口，添加可选的 `filter?: DataSourceFilter` 字段
- [ ] **Step 3:** 导出新类型供其他组件使用

## Task 2: LookupPicker 组件重构

- [ ] **Step 1:** 删除 LookupPickerConfigDialog.vue 中的 sourceType、sourceFormKey、action、method、headers、data 等表单项
- [ ] **Step 2:** 添加 dataSourceId 下拉选择（从 formDataSources prop 获取可用绑定）
- [ ] **Step 3:** 添加组件级 filter 配置 UI（复用现有 filterRows 逻辑）
- [ ] **Step 4:** 修改 handleConfirm，输出简化后的 props 结构（仅 dataSourceId + 显示/映射配置）
- [ ] **Step 5:** 修改 watch 回填逻辑，适配新的 props 结构（从 pickerProps 读取 dataSourceId）

## Task 3: DataPicker 组件重构

- [ ] **Step 1:** 删除 DataPickerConfigDialog.vue 中的 sourceFormKey 直接选表单
- [ ] **Step 2:** 添加 dataSourceId 下拉选择（从 formDataSources prop 获取可用绑定）
- [ ] **Step 3:** 添加组件级 filter 配置 UI（复用现有 filterRows 逻辑）
- [ ] **Step 4:** 修改 handleConfirm，输出简化后的 props 结构（仅 dataSourceId + 显示/行为配置）
- [ ] **Step 5:** 修改 watch 回填逻辑，适配新的 props 结构

## Task 4: FormDesigner 适配

- [ ] **Step 1:** 简化传递给 LookupPickerConfigDialog 的 props（去除 targetForms、enabledDataSources，添加 formDataSources）
- [ ] **Step 2:** 简化传递给 DataPickerConfigDialog 的 props（去除 targetForms，添加 formDataSources）
- [ ] **Step 3:** 修改 handleLookupSourceChange，适配新的数据源引用方式（通过 dataSourceId 加载元数据）
- [ ] **Step 4:** 修改 handlePickerSourceChange，适配新的数据源引用方式

## Task 5: Filter 合并工具函数

- [ ] **Step 1:** 创建 `frontend/src/utils/filterMerge.ts`，实现 `mergeFilters(dsFilter, componentFilter)` 函数
- [ ] **Step 2:** 实现 AND 合并逻辑：两层 filter 的 conditions 数组合并
- [ ] **Step 3:** 处理边界情况：单层 filter、空 filter、logic 不同时的合并

## Task 6: 运行期 field 引用解析

- [ ] **Step 1:** 创建 `frontend/src/utils/filterResolve.ts`，实现 `resolveFilterFieldReferences(filter, formData)` 函数
- [ ] **Step 2:** 遍历 filter.conditions，将 source='field' 的条件的 value 替换为 formData[field]
- [ ] **Step 3:** 处理 field 不存在的情况（跳过或使用空值）

## Task 7: 测试

- [ ] **Step 1:** 为 mergeFilters 函数编写单元测试（覆盖单层、双层、空 filter 场景）
- [ ] **Step 2:** 为 resolveFilterFieldReferences 函数编写单元测试（覆盖 field 存在/不存在场景）
- [ ] **Step 3:** 在设计器中验证 LookupPicker 和 DataPicker 组件正常工作
