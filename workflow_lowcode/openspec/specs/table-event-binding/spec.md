# table-event-binding Specification

## Purpose
TBD - created by archiving change data-table-enhancement. Update Purpose after archive.
## Requirements
### Requirement: EventsConfig SHALL 支持 cell-click 触发器

EventsConfig 组件 SHALL 在触发器下拉中提供 `cell-click`（单元格点击）选项。

#### Scenario: 选择 cell-click 触发器
- **WHEN** 用户在 EventsConfig 中选择触发器为 `cell-click`
- **THEN** 该事件配置 SHALL 包含 `trigger: 'cell-click'`

---

### Requirement: EventsConfig SHALL 支持 selection-change 触发器

EventsConfig 组件 SHALL 在触发器下拉中提供 `selection-change`（行选择变化）选项。

#### Scenario: 选择 selection-change 触发器
- **WHEN** 用户在 EventsConfig 中选择触发器为 `selection-change`
- **THEN** 该事件配置 SHALL 包含 `trigger: 'selection-change'`

---

### Requirement: EventsConfig SHALL 支持 current-change 触发器

EventsConfig 组件 SHALL 在触发器下拉中提供 `current-change`（当前行变化）选项。

#### Scenario: 选择 current-change 触发器
- **WHEN** 用户在 EventsConfig 中选择触发器为 `current-change`
- **THEN** 该事件配置 SHALL 包含 `trigger: 'current-change'`

---

### Requirement: EventsConfig SHALL 支持 set-sort 动作

EventsConfig 组件 SHALL 在动作类型下拉中提供 `set-sort`（设置排序）选项。

#### Scenario: 选择 set-sort 动作
- **WHEN** 用户在 EventsConfig 中选择动作为 `set-sort`
- **THEN** 该动作配置 SHALL 包含 `type: 'set-sort'`，支持 params: field（排序字段）、order（排序方向 ascending/descending）

---

### Requirement: EventsConfig SHALL 支持 set-page 动作

EventsConfig 组件 SHALL 在动作类型下拉中提供 `set-page`（设置分页）选项。

#### Scenario: 选择 set-page 动作
- **WHEN** 用户在 EventsConfig 中选择动作为 `set-page`
- **THEN** 该动作配置 SHALL 包含 `type: 'set-page'`，支持 params: page（目标页码）

---

### Requirement: EventsConfig SHALL 支持 clear-selection 动作

EventsConfig 组件 SHALL 在动作类型下拉中提供 `clear-selection`（清空选择）选项。

#### Scenario: 选择 clear-selection 动作
- **WHEN** 用户在 EventsConfig 中选择动作为 `clear-selection`
- **THEN** 该动作配置 SHALL 包含 `type: 'clear-selection'`

---

### Requirement: PageRenderer SHALL 处理 cell-click 事件

PageRenderer SHALL 监听 el-table 的 `cell-click` 事件并触发对应事件链。

#### Scenario: 点击单元格触发事件链
- **WHEN** 用户点击表格单元格
- **THEN** PageRenderer SHALL 调用 `triggerEvents('cell-click', 'table', { row, column })`

---

### Requirement: PageRenderer SHALL 处理 selection-change 事件

PageRenderer SHALL 监听 el-table 的 `selection-change` 事件并触发对应事件链。

#### Scenario: 行选择变化触发事件链
- **WHEN** 用户选择或取消选择行
- **THEN** PageRenderer SHALL 调用 `triggerEvents('selection-change', 'table', { selectedRows })`

---

### Requirement: PageRenderer SHALL 处理 current-change 事件

PageRenderer SHALL 监听 el-table 的 `current-change` 事件并触发对应事件链。

#### Scenario: 当前行变化触发事件链
- **WHEN** 用户点击不同行切换当前行
- **THEN** PageRenderer SHALL 调用 `triggerEvents('current-change', 'table', { row, oldRow })`

---

### Requirement: PageRenderer SHALL 执行 set-sort 动作

PageRenderer SHALL 在 `dispatchAction` 中支持 `set-sort` 动作类型。

#### Scenario: 执行 set-sort 动作
- **WHEN** 事件链中动作为 `set-sort`，params 包含 `field` 和 `order`
- **THEN** PageRenderer SHALL 设置 el-table 的排序状态（prop 和 order）

---

### Requirement: PageRenderer SHALL 执行 set-page 动作

PageRenderer SHALL 在 `dispatchAction` 中支持 `set-page` 动作类型。

#### Scenario: 执行 set-page 动作
- **WHEN** 事件链中动作为 `set-page`，params 包含 `page`
- **THEN** PageRenderer SHALL 跳转到指定页码并重新加载数据

---

### Requirement: PageRenderer SHALL 执行 clear-selection 动作

PageRenderer SHALL 在 `dispatchAction` 中支持 `clear-selection` 动作类型。

#### Scenario: 执行 clear-selection 动作
- **WHEN** 事件链中动作为 `clear-selection`
- **THEN** PageRenderer SHALL 清空 el-table 的所有行选中状态

