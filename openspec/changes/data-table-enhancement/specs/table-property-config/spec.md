## ADDED Requirements

### Requirement: 表格 SHALL 支持排序功能

表格组件 SHALL 提供 `sortable` 属性控制是否启用排序功能。

#### Scenario: 启用表格排序
- **WHEN** 用户设置 `sortable` 为 `true`
- **THEN** 表格 SHALL 显示排序图标，用户可点击列头进行排序

#### Scenario: 禁用表格排序
- **WHEN** 用户设置 `sortable` 为 `false` 或未设置
- **THEN** 表格 SHALL 不显示排序图标

---

### Requirement: 表格 SHALL 支持筛选功能

表格组件 SHALL 提供 `filterable` 属性控制是否启用筛选功能。

#### Scenario: 启用表格筛选
- **WHEN** 用户设置 `filterable` 为 `true`
- **THEN** 表格 SHALL 支持列级筛选

#### Scenario: 禁用表格筛选
- **WHEN** 用户设置 `filterable` 为 `false` 或未设置
- **THEN** 表格 SHALL 不提供筛选功能

---

### Requirement: 表格 SHALL 支持分页功能

表格组件 SHALL 提供 `pagination` 属性控制是否显示分页。

#### Scenario: 显示分页
- **WHEN** 用户设置 `pagination` 为 `true`
- **THEN** 表格 SHALL 在底部显示分页组件

#### Scenario: 隐藏分页
- **WHEN** 用户设置 `pagination` 为 `false`
- **THEN** 表格 SHALL 不显示分页组件

---

### Requirement: 表格 SHALL 支持行选择模式

表格组件 SHALL 提供 `selectionMode` 属性控制行选择模式。

#### Scenario: 单选模式
- **WHEN** 用户设置 `selectionMode` 为 `single`
- **THEN** 表格 SHALL 显示单选框，用户只能选择一行

#### Scenario: 多选模式
- **WHEN** 用户设置 `selectionMode` 为 `multiple`
- **THEN** 表格 SHALL 显示复选框，用户可选择多行

#### Scenario: 无选择模式
- **WHEN** 用户设置 `selectionMode` 为 `none` 或未设置
- **THEN** 表格 SHALL 不显示选择框

---

### Requirement: 列 SHALL 支持排序配置

表格列 SHALL 提供 `sortable` 属性控制该列是否可排序。

#### Scenario: 启用列排序
- **WHEN** 列配置中 `sortable` 为 `true`
- **THEN** 该列 SHALL 显示排序图标

#### Scenario: 禁用列排序
- **WHEN** 列配置中 `sortable` 为 `false` 或未设置
- **THEN** 该列 SHALL 不显示排序图标

---

### Requirement: 列 SHALL 支持格式化器

表格列 SHALL 提供 `formatter` 属性指定值格式化函数。

#### Scenario: 使用内置格式化器
- **WHEN** 列配置中 `formatter` 设置为内置格式化器名称（如 `currency`、`date`）
- **THEN** 表格 SHALL 使用对应的格式化器显示数据

#### Scenario: 格式化器不存在
- **WHEN** 列配置中 `formatter` 设置为不存在的格式化器名称
- **THEN** 表格 SHALL 直接显示原始值

---

### Requirement: 列 SHALL 支持固定列

表格列 SHALL 提供 `fixed` 属性控制列固定位置。

#### Scenario: 固定列在左侧
- **WHEN** 列配置中 `fixed` 设置为 `left`
- **THEN** 该列 SHALL 固定在表格左侧

#### Scenario: 固定列在右侧
- **WHEN** 列配置中 `fixed` 设置为 `right`
- **THEN** 该列 SHALL 固定在表格右侧
