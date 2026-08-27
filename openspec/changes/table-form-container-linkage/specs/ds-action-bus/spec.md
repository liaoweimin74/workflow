## Requirement: ds-action-bus

数据源事件总线，新增表格-容器联动事件和动作。

### MODIFIED Requirements

#### Requirement: EventsConfig SHALL 支持 row-edit 触发器
EventsConfig 组件 SHALL 在触发器下拉中提供 `row-edit`（行编辑）选项。

##### Scenario: 选择 row-edit 触发器
- WHEN 用户在 EventsConfig 中选择触发器为 `row-edit`
- THEN 该事件配置 SHALL 包含 `trigger: 'row-edit'`

#### Requirement: EventsConfig SHALL 支持 row-view 触发器
EventsConfig 组件 SHALL 在触发器下拉中提供 `row-view`（行查看）选项。

##### Scenario: 选择 row-view 触发器
- WHEN 用户在 EventsConfig 中选择触发器为 `row-view`
- THEN 该事件配置 SHALL 包含 `trigger: 'row-view'`

#### Requirement: EventsConfig SHALL 支持 row-click 触发器
EventsConfig 组件 SHALL 在触发器下拉中提供 `row-click`（行点击）选项。

##### Scenario: 选择 row-click 触发器
- WHEN 用户在 EventsConfig 中选择触发器为 `row-click`
- THEN 该事件配置 SHALL 包含 `trigger: 'row-click'`

#### Requirement: EventsConfig SHALL 支持 row-create 触发器
EventsConfig 组件 SHALL 在触发器下拉中提供 `row-create`（新增行）选项。

##### Scenario: 选择 row-create 触发器
- WHEN 用户在 EventsConfig 中选择触发器为 `row-create`
- THEN 该事件配置 SHALL 包含 `trigger: 'row-create'`

#### Requirement: EventsConfig SHALL 支持 open-container 动作
EventsConfig 组件 SHALL 在动作类型下拉中提供 `open-container`（打开容器）选项。

##### Scenario: 选择 open-container 动作
- WHEN 用户在 EventsConfig 中选择动作为 `open-container`
- THEN 该动作配置 SHALL 包含 `type: 'open-container'`，支持 params: target（目标容器ID）、displayMode（显示模式）

#### Requirement: EventsConfig SHALL 支持 load-record 动作
EventsConfig 组件 SHALL 在动作类型下拉中提供 `load-record`（加载记录）选项。

##### Scenario: 选择 load-record 动作
- WHEN 用户在 EventsConfig 中选择动作为 `load-record`
- THEN 该动作配置 SHALL 包含 `type: 'load-record'`，支持 params: target（目标容器ID）、recordId（记录ID）

#### Requirement: EventsConfig SHALL 支持 save-container 动作
EventsConfig 组件 SHALL 在动作类型下拉中提供 `save-container`（保存容器）选项。

##### Scenario: 选择 save-container 动作
- WHEN 用户在 EventsConfig 中选择动作为 `save-container`
- THEN 该动作配置 SHALL 包含 `type: 'save-container'`，支持 params: target（目标容器ID）

#### Requirement: EventsConfig SHALL 支持 close-container 动作
EventsConfig 组件 SHALL 在动作类型下拉中提供 `close-container`（关闭容器）选项。

##### Scenario: 选择 close-container 动作
- WHEN 用户在 EventsConfig 中选择动作为 `close-container`
- THEN 该动作配置 SHALL 包含 `type: 'close-container'`，支持 params: target（目标容器ID）

## ADDED Requirements

#### Requirement: DsActionBus SHALL 支持表格-容器联动事件
DsActionBus SHALL 支持处理表格-容器联动的事件和动作。

##### Scenario: 注册row-edit事件
- WHEN 组件注册了 `row-edit` 事件监听
- THEN DsActionBus SHALL 在接收到 `row-edit` 事件时调用注册的监听器

##### Scenario: 注册row-view事件
- WHEN 组件注册了 `row-view` 事件监听
- THEN DsActionBus SHALL 在接收到 `row-view` 事件时调用注册的监听器

##### Scenario: 注册row-click事件
- WHEN 组件注册了 `row-click` 事件监听
- THEN DsActionBus SHALL 在接收到 `row-click` 事件时调用注册的监听器

##### Scenario: 注册row-create事件
- WHEN 组件注册了 `row-create` 事件监听
- THEN DsActionBus SHALL 在接收到 `row-create` 事件时调用注册的监听器

#### Requirement: DsActionBus SHALL 支持执行表格-容器联动动作
DsActionBus SHALL 支持执行表格-容器联动的动作。

##### Scenario: 执行open-container动作
- WHEN 事件流执行 `open-container` 动作
- THEN DsActionBus SHALL 打开目标数据容器组件

##### Scenario: 执行load-record动作
- WHEN 事件流执行 `load-record` 动作
- THEN DsActionBus SHALL 从数据源加载指定记录，并填充到目标数据容器

##### Scenario: 执行save-container动作
- WHEN 事件流执行 `save-container` 动作
- THEN DsActionBus SHALL 调用数据源保存接口，保存目标数据容器中的数据

##### Scenario: 执行close-container动作
- WHEN 事件流执行 `close-container` 动作
- THEN DsActionBus SHALL 关闭目标数据容器组件

## Risks

1. **向后兼容风险**：新增事件和动作可能影响现有功能
   - **缓解**：确保现有功能不受影响，新增功能为可选配置

2. **性能风险**：频繁的事件分发可能影响性能
   - **缓解**：使用防抖机制，避免频繁触发
