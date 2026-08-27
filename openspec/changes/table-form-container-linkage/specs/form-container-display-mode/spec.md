## Requirement: form-container-display-mode

数据容器组件的多种显示形式支持，包括弹出窗口、新开页签、页面内嵌。

### ADDED Requirements

#### Requirement: dialog-display-mode
数据容器组件 SHALL 支持弹出窗口显示模式，作为默认显示形式。

##### Scenario: 默认使用弹出窗口显示
- WHEN 数据容器组件未配置显示模式
- THEN 系统 SHALL 使用弹出窗口模式显示

##### Scenario: 配置弹出窗口显示
- WHEN 数据容器组件配置 `displayMode: 'dialog'`
- THEN 系统 SHALL 使用弹出窗口模式显示

##### Scenario: 弹出窗口配置
- WHEN 数据容器组件配置了 `dialogWidth` 和 `dialogHeight`
- THEN 系统 SHALL 使用指定的尺寸显示弹出窗口

#### Requirement: newTab-display-mode
数据容器组件 SHALL 支持新开页签显示模式。

##### Scenario: 配置新开页签显示
- WHEN 数据容器组件配置 `displayMode: 'newTab'`
- THEN 系统 SHALL 使用新开页签模式显示

##### Scenario: 新开页签标题配置
- WHEN 数据容器组件配置了 `tabTitle`
- THEN 系统 SHALL 使用指定的标题显示新页签

#### Requirement: inline-display-mode
数据容器组件 SHALL 支持页面内嵌显示模式。

##### Scenario: 配置页面内嵌显示
- WHEN 数据容器组件配置 `displayMode: 'inline'`
- THEN 系统 SHALL 使用页面内嵌模式显示

##### Scenario: 页面内嵌高度配置
- WHEN 数据容器组件配置了 `inlineHeight`
- THEN 系统 SHALL 使用指定的高度显示内嵌容器

#### Requirement: display-mode-overwrite
事件流的 `open-container` 动作 SHALL 支持覆盖数据容器的默认显示模式。

##### Scenario: 事件流覆盖显示模式
- WHEN `open-container` 动作包含 `displayMode` 参数
- THEN 系统 SHALL 使用指定的显示模式打开数据容器，忽略默认配置

## Risks

1. **UI一致性风险**：不同显示模式的UI可能不一致
   - **缓解**：统一UI组件，确保视觉一致性

2. **状态管理风险**：不同显示模式的状态管理可能不同
   - **缓解**：统一状态管理逻辑，确保状态一致性
