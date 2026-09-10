## ADDED Requirements

### Requirement: DataPicker SHALL reference data source via dataSourceId

DataPicker 组件 SHALL 通过 `dataSourceId`（页面内数据源标识）引用数据源，不再直接选择表单。

#### Scenario: DataPicker 配置包含 dataSourceId
- **WHEN** 配置 DataPicker 组件时
- **THEN** SHALL 提供 dataSourceId 字段，值为页面数据源绑定中的 id

#### Scenario: DataPicker 不再包含 sourceFormKey
- **WHEN** 配置 DataPicker 组件时
- **THEN** SHALL NOT 包含 sourceFormKey 字段（直接选表单）

---

### Requirement: DataPicker filter SHALL support component-level override

DataPicker 组件 SHALL 支持组件级 filter 配置，可覆盖或补充数据源级 filter。

#### Scenario: DataPicker 配置组件级 filter
- **WHEN** 配置 DataPicker 组件时提供 filter 字段
- **THEN** SHALL 使用该 filter 与数据源级 filter 合并（AND 方式）

#### Scenario: DataPicker 不配置组件级 filter
- **WHEN** 配置 DataPicker 组件时未提供 filter 字段
- **THEN** SHALL 仅使用数据源级 filter（如有）

---

### Requirement: DataPicker SHALL retain display and behavior configuration

DataPicker 组件 SHALL 保留 displayField、columns、searchColumns、maxCount 等显示和行为配置。

#### Scenario: DataPicker 显示配置
- **WHEN** 配置 DataPicker 组件时
- **THEN** SHALL 支持 displayField（显示字段）、columns（列表列）、searchColumns（搜索列）配置

#### Scenario: DataPicker 行为配置
- **WHEN** 配置 DataPicker 组件时
- **THEN** SHALL 支持 maxCount（最多可选数）、clearOnCascadeChange（级联变化清空）、allowCreate（允许新增）、detailReadonly（详情只读）配置
