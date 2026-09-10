# datasource-readonly-ui Specification

## Purpose
TBD - created by archiving change datasource-auto-creation. Update Purpose after archive.
## Requirements
### Requirement: 数据源管理界面只读模式

数据源管理界面 SHALL 仅支持查看操作，不支持新增、删除、编辑操作。

#### Scenario: 查看数据源列表
- **WHEN** 用户访问数据源管理页面
- **THEN** 系统显示数据源列表，仅包含查看按钮

#### Scenario: 查看数据源详情
- **WHEN** 用户点击数据源列表中的查看按钮
- **THEN** 系统显示数据源详情信息，所有字段为只读

#### Scenario: 禁止新增数据源
- **WHEN** 用户尝试新增数据源
- **THEN** 系统 SHALL 不显示新增按钮，或显示新增按钮但点击后提示"数据源由系统自动管理，不支持手动新增"

#### Scenario: 禁止编辑数据源
- **WHEN** 用户尝试编辑数据源
- **THEN** 系统 SHALL 不显示编辑按钮，或显示编辑按钮但点击后提示"数据源由系统自动管理，不支持手动编辑"

#### Scenario: 禁止删除数据源
- **WHEN** 用户尝试删除数据源
- **THEN** 系统 SHALL 不显示删除按钮，或显示删除按钮但点击后提示"数据源由系统自动管理，不支持手动删除"

---

### Requirement: 业务表单界面显示关联数据源

业务表单界面 SHALL 显示关联的数据源信息，且为只读模式。

#### Scenario: 查看业务表单关联的数据源
- **WHEN** 用户查看业务表单详情
- **THEN** 系统显示该业务表单关联的数据源信息，所有字段为只读

#### Scenario: 业务表单创建时显示数据源
- **WHEN** 用户创建业务表单
- **THEN** 系统自动创建数据源，并在界面显示关联的数据源信息

#### Scenario: 业务表单修改时显示数据源
- **WHEN** 用户修改业务表单
- **THEN** 系统自动更新数据源，并在界面显示关联的数据源信息

