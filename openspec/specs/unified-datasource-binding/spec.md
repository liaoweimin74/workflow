# unified-datasource-binding Specification

## Purpose

统一前端数据源绑定组件，消除数据表格、选择器、树形选择等组件中数据源绑定和筛选逻辑的重复实现。

## Background

前端页面设计器中多个配置弹窗都包含数据源选择和组件级筛选功能：`DsBindingConfigDialog`、`DataPickerConfigDialog`、`LookupPickerConfigDialog`。这些弹窗的“数据源”页签/内容都是内联实现，且结构高度相似。

已有独立组件：
- `DataSourceBindingTab.vue`：封装数据源选择和筛选，但未被配置弹窗复用
- `DataSourceConfigPanel.vue`：管理页面级数据源，不适用于组件绑定

## Requirements

### Requirement: 组件 SHALL 提供统一的数据源绑定功能

统一的数据源绑定组件 SHALL 支持：
- 数据源选择（页面内数据源绑定）
- 组件级筛选条件配置
- 筛选条件固定值和表单字段引用两种模式
- 数据源切换时自动加载列定义

#### Scenario: 选择数据源
- **WHEN** 用户从数据源下拉框选择
- **THEN** 系统 SHALL 触发数据源变更事件，加载对应列定义

#### Scenario: 添加筛选条件
- **WHEN** 用户点击“添加筛选条件”按钮
- **THEN** 系统 SHALL 添加一行新的筛选行，默认为“固定值”模式

#### Scenario: 添加表单字段筛选
- **WHEN** 用户选择“表单字段”模式并选择表单字段
- **THEN** 系统 SHALL 使用表单字段值作为筛选条件

### Requirement: 组件 SHALL 输出统一的配置结构

组件 SHALL 输出包含：
- `dataSourceId`: 选定的数据源ID
- `filter`: 筛选条件数组（逻辑+条件列表）
- `columns`: 筛选后可用的列定义

输出结构示例：
```typescript
interface DataSourceBindingConfig {
  dataSourceId: string
  filter?: {
    logic: 'AND' | 'OR'
    conditions: Array<{
      column: string
      op: string
      source: 'fixed' | 'field'
      value?: any
      field?: string
    }>
  }
}
```

### Requirement: 组件 SHALL 兼容现有配置弹窗

组件 SHALL 可以无缝集成到：
- `DsBindingConfigDialog.vue`（表格配置）
- `DataPickerConfigDialog.vue`（数据引用配置）
- `LookupPickerConfigDialog.vue`（查找器配置）

迁移时：
- 保持已有配置的语义不变
- 兼容已有存储的配置结构
- 支持向后兼容的字段映射

### Requirement: 组件 SHALL 支持列元数据加载

组件 SHALL 在数据源变更后：
- 加载并返回可用列列表
- 处理列分组、宽度、对齐等元数据
- 支持“显示列”配置的初始化

---

## Non-goals

- 不修改后端数据源 API
- 不改变数据源本身的结构
- 不处理页面级数据源管理（由 DataSourceConfigPanel 负责）
- 不实现筛选条件的实际计算（运行时由表格组件负责）

---

## Dependencies

- TypeScript 5.x
- Vue 3 Composition API
- Element Plus 组件库
- 现有数据源 API（`dataSourceApi`）

---

## Related

- `DsBindingConfigDialog.vue` - 数据表格配置对话框
- `DataSourceBindingTab.vue` - 现有数据源绑定组件（参考）
- `DataSourceConfigPanel.vue` - 页面级数据源管理
- `QueryColumnsConfig.vue` - 显示列配置