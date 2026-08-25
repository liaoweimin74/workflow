## ADDED Requirements

### Requirement: 表格 SHALL 发射 cell-click 事件

表格 SHALL 在用户点击单元格时发射 `cell-click` 事件。

#### Scenario: 点击单元格
- **WHEN** 用户点击表格中的某个单元格
- **THEN** 表格 SHALL 发射 `cell-click` 事件，携带 `{ row, column, cell, event }` 参数

---

### Requirement: 表格 SHALL 发射 selection-change 事件

表格 SHALL 在用户改变行选择时发射 `selection-change` 事件。

#### Scenario: 单选模式下选择行
- **WHEN** `selectionMode` 为 `single` 且用户选择一行
- **THEN** 表格 SHALL 发射 `selection-change` 事件，携带选中的行数据

#### Scenario: 多选模式下选择行
- **WHEN** `selectionMode` 为 `multiple` 且用户选择/取消选择行
- **THEN** 表格 SHALL 发射 `selection-change` 事件，携带所有选中的行数据数组

---

### Requirement: 表格 SHALL 发射 sort-change 事件

表格 SHALL 在用户改变排序时发射 `sort-change` 事件。

#### Scenario: 用户点击列头排序
- **WHEN** 用户点击可排序列的列头进行排序
- **THEN** 表格 SHALL 发射 `sort-change` 事件，携带 `{ column, prop, order }` 参数

---

### Requirement: 表格 SHALL 发射 current-change 事件

表格 SHALL 在用户改变当前行时发射 `current-change` 事件。

#### Scenario: 单选模式下切换行
- **WHEN** `selectionMode` 为 `single` 且用户点击不同行
- **THEN** 表格 SHALL 发射 `current-change` 事件，携带新行和旧行数据

---

### Requirement: 动作总线 SHALL 支持 set-sort 操作

动作总线 SHALL 支持 `set-sort` 操作设置表格排序。

#### Scenario: 通过动作总线设置排序
- **WHEN** 动作总线触发 `set-sort` 操作，参数包含 `field` 和 `order`
- **THEN** 目标表格 SHALL 按指定字段和顺序进行排序

---

### Requirement: 动作总线 SHALL 支持 set-page 操作

动作总线 SHALL 支持 `set-page` 操作设置分页。

#### Scenario: 通过动作总线设置分页
- **WHEN** 动作总线触发 `set-page` 操作，参数包含 `page` 和/或 `size`
- **THEN** 目标表格 SHALL 跳转到指定页码

---

### Requirement: 动作总线 SHALL 支持 clear-selection 操作

动作总线 SHALL 支持 `clear-selection` 操作清空表格选中状态。

#### Scenario: 通过动作总线清空选中
- **WHEN** 动作总线触发 `clear-selection` 操作
- **THEN** 目标表格 SHALL 清空所有行的选中状态
