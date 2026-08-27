## Requirement: page-data-table

页面数据表格组件，新增事件触发能力，支持表格-容器联动。

### MODIFIED Requirements

#### Requirement: ActionsConfig SHALL 支持事件流配置
ActionsConfig 组件 SHALL 支持为按钮配置事件流，触发表格-容器联动。

##### Scenario: 配置编辑按钮事件流
- WHEN 用户在 ActionsConfig 中为"编辑"按钮配置事件流
- THEN 该按钮配置 SHALL 包含事件流配置

##### Scenario: 配置查看按钮事件流
- WHEN 用户在 ActionsConfig 中为"查看"按钮配置事件流
- THEN 该按钮配置 SHALL 包含事件流配置

##### Scenario: 配置新增按钮事件流
- WHEN 用户在 ActionsConfig 中为"新增"按钮配置事件流
- THEN 该按钮配置 SHALL 包含事件流配置

#### Requirement: PageDataTable SHALL 支持行点击事件
PageDataTable SHALL 支持配置行点击事件，触发事件流。

##### Scenario: 配置行点击事件
- WHEN 用户在 PageDataTable 配置中启用行点击事件
- THEN 系统 SHALL 在用户点击表格行时触发事件流

##### Scenario: 行点击事件包含行数据
- WHEN 用户点击表格行
- THEN 系统 SHALL 在事件中包含当前行数据

#### Requirement: PageDataTable SHALL 触发表格-容器联动事件
PageDataTable SHALL 在特定操作时触发表格-容器联动事件。

##### Scenario: 点击编辑按钮触发row-edit事件
- WHEN 用户点击表格操作按钮中的"编辑"按钮
- THEN 系统 SHALL 触发 `row-edit` 事件，包含当前行数据

##### Scenario: 点击查看按钮触发row-view事件
- WHEN 用户点击表格操作按钮中的"查看"按钮
- THEN 系统 SHALL 触发 `row-view` 事件，包含当前行数据

##### Scenario: 点击新增按钮触发row-create事件
- WHEN 用户点击表格操作按钮中的"新增"按钮
- THEN 系统 SHALL 触发 `row-create` 事件

## ADDED Requirements

#### Requirement: PageDataTable SHALL 支持事件流集成
PageDataTable SHALL 与DsActionBus集成，支持事件流驱动的联动。

##### Scenario: 事件流配置
- WHEN 页面设计器配置了表格操作按钮的事件流
- THEN 系统 SHALL 按照事件流配置执行相应的动作

##### Scenario: 事件流执行
- WHEN 用户触发表格操作
- THEN 系统 SHALL 执行配置的事件流

## Risks

1. **向后兼容风险**：新增事件触发可能影响现有功能
   - **缓解**：确保现有功能不受影响，新增功能为可选配置

2. **性能风险**：频繁的事件分发可能影响性能
   - **缓解**：使用防抖机制，避免频繁触发
