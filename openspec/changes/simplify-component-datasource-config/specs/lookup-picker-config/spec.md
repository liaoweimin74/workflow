## MODIFIED Requirements

### Requirement: LookupPicker SHALL reference data source via dataSourceId

LookupPicker 组件 SHALL 通过 `dataSourceId`（页面内数据源标识）引用数据源，不再维护独立的数据源配置。

#### Scenario: LookupPicker 配置包含 dataSourceId
- **WHEN** 配置 LookupPicker 组件时
- **THEN** SHALL 提供 dataSourceId 字段，值为页面数据源绑定中的 id

#### Scenario: LookupPicker 不再包含独立数据源配置
- **WHEN** 配置 LookupPicker 组件时
- **THEN** SHALL NOT 包含 sourceType、sourceFormKey、action、method、headers、data 等独立数据源配置字段

---

### Requirement: LookupPicker filter SHALL support component-level override

LookupPicker 组件 SHALL 支持组件级 filter 配置，可覆盖或补充数据源级 filter。

#### Scenario: LookupPicker 配置组件级 filter
- **WHEN** 配置 LookupPicker 组件时提供 filter 字段
- **THEN** SHALL 使用该 filter 与数据源级 filter 合并（AND 方式）

#### Scenario: LookupPicker 不配置组件级 filter
- **WHEN** 配置 LookupPicker 组件时未提供 filter 字段
- **THEN** SHALL 仅使用数据源级 filter（如有）

---

### Requirement: LookupPicker SHALL retain display and column configuration

LookupPicker 组件 SHALL 保留 displayField、columns、returnFields 等显示和映射配置。

#### Scenario: LookupPicker 显示配置
- **WHEN** 配置 LookupPicker 组件时
- **THEN** SHALL 支持 displayField（显示字段）、columns（列表列）、returnFields（字段映射）配置
