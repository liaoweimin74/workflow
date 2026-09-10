# 数据表格组件增强设计方案

**日期**: 2026-08-20
**状态**: 待审核
**关联**: 页面设计器、表单设计器

---

## 1. 项目背景

### 1.1 现状分析

当前项目中有两套数据表格组件：

| 组件 | 位置 | 用途 | 现状 |
|------|------|------|------|
| `PageDataTable` | `frontend/src/views/page/components/` | 页面设计器的数据展示组件 | 功能简单，仅支持基础CRUD和动作总线联动 |
| `SearchTable` | `frontend/src/components/business/` | 代码级数据表格组件 | 功能丰富，支持搜索、分页、操作列配置 |

### 1.2 核心问题

1. **PageDataTable 配置能力有限** - 仅支持 `columns`、`dataSourceId` 等基础配置
2. **操作列硬编码** - 编辑/删除按钮无法自定义
3. **事件类型单一** - 仅支持 `row-click` 事件
4. **与 SearchTable 配置方式不统一** - 两者配置逻辑重复

### 1.3 设计目标

1. 增强 PageDataTable 的属性配置能力
2. 扩展事件绑定机制，支持更多交互场景
3. 实现操作列按钮的灵活配置
4. 复用 SearchTable 的配置逻辑，统一配置面板
5. 保持向后兼容，现有 schema 无需修改

---

## 2. 设计方案

### 2.1 方案选择

采用**混合方案**：在现有 PageDataTable 基础上扩展属性和事件，同时引入通用配置面板复用 SearchTable 的配置逻辑。

**选择理由**：
- 改动范围可控，风险较低
- 复用现有配置逻辑，减少重复开发
- 分阶段实现，可快速迭代

### 2.2 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    TableConfigPanel (通用配置组件)             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  列配置面板   │  │ 操作列配置   │  │  搜索字段配置    │  │
│  │  (Columns)    │  │ (Actions)    │  │  (SearchFields)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
   ┌────────┴────────┐               ┌──────────┴──────────┐
   │  SearchTable    │               │    PageDataTable     │
   │  (代码配置)     │               │    (设计器配置)      │
   └─────────────────┘               └─────────────────────┘
            │                                   │
            └─────────────────┬─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  el-table (渲染)   │
                    └───────────────────┘
```

---

## 3. 详细设计

### 3.1 属性配置增强

#### 3.1.1 表格级属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `sortable` | boolean | false | 是否启用排序 |
| `filterable` | boolean | false | 是否启用筛选 |
| `pagination` | boolean | true | 是否显示分页 |
| `pageSize` | number | 20 | 每页条数 |
| `selectionMode` | string | 'none' | 行选择模式：none/single/multiple |
| `height` | string | - | 表格高度（支持 auto、具体像素） |
| `maxHeight` | string | - | 表格最大高度 |
| `stripe` | boolean | true | 斑马纹 |
| `border` | boolean | true | 边框 |

#### 3.1.2 列级属性

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `sortable` | boolean | false | 该列是否可排序 |
| `filterable` | boolean | false | 该列是否可筛选 |
| `fixed` | string | - | 固定列：left/right |
| `formatter` | string | - | 值格式化函数名 |
| `align` | string | 'left' | 对齐方式：left/center/right |
| `showOverflowTooltip` | boolean | true | 超出显示tooltip |

#### 3.1.3 内置格式化器

| 格式化器 | 说明 | 示例输出 |
|----------|------|----------|
| `currency` | 货币格式 | ¥1,234.56 |
| `date` | 日期格式 | 2026-08-20 |
| `datetime` | 日期时间格式 | 2026-08-20 14:30:00 |
| `boolean` | 布尔显示 | 是/否 |
| `enum` | 枚举映射 | 需配合 dict 配置 |

### 3.2 事件绑定增强

#### 3.2.1 组件事件

| 事件名 | 触发时机 | 参数 |
|--------|----------|------|
| `row-click` | 行点击 | `{ row, column, event }` |
| `cell-click` | 单元格点击 | `{ row, column, cell, event }` |
| `selection-change` | 选中行变化 | `selection[]` |
| `sort-change` | 排序变化 | `{ column, prop, order }` |
| `filter-change` | 筛选变化 | `{ column, values }` |
| `current-change` | 当前行变化 | `row, oldRow` |

#### 3.2.2 动作总线扩展

新增操作类型：

| 操作 | 说明 | 参数示例 |
|------|------|----------|
| `set-sort` | 设置排序 | `{ field: 'name', order: 'ascending' }` |
| `set-page` | 设置分页 | `{ page: 1, size: 20 }` |
| `get-selection` | 获取选中行 | 通过回调返回 |
| `clear-selection` | 清空选中 | - |

### 3.3 操作列按钮配置

#### 3.3.1 配置结构

```javascript
{
  actionColumn: {
    label: '操作',
    width: 200,
    fixed: 'right',
    buttons: [
      {
        label: '编辑',
        type: 'primary',
        link: true,
        icon: 'Edit',
        action: 'edit',
        visible: '{row.status === 0}'
      },
      {
        label: '删除',
        type: 'danger',
        link: true,
        icon: 'Delete',
        action: 'delete',
        confirmMessage: '确定删除这条记录吗？'
      },
      {
        label: '查看详情',
        type: 'primary',
        link: true,
        action: 'custom',
        customAction: 'view-detail',
        eventData: '{row}'
      }
    ]
  }
}
```

#### 3.3.2 内置动作

| 动作 | 说明 | 行为 |
|------|------|------|
| `edit` | 编辑 | 打开编辑弹窗 |
| `delete` | 删除 | 确认后删除记录 |
| `view` | 查看 | 打开查看弹窗（只读） |
| `custom` | 自定义 | 触发动作总线事件 |

#### 3.3.3 条件显示

支持表达式控制按钮显示：

```javascript
{
  label: '审批',
  action: 'custom',
  visible: '{row.status === "PENDING"}',
  // 或使用上下文变量
  visible: '{ctx.user.role === "admin"}'
}
```

### 3.4 配置面板设计

#### 3.4.1 分层配置策略

**第一层：属性编辑栏直接配置（简单属性）**

在右侧属性面板直接展示常用配置项：

```
┌─────────────────────────────┐
│ 属性配置                     │
├─────────────────────────────┤
│ 数据源: [用户数据 ▼]         │
│ ☑ 启用排序    ☑ 显示分页    │
│ ☑ 启用筛选    每页条数: [20] │
│ 行选择模式: [单选 ▼]         │
│ 表格高度: [auto ]            │
└─────────────────────────────┘
```

**第二层：弹窗配置（复杂配置）**

| 配置项 | 弹窗原因 | 弹窗内容 |
|--------|----------|----------|
| 列配置 | 列数多、每列有多个子配置项 | 列表式配置，每列可展开编辑 |
| 操作列配置 | 按钮数组，每个按钮有多个属性 | 按钮列表 + 按钮属性编辑 |
| 事件绑定 | 事件类型多、需要配置动作链 | 事件列表 + 动作链配置 |

#### 3.4.2 配置入口设计

```
┌─────────────────────────────┐
│ 属性配置                     │
├─────────────────────────────┤
│ ...基础属性...               │
├─────────────────────────────┤
│ 进阶配置                     │
│ [列配置 (5列)]       [配置]  │
│ [操作列 (3个按钮)]   [配置]  │
│ [事件绑定 (2个)]     [配置]  │
└─────────────────────────────┘
```

---

## 4. 与 SearchTable 复用设计

### 4.1 可复用组件

| 配置面板 | SearchTable 用法 | PageDataTable 用法 |
|----------|------------------|-------------------|
| 列配置面板 | 代码中定义 columns 数组 | 属性面板中可视化配置 |
| 操作列配置面板 | 代码中定义 actionButtons 数组 | 属性面板中可视化配置 |
| 搜索字段配置 | 代码中定义 searchFields 数组 | 不适用（无搜索栏） |

### 4.2 通用配置组件设计

```vue
<!-- TableConfigPanel.vue -->
<template>
  <el-tabs>
    <el-tab-pane label="列配置">
      <!-- 列列表 + 列属性编辑 -->
    </el-tab-pane>
    <el-tab-pane label="操作列">
      <!-- 按钮列表 + 按钮属性编辑 -->
    </el-tab-pane>
    <el-tab-pane v-if="showSearch" label="搜索字段">
      <!-- 搜索字段配置 -->
    </el-tab-pane>
  </el-tabs>
</template>

<script setup>
const props = defineProps<{
  columns: ColumnConfig[]
  actionButtons: ActionButtonConfig[]
  searchFields?: SearchFieldConfig[]
  showSearch?: boolean
}>()
</script>
```

### 4.3 适配层设计

**SearchTable 适配**：

```vue
<TableConfigPanel
  :columns="columns"
  :action-buttons="actionButtons"
  :search-fields="searchFields"
  :show-search="true"
  @update:columns="columns = $event"
  @update:action-buttons="actionButtons = $event"
/>
```

**PageDataTable 适配**：

```vue
<!-- 设计器属性面板中的配置入口 -->
<el-button @click="openConfigPanel">列配置 (5列)</el-button>
<el-button @click="openActionConfig">操作列 (3个按钮)</el-button>

<!-- 配置弹窗 -->
<TableConfigPanel
  v-model:columns="props.columns"
  v-model:action-buttons="props.actionColumn.buttons"
  :show-search="false"
/>
```

---

## 5. 联动场景示例

### 5.1 搜索框过滤表格

```
组件: el-input (搜索框)
  ↓ 事件: input / enter
  ↓ 动作: set-filter
组件: PageDataTable (表格)
```

### 5.2 表格行选择联动表单

```
组件: PageDataTable (表格)
  ↓ 事件: current-change / selection-change
  ↓ 动作: set-value / reload-record
组件: FormContainer (表单)
```

### 5.3 多表格数据同步

```
组件: PageDataTable (主表)
  ↓ 事件: row-click
  ↓ 动作: set-filter (传递 ID)
组件: PageDataTable (明细表)
```

### 5.4 自定义操作列按钮联动

```javascript
// 配置
{
  buttons: [
    {
      label: '查看详情',
      action: 'custom',
      customAction: 'view-detail',
      eventData: '{row}'
    }
  ]
}

// 动作总线
{
  trigger: 'view-detail',
  steps: [
    { op: 'set-value', target: 'detailForm', field: 'id', value: '{row.id}' },
    { op: 'set-value', target: 'detailForm', field: 'visible', value: 'true' }
  ]
}
```

---

## 6. 向后兼容性

### 6.1 兼容策略

1. **新增属性都有默认值** - 现有 schema 无需修改即可正常工作
2. **操作列默认行为** - 未配置 actionColumn 时保持现有编辑/删除按钮
3. **事件向后兼容** - 新增事件不影响现有事件绑定

### 6.2 Schema 迁移

无需迁移，新功能通过新增属性启用。

---

## 7. 实现计划

### 7.1 阶段一：基础增强（1-2周）

- [ ] 扩展 PageDataTable 基础属性（sortable/filterable/pagination 等）
- [ ] 扩展列级属性（formatter/fixed/align 等）
- [ ] 实现内置格式化器

### 7.2 阶段二：操作列配置（1-2周）

- [ ] 设计并实现 TableConfigPanel 通用配置组件
- [ ] 实现操作列按钮配置
- [ ] 实现按钮条件显示

### 7.3 阶段三：事件与联动（1-2周）

- [ ] 扩展组件事件（cell-click/selection-change 等）
- [ ] 扩展动作总线操作（set-sort/set-page 等）
- [ ] 实现与 SearchTable 的配置复用

### 7.4 阶段四：配置面板优化（1周）

- [ ] 实现属性编辑栏的分层配置
- [ ] 优化配置面板 UI/UX
- [ ] 编写测试用例

---

## 8. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 向后兼容性问题 | 现有页面功能异常 | 严格保持默认值，充分测试 |
| 配置面板复杂度 | 用户学习成本 | 分层设计，渐进式引导 |
| 性能影响 | 大数据量表格卡顿 | 虚拟滚动、分页优化 |

---

## 附录

### A. 配置示例

```javascript
// 完整配置示例
{
  type: 'page-table',
  props: {
    dataSourceId: 'userDs',
    sortable: true,
    filterable: true,
    pagination: true,
    pageSize: 20,
    selectionMode: 'single',
    columns: [
      { prop: 'name', label: '姓名', sortable: true, width: 120 },
      { prop: 'age', label: '年龄', sortable: true, width: 80 },
      { prop: 'amount', label: '金额', formatter: 'currency', width: 120 }
    ],
    actionColumn: {
      label: '操作',
      width: 200,
      buttons: [
        { label: '编辑', type: 'primary', action: 'edit' },
        { label: '删除', type: 'danger', action: 'delete', confirmMessage: '确定删除？' },
        { label: '详情', type: 'primary', action: 'custom', customAction: 'view-detail' }
      ]
    }
  }
}
```
