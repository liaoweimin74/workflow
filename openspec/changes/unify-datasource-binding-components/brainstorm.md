# Brainstorm: 统一数据源绑定组件

## 背景

前端页面设计器中，数据表格、选择器、树形选择等组件都需要绑定数据源。当前数据源绑定和筛选配置散落在多个配置弹窗中：

- `DsBindingConfigDialog.vue`：数据的源页签是内联实现
- `DataPickerConfigDialog.vue`：同样内联实现
- `LookupPickerConfigDialog.vue`：同样内联实现
- `DataSourceBindingTab.vue`：已是一个独立的、封装了数据源选择和组件级筛选的组件

## 探索发现

### 现有配置入口

| 组件 | 位置 | 数据源页签状态 | 筛选支持 |
|---|---|---|---|
| DsBindingConfigDialog | form/components | 内联实现 | 支持 |
| DataPickerConfigDialog | form/components | 内联实现 | 支持 |
| LookupPickerConfigDialog | form/components | 内联实现 | 支持 |
| DataSourceConfigPanel | components/business | 独立组件 | 仅页面级管理 |
| DataSourceBindingTab | form/components | 独立组件 | 支持组件级筛选 |

### 运行时组件调用方

- `PageDataTable.vue`：调用 DsBindingConfigDialog
- `PageDataCards.vue`：调用 DsBindingConfigDialog
- `PageDataTree.vue`：调用 DataPickerConfigDialog
- `LookupPicker.vue`：调用 LookupPickerConfigDialog
- `DataPicker.vue`：调用 DataPickerConfigDialog

### 问题分析

1. **结构重复**：`DataSourceBindingTab.vue` 已封装了数据源选择、筛选条件，但当前配置弹窗都内置了类似逻辑
2. **接口不匹配**：`DsBindingConfigDialog.vue` 输出的 filter 用 `fixedValue` 和 `value` 混合，`DataSourceBindingTab.vue` 输出不同结构
3. **页面级 vs 组件级**：`DataSourceConfigPanel.vue` 管理的是页面级数据源，不适用于组件绑定
4. **跨页签联动**：数据源页签修改后要触发列元数据加载，父子组件传递较频繁

## 候选方案

### 方案 A：直接复用 DataSourceBindingTab

**优点**：
- 最小改动，直接抽离现有组件
- 已有测试覆盖原型

**缺点**：
- 需要统一输入输出结构
- 现有弹窗的筛选行结构与组件不匹配

### 方案 B：创建新组件统一抽象

**优点**：
- 设计时就考虑复用
- 可支持配置式筛选行

**缺点**：
- 需要在多个弹窗中引入
- 语义映射工作量大

### 方案 C：形状不变，仅抽离数据源页签

**优点**：
- 最少改动
- 快速落地

**缺点**：
- 长期仍有重复
- 难以复用到运行时组件

## 需要确认的问题

1. `DataSourceBindingTab.vue` 和 `DsBindingConfigDialog.vue` 的 filter 输出结构是否可直接复用？
2. 哪些筛选条件是“固定值”模式，哪些需要“表单字段”引用？
3. 页面数据源绑定是否需要与数据源管理（DataSourceConfigPanel）分离？

## 推荐方向

**方案 B+**：
1. 以 `DataSourceBindingTab.vue` 为蓝本，创建 `DatasourceBinding.vue` 统一入口
2. 统一 TypeScript 接口：`DataSourceBindingProps`、`DataSourceBindingEmit`
3. 逐步改造：
   - 首先改造 `DsBindingConfigDialog.vue`
   - 再改造 `DataPickerConfigDialog.vue` 和 `LookupPickerConfigDialog.vue`
4. 运行时组件使用统一的绑定配置结构