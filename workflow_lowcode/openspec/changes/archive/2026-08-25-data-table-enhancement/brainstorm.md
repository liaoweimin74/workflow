## Design Summary

直接扩展 ViewDesigner 的配置能力，并同步扩展 PageRenderer 的渲染能力，实现数据表格组件的增强。

### 核心目标

1. **ViewDesigner 配置扩展** - 在现有 QueryColumnsConfig/ActionsConfig/EventsConfig 基础上增加新配置项
2. **PageRenderer 渲染扩展** - 支持新配置项的运行时渲染
3. **保持向后兼容** - 现有视图 schema 无需修改

## Alternatives Considered

### 方案 A：独立配置面板

- **做法**：新建通用 TableConfigPanel 组件，与 ViewDesigner 分离
- **优点**：组件独立，可复用于 SearchTable
- **缺点**：与现有 ViewDesigner 配置体系割裂，用户需要在两处配置
- **为何未采用**：配置体验不统一，增加用户认知负担

### 方案 B：完全重构 ViewDesigner

- **做法**：重新设计 ViewDesigner 的 schema 结构和配置组件
- **优点**：架构更清晰
- **缺点**：工作量大，破坏向后兼容
- **为何未采用**：风险过高

### 方案 C：直接扩展 ViewDesigner（采用）

- **做法**：在现有 QueryColumnsConfig/ActionsConfig/EventsConfig 组件上增加新配置项，同步扩展 PageRenderer 渲染能力
- **优点**：复用现有配置体系，风险低，用户体验统一
- **缺点**：中等工作量
- **为何采用**：ViewDesigner 已有完善的配置体系，直接扩展是最自然的方式

## Agreed Approach

直接扩展 ViewDesigner，具体实现：

### 1. QueryColumnsConfig 扩展

**现有能力**：勾选显示列、设置宽度/对齐/排序

**新增能力**：
- `formatter` - 列值格式化器（currency/date/boolean/enum）
- `fixed` - 固定列（left/right）

### 2. ActionsConfig 扩展

**现有能力**：内置/自定义按钮、位置/形态/图标、事件链、操作列宽度、权限

**新增能力**：
- `visible` - 按钮条件显示表达式（如 `$row.status === 'PENDING'`）

### 3. EventsConfig 扩展

**现有触发器**：row-click / search / refresh / create-success

**新增触发器**：
- `cell-click` - 单元格点击
- `selection-change` - 行选择变化
- `current-change` - 当前行变化

**现有动作**：set-filter / refresh / open-detail / script

**新增动作**：
- `set-sort` - 设置排序（params: field, order）
- `set-page` - 设置分页（params: page, size）
- `clear-selection` - 清空行选择

### 4. PageRenderer 渲染扩展

| 扩展项 | 说明 |
|--------|------|
| 列格式化 | 根据 `formatter` 配置格式化单元格显示值 |
| 固定列 | 根据 `fixed` 配置固定列位置 |
| 单元格事件 | 监听 `cell-click` 并触发事件链 |
| 行选择 | 支持 `selection-change` 多选/单选模式 |
| 排序动作 | 执行 `set-sort` 动作时设置 el-table 排序 |
| 分页动作 | 执行 `set-page` 动作时跳转分页 |
| 清空选择 | 执行 `clear-selection` 动作时清空选中行 |
| 按钮条件显示 | 根据 `visible` 表达式判断是否渲染按钮 |

## Key Decisions

1. **直接扩展 ViewDesigner** - 不新建独立配置组件，复用现有配置体系
2. **配置端 + 渲染端同步扩展** - ViewDesigner 新增的配置项在 PageRenderer 中实现渲染
3. **保持向后兼容** - 新增配置项均有默认值，现有 schema 无需修改
4. **内置格式化器** - 提供 currency/date/boolean/enum 常用格式化器
5. **按钮条件显示** - 通过表达式（`$row.xxx` 语法）控制按钮可见性

## Open Questions

1. 格式化器是否需要支持自定义函数？
2. 固定列组合（同时固定左右）是否有性能影响？
3. selection-change 是否需要支持跨页选择？
