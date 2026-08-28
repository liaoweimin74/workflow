## ADDED Requirements

### Requirement: PageDataTable SHALL 支持事件流集成

PageDataTable 组件 SHALL 与 DsActionBus 集成，支持事件流驱动的表格-容器联动，可在页面设计器中配置表格操作按钮与行点击的事件流。

#### Scenario: 配置表格操作按钮事件流

- **WHEN** 页面设计器为表格操作按钮配置了事件流
- **THEN** 系统 SHALL 按照事件流配置执行相应的动作

#### Scenario: 执行配置的事件流

- **WHEN** 用户触发表格操作（点击操作按钮或表格行）
- **THEN** 系统 SHALL 执行对应操作配置的事件流

### Requirement: PageDataTable SHALL 支持行点击事件

PageDataTable SHALL 支持配置行点击事件，用户点击表格行时触发事件流，事件中包含当前行数据。

#### Scenario: 配置行点击事件

- **WHEN** 用户在 PageDataTable 配置中启用行点击事件
- **THEN** 系统 SHALL 在用户点击表格行时触发事件流

#### Scenario: 行点击事件包含行数据

- **WHEN** 用户点击表格行
- **THEN** 系统 SHALL 在事件中包含当前行数据

### Requirement: PageDataTable SHALL 触发表格-容器联动事件

PageDataTable SHALL 在特定操作（编辑、查看、新增）时触发表格-容器联动事件，携带对应行数据。

#### Scenario: 点击编辑按钮触发 row-edit 事件

- **WHEN** 用户点击表格操作按钮中的"编辑"按钮
- **THEN** 系统 SHALL 触发 `row-edit` 事件，包含当前行数据

#### Scenario: 点击查看按钮触发 row-view 事件

- **WHEN** 用户点击表格操作按钮中的"查看"按钮
- **THEN** 系统 SHALL 触发 `row-view` 事件，包含当前行数据

#### Scenario: 点击新增按钮触发 row-create 事件

- **WHEN** 用户点击表格操作按钮中的"新增"按钮
- **THEN** 系统 SHALL 触发 `row-create` 事件

## Risks

1. **向后兼容风险**：新增事件触发可能影响现有功能
   - **缓解**：确保现有功能不受影响，新增功能为可选配置
2. **性能风险**：频繁的事件分发可能影响性能
   - **缓解**：使用防抖机制，避免频繁触发
