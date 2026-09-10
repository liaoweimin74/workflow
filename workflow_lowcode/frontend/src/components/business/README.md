# DataSourceConfigPanel 组件使用文档

## 概述

`DataSourceConfigPanel` 是一个通用的数据源配置面板组件，提供统一的数据源绑定配置界面。该组件可用于页面设计器、表单设计器等需要数据源配置功能的场景。

## 功能特性

- 添加、编辑、删除数据源绑定
- 从已启用的全局数据源中选择绑定目标
- 数据验证（页面内标识唯一性、必填项验证）
- 配置变更实时通知

## 组件接口

### Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dataSources` | `DataSourceBinding[]` | 是 | 当前数据源绑定配置 |
| `enabledDataSources` | `DataSourceDTO[]` | 是 | 已启用的全局数据源列表 |

### Emits

| 事件 | 参数类型 | 说明 |
|------|----------|------|
| `update:dataSources` | `DataSourceBinding[]` | 配置变更时触发 |

### 数据类型

```typescript
interface DataSourceBinding {
  /** 页面内标识 */
  id: string
  /** 全局数据源ID */
  refId: string
  /** 搜索字段（可选） */
  searchFields?: string[]
}
```

## 使用示例

### 基础用法

```vue
<template>
  <DataSourceConfigPanel
    :dataSources="dataSources"
    :enabledDataSources="enabledDataSources"
    @update:dataSources="handleDataSourcesChange"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DataSourceConfigPanel from '@/components/business/DataSourceConfigPanel.vue'
import type { DataSourceBinding } from '@/components/business/DataSourceConfigPanel.vue'
import type { DataSourceDTO } from '@/api/data-source'

const dataSources = ref<DataSourceBinding[]>([])
const enabledDataSources = ref<DataSourceDTO[]>([])

function handleDataSourcesChange(newDataSources: DataSourceBinding[]) {
  dataSources.value = newDataSources
}
</script>
```

### 在页面设计器中使用

```vue
<template>
  <el-dialog v-model="dialogVisible" title="数据源配置" width="680px">
    <DataSourceConfigPanel
      :dataSources="schema.dataSources"
      :enabledDataSources="enabledDataSources"
      @update:dataSources="updateDataSources"
    />
    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DataSourceConfigPanel from '@/components/business/DataSourceConfigPanel.vue'
import type { DataSourceBinding } from '@/components/business/DataSourceConfigPanel.vue'

const dialogVisible = ref(false)

const schema = ref({
  dataSources: [] as DataSourceBinding[],
})

function updateDataSources(newDataSources: DataSourceBinding[]) {
  schema.value.dataSources = newDataSources
}
</script>
```

## 验证规则

组件内置以下验证规则：

1. **页面内标识必填**：不能为空
2. **页面内标识唯一**：不能与其他绑定重复
3. **全局数据源必选**：必须选择一个全局数据源

## 样式定制

组件支持通过 CSS 变量或覆盖 scoped 样式进行定制：

```css
/* 自定义面板样式 */
.data-source-config-panel {
  background: #f5f7fa;
  border-radius: 8px;
}

/* 自定义绑定项样式 */
.binding-item {
  border-color: #409eff;
}
```

## 注意事项

1. 组件会维护内部状态副本，外部 `dataSources` 变化时会同步更新
2. 验证错误会在组件内部显示，不会阻止事件触发
3. 组件设计为无状态模式，所有配置变更通过事件通知父组件
