## Design Summary

增强页面设计器和表单设计器中数据表格组件的功能，通过属性配置和事件绑定实现与其他组件的灵活联动。

### 核心目标

1. **属性配置增强** - 扩展 PageDataTable 的配置能力，支持排序、筛选、分页、行选择等
2. **事件绑定增强** - 支持更多事件类型（cell-click、selection-change、sort-change 等）
3. **操作列配置** - 实现操作列按钮的灵活配置，支持自定义按钮和条件显示
4. **配置复用** - 与 SearchTable 组件共享配置面板，统一配置体验

## Alternatives Considered

### 方案 A：渐进式增强

- **做法**：在现有 PageDataTable 基础上扩展属性和事件，保持向后兼容
- **优点**：改动小、风险低、兼容现有 schema
- **缺点**：功能受限于 el-table 原生能力，配置体验一般
- **为何未采用**：配置体验不够友好，无法与 SearchTable 复用配置逻辑

### 方案 B：完全重构

- **做法**：新建独立的 AdvancedDataTable 组件，支持更丰富的配置
- **优点**：功能强大、高度可定制
- **缺点**：工作量大、需要重新设计 schema 结构、破坏向后兼容
- **为何未采用**：风险过高，与现有架构不兼容

### 方案 C：混合方案（采用）

- **做法**：增强 PageDataTable 属性和事件，引入通用配置面板复用 SearchTable 的配置逻辑
- **优点**：功能丰富且可控、用户体验好、可分阶段实现
- **缺点**：中等工作量
- **为何采用**：在现有架构上扩展，风险可控；配置面板提供更好的用户体验；可以分阶段实现

## Agreed Approach

采用方案 C（混合方案），具体实现：

### 1. 属性配置增强

**表格级属性**：
- `sortable` - 是否启用排序
- `filterable` - 是否启用筛选
- `pagination` - 是否显示分页
- `pageSize` - 每页条数
- `selectionMode` - 行选择模式（none/single/multiple）
- `height` / `maxHeight` - 表格高度控制

**列级属性**：
- `sortable` - 该列是否可排序
- `filterable` - 该列是否可筛选
- `fixed` - 固定列（left/right）
- `formatter` - 值格式化函数名
- `align` - 对齐方式
- `showOverflowTooltip` - 超出显示 tooltip

### 2. 事件绑定增强

**组件事件**：
- `row-click` - 行点击
- `cell-click` - 单元格点击
- `selection-change` - 选中行变化
- `sort-change` - 排序变化
- `current-change` - 当前行变化

**动作总线扩展**：
- `set-sort` - 设置排序
- `set-page` - 设置分页
- `get-selection` - 获取选中行
- `clear-selection` - 清空选中

### 3. 操作列按钮配置

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
        action: 'edit',
        visible: '{row.status === 0}'
      },
      {
        label: '删除',
        type: 'danger',
        action: 'delete',
        confirmMessage: '确定删除这条记录吗？'
      },
      {
        label: '查看详情',
        type: 'primary',
        action: 'custom',
        customAction: 'view-detail'
      }
    ]
  }
}
```

### 4. 配置面板设计

采用分层配置策略：
- **第一层**：属性编辑栏直接配置（简单属性）
- **第二层**：弹窗配置（复杂配置：列配置、操作列、事件绑定）

### 5. 与 SearchTable 复用

创建通用 `TableConfigPanel` 组件，支持：
- 列配置面板
- 操作列配置面板
- 搜索字段配置（可选）

SearchTable 和 PageDataTable 通过适配层使用该配置组件。

## Key Decisions

1. **采用混合方案** - 在现有基础上扩展，保持向后兼容
2. **分层配置策略** - 简单属性直接配置，复杂属性弹窗配置
3. **通用配置组件** - 与 SearchTable 复用配置逻辑
4. **操作列按钮支持条件显示** - 通过表达式控制按钮可见性
5. **内置格式化器** - 提供 currency、date、boolean 等常用格式化器

## Open Questions

1. 是否需要支持列拖拽排序？
2. 是否需要支持表格导出功能？
3. 是否需要支持行内编辑？
4. 是否需要支持虚拟滚动（大数据量场景）？
