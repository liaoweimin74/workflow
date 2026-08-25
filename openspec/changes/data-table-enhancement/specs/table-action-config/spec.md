## ADDED Requirements

### Requirement: 操作列 SHALL 支持自定义按钮配置

表格操作列 SHALL 提供 `actionColumn` 属性，支持自定义按钮配置。

#### Scenario: 配置操作列按钮
- **WHEN** 用户配置 `actionColumn.buttons` 数组
- **THEN** 表格 SHALL 在操作列显示配置的按钮

#### Scenario: 未配置操作列
- **WHEN** 用户未配置 `actionColumn` 或 `buttons` 为空
- **THEN** 表格 SHALL 不显示操作列（保持向后兼容）

---

### Requirement: 操作按钮 SHALL 支持内置动作

操作按钮 SHALL 提供 `action` 属性支持内置动作。

#### Scenario: 编辑动作
- **WHEN** 按钮配置 `action` 为 `edit`
- **THEN** 点击按钮 SHALL 触发编辑弹窗

#### Scenario: 删除动作
- **WHEN** 按钮配置 `action` 为 `delete`
- **THEN** 点击按钮 SHALL 弹出确认框，确认后删除记录

#### Scenario: 查看动作
- **WHEN** 按钮配置 `action` 为 `view`
- **THEN** 点击按钮 SHALL 触发查看弹窗（只读模式）

---

### Requirement: 操作按钮 SHALL 支持自定义动作

操作按钮 SHALL 支持通过 `action: 'custom'` 配置自定义动作。

#### Scenario: 触发自定义动作
- **WHEN** 按钮配置 `action` 为 `custom` 且 `customAction` 已设置
- **THEN** 点击按钮 SHALL 通过动作总线触发指定事件

#### Scenario: 传递事件数据
- **WHEN** 按钮配置 `eventData` 属性
- **THEN** 触发事件时 SHALL 将 `eventData` 作为事件数据传递

---

### Requirement: 操作按钮 SHALL 支持条件显示

操作按钮 SHALL 提供 `visible` 属性控制按钮显示条件。

#### Scenario: 表达式为真
- **WHEN** 按钮配置 `visible` 表达式求值为 `true`
- **THEN** 该按钮 SHALL 显示

#### Scenario: 表达式为假
- **WHEN** 按钮配置 `visible` 表达式求值为 `false`
- **THEN** 该按钮 SHALL 隐藏

#### Scenario: 未配置 visible
- **WHEN** 按钮未配置 `visible` 属性
- **THEN** 该按钮 SHALL 始终显示

---

### Requirement: 操作按钮 SHALL 支持确认提示

操作按钮 SHALL 提供 `confirmMessage` 属性配置确认提示。

#### Scenario: 配置确认提示
- **WHEN** 按钮配置 `confirmMessage`
- **THEN** 点击按钮 SHALL 先弹出确认框，确认后执行动作

#### Scenario: 未配置确认提示
- **WHEN** 按钮未配置 `confirmMessage`
- **THEN** 点击按钮 SHALL 直接执行动作

---

### Requirement: 操作按钮 SHALL 支持多种样式

操作按钮 SHALL 支持 `type`、`icon`、`link` 等样式配置。

#### Scenario: 设置按钮类型
- **WHEN** 按钮配置 `type` 为 `primary`/`success`/`danger`/`warning`
- **THEN** 按钮 SHALL 显示对应的样式类型

#### Scenario: 设置按钮图标
- **WHEN** 按钮配置 `icon` 属性
- **THEN** 按钮 SHALL 显示指定图标

#### Scenario: 设置文字按钮
- **WHEN** 按钮配置 `link` 为 `true`
- **THEN** 按钮 SHALL 显示为文字链接样式
