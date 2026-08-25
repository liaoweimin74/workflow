## ADDED Requirements

### Requirement: QueryColumnsConfig SHALL 支持格式化器配置

QueryColumnsConfig 组件 SHALL 提供 `formatter` 下拉列，支持选择列值格式化器。

#### Scenario: 配置列格式化器
- **WHEN** 用户在 QueryColumnsConfig 中为某列选择 formatter 为 `currency`
- **THEN** 该列配置 SHALL 包含 `formatter: 'currency'`

#### Scenario: 未配置格式化器
- **WHEN** 用户未为某列选择 formatter（默认"无"）
- **THEN** 该列配置 SHALL 不包含 formatter 属性或为 undefined

---

### Requirement: QueryColumnsConfig SHALL 支持固定列配置

QueryColumnsConfig 组件 SHALL 提供 `fixed` 下拉列，支持选择列固定位置。

#### Scenario: 配置固定列在左侧
- **WHEN** 用户在 QueryColumnsConfig 中为某列选择 fixed 为 `left`
- **THEN** 该列配置 SHALL 包含 `fixed: 'left'`

#### Scenario: 配置固定列在右侧
- **WHEN** 用户在 QueryColumnsConfig 中为某列选择 fixed 为 `right`
- **THEN** 该列配置 SHALL 包含 `fixed: 'right'`

#### Scenario: 未配置固定列
- **WHEN** 用户未为某列选择 fixed（默认"无"）
- **THEN** 该列配置 SHALL 不包含 fixed 属性

---

### Requirement: PageRenderer SHALL 支持列格式化渲染

PageRenderer SHALL 根据列配置中的 `formatter` 属性格式化单元格显示值。

#### Scenario: 使用 currency 格式化器
- **WHEN** 列配置中 `formatter` 为 `currency`，行数据值为 `1234.56`
- **THEN** 单元格 SHALL 显示 `¥1,234.56`

#### Scenario: 使用 date 格式化器
- **WHEN** 列配置中 `formatter` 为 `date`，行数据值为 `2026-08-25T10:30:00`
- **THEN** 单元格 SHALL 显示 `2026-08-25`

#### Scenario: 使用 boolean 格式化器
- **WHEN** 列配置中 `formatter` 为 `boolean`，行数据值为 `true`
- **THEN** 单元格 SHALL 显示 `是`

#### Scenario: 格式化器不存在
- **WHEN** 列配置中 `formatter` 设置为不存在的格式化器名称
- **THEN** 单元格 SHALL 直接显示原始值

---

### Requirement: PageRenderer SHALL 支持固定列渲染

PageRenderer SHALL 根据列配置中的 `fixed` 属性固定列位置。

#### Scenario: 固定列在左侧
- **WHEN** 列配置中 `fixed` 为 `left`
- **THEN** 该列 SHALL 固定在表格左侧，水平滚动时保持可见

#### Scenario: 固定列在右侧
- **WHEN** 列配置中 `fixed` 为 `right`
- **THEN** 该列 SHALL 固定在表格右侧，水平滚动时保持可见
