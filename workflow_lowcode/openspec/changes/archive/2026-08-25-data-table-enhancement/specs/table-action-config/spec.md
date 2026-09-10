## ADDED Requirements

### Requirement: ActionsConfig SHALL 支持按钮条件显示配置

ActionsConfig 组件 SHALL 提供 `visible` 输入框，支持配置按钮条件显示表达式。

#### Scenario: 配置按钮条件显示
- **WHEN** 用户在 ActionsConfig 中为某按钮输入 visible 表达式 `$row.status === 'PENDING'`
- **THEN** 该按钮配置 SHALL 包含 `visible: "$row.status === 'PENDING'"`

#### Scenario: 未配置条件显示
- **WHEN** 用户未为某按钮输入 visible 表达式
- **THEN** 该按钮 SHALL 在所有行中显示

---

### Requirement: PageRenderer SHALL 支持按钮条件显示渲染

PageRenderer SHALL 根据按钮配置中的 `visible` 表达式判断是否渲染按钮。

#### Scenario: 表达式求值为真
- **WHEN** 按钮 `visible` 表达式中 `$row.status` 替换为当前行的 `status` 值后求值为 `true`
- **THEN** 该按钮 SHALL 渲染显示

#### Scenario: 表达式求值为假
- **WHEN** 按钮 `visible` 表达式中 `$row.status` 替换为当前行的 `status` 值后求值为 `false`
- **THEN** 该按钮 SHALL 不渲染

#### Scenario: 未配置 visible
- **WHEN** 按钮未配置 `visible` 属性
- **THEN** 该按钮 SHALL 始终渲染显示

#### Scenario: 表达式包含 $param 变量
- **WHEN** 按钮 `visible` 表达式包含 `$param.xxx` 变量
- **THEN** PageRenderer SHALL 将 `$param.xxx` 替换为路由查询参数值后求值
