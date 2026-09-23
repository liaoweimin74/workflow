# Plan: unified-datasource-binding

## 前期准备

### 1. 组件分析准备
阅读以下文件了解现有数据源绑定实现：
- `frontend/src/views/form/components/DataSourceBindingTab.vue`
- `frontend/src/views/form/components/DsBindingConfigDialog.vue`
- `frontend/src/views/form/components/DataPickerConfigDialog.vue`
- `frontend/src/views/form/components/LookupPickerConfigDialog.vue`
- `frontend/src/components/business/DataSourceConfigPanel.vue`

### 2. 接口梳理
梳理 `DataSourceBindingTab.vue` 的：
- props：`modelValue`, `formDataSources`, `currentFields` 等
- emits：`update:modelValue`, `columns-change` 等
- 内部数据结构：`filterRows`, `dataSourceId` 等

## 阶段 1：组件抽象

### 步骤 1：重命名并复用统一组件
将已有 `DataSourceBindingTab.vue` 重命名为 `UniDataSourceBinding.vue`，在其基础上增加必要的状态同步接口。

判断标准：
- 是否能通过 `v-model:binding` 接收和输出完整配置？
- 是否需要暴露 `onDataSourceChange` 事件给父组件？

### 步骤 2：接口适配器
创建适配器函数，处理：
- 旧配置 → 新结构
- 新结构 → 旧结构

输出：
```typescript
// 目标输出结构
interface UnifiedBindingConfig {
  dataSourceId: string
  filter?: {
    logic: 'AND' | 'OR'
    conditions: BindingCondition[]
  }
}

interface BindingCondition {
  column: string
  op: 'eq' | 'ne' | 'like' | 'in' | 'isEmpty' | 'isNotEmpty'
  source: 'fixed' | 'field'
  value?: any
  field?: string
}
```

## 阶段 2：集成 DsBindingConfigDialog

### 步骤 3：替换数据源页签
修改 `DsBindingConfigDialog.vue`：
- 删除内联数据源表单
- 加入 `<UnifiedDatasourceBinding>` 组件
- 处理筛选行的 `fixedValue` → `value` 转换

### 步骤 4：列数据加载适配
确保：
- 数据源变更触发列定义加载
- 筛选条件变更同步到运行时

## 阶段 3：集成 DataPickerConfigDialog

### 步骤 5：分析差异
比较：
- 筛选中行字段结构
- 列加载方式
- 验证逻辑

### 步骤 6：实现集成
类似步骤 3，替换内联内容。

## 阶段 4：集成 LookupPickerConfigDialog

### 步骤 7：分析并实现
同样替换内联数据源页签。

## 阶段 5：运行时组件适配

### 步骤 8：更新消费方
修改：
- `PageDataTable.vue`
- `PageDataCards.vue`
- `PageDataTree.vue`
- `DataPicker.vue`
- `LookupPicker.vue`

使用统一的 `UnifiedBindingConfig` 接口读取配置。

## 阶段 6：测试与验证

### 步骤 9：单元测试
为 `UnifiedDatasourceBinding.vue` 编写：
- 数据源选择
- 筛选添加/删除/编辑
- 表单字段引用模式
- 配置输出

### 步骤 10：集成测试
修改 `DsBindingConfigDialog.table.test.ts` 等，验证:
- 配置保存正确
- 数据源变更后列加载
- 筛选条件正确传递

### 步骤 11：E2E 测试
启动前端，验证：
- 表格配置 → 数据源页签正常
- 数据引用配置 → 数据源页签正常
- 查找器配置 → 数据源页签正常

## 阶段 7：兼容处理

### 步骤 12：迁移脚本
（如需要）后端脚本迁移旧配置。

### 步骤 13：前端兼容
配置读取时适配旧结构。
