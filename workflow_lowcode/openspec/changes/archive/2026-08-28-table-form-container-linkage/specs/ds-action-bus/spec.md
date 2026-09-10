## ADDED Requirements

### Requirement: DsActionBus SHALL 支持表格-容器联动事件注册

DsActionBus SHALL 支持处理表格-容器联动的事件，包括 `row-edit`、`row-view`、`row-click`、`row-create` 事件类型，支持组件注册对应事件监听。

#### Scenario: 注册 row-edit 事件

- **WHEN** 组件注册了 `row-edit` 事件监听
- **THEN** DsActionBus SHALL 在接收到 `row-edit` 事件时调用注册的监听器

#### Scenario: 注册 row-view 事件

- **WHEN** 组件注册了 `row-view` 事件监听
- **THEN** DsActionBus SHALL 在接收到 `row-view` 事件时调用注册的监听器

#### Scenario: 注册 row-click 事件

- **WHEN** 组件注册了 `row-click` 事件监听
- **THEN** DsActionBus SHALL 在接收到 `row-click` 事件时调用注册的监听器

#### Scenario: 注册 row-create 事件

- **WHEN** 组件注册了 `row-create` 事件监听
- **THEN** DsActionBus SHALL 在接收到 `row-create` 事件时调用注册的监听器

### Requirement: DsActionBus SHALL 支持表格-容器联动动作执行

DsActionBus SHALL 支持执行表格-容器联动的动作，包括 `open-container`、`load-record`、`save-container`、`close-container` 动作类型。

#### Scenario: 执行 open-container 动作

- **WHEN** 事件流执行 `open-container` 动作
- **THEN** DsActionBus SHALL 打开目标数据容器组件

#### Scenario: 执行 load-record 动作

- **WHEN** 事件流执行 `load-record` 动作
- **THEN** DsActionBus SHALL 从数据源加载指定记录，并填充到目标数据容器

#### Scenario: 执行 save-container 动作

- **WHEN** 事件流执行 `save-container` 动作
- **THEN** DsActionBus SHALL 调用数据源保存接口，保存目标数据容器中的数据

#### Scenario: 执行 close-container 动作

- **WHEN** 事件流执行 `close-container` 动作
- **THEN** DsActionBus SHALL 关闭目标数据容器组件

## Risks

1. **向后兼容风险**：新增事件和动作可能影响现有功能
   - **缓解**：确保现有功能不受影响，新增功能为可选配置
2. **性能风险**：频繁的事件分发可能影响性能
   - **缓解**：使用防抖机制，避免频繁触发
