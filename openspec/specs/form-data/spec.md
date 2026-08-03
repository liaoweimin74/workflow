# form-data Specification

## Purpose
TBD - created by archiving change form-designer. Update Purpose after archive.
## Requirements
### Requirement: 表单实例数据持久化

系统 SHALL 提供表单实例数据的保存和查询接口。

表单实例数据 SHALL 存储在 wf_form_data 表中，以 JSON 格式（data_json 字段）持久化。

表单实例数据 SHALL 关联流程实例（process_instance_id）和表单定义（form_def_id）。

表单实例数据 SHALL 记录表单版本快照（form_version），保证旧数据与旧 schema 对应。

#### Scenario: 保存表单数据
- **WHEN** 用户提交表单，调用 POST /api/v1/form-data
- **THEN** 系统将表单数据以 JSON 格式保存到 wf_form_data
- **AND** 记录 form_def_id、form_version、process_instance_id
- **AND** 返回创建的表单数据记录

#### Scenario: 按流程实例查询表单数据
- **WHEN** 用户调用 GET /api/v1/form-data?processInstanceId={id}&formDefId={formDefId}
- **THEN** 系统返回该流程实例下指定表单定义的表单数据

#### Scenario: 更新表单数据
- **WHEN** 用户调用 PUT /api/v1/form-data/{id}，提供更新后的 data_json
- **THEN** 系统更新表单数据记录
- **AND** updated_at 自动更新

#### Scenario: 获取单条表单数据
- **WHEN** 用户调用 GET /api/v1/form-data/{id}
- **THEN** 系统返回该表单数据记录，包含完整 data_json

### Requirement: 表单数据版本兼容

系统 SHALL 在渲染表单数据时，使用该数据记录的 form_version 对应的 schema。

当表单定义已发布新版本时，旧流程实例的表单数据 SHALL 仍使用旧版本 schema 渲染。

#### Scenario: 旧数据使用旧版本 schema
- **WHEN** 流程实例 A 在表单 v1 时提交了数据
- **AND** 表单定义已发布 v2
- **THEN** 渲染流程实例 A 的表单数据时
- **AND** 使用 v1 版本的 schema 渲染

#### Scenario: 新流程实例使用最新版本
- **WHEN** 新流程实例 B 在表单 v2 发布后发起
- **THEN** 表单数据使用 v2 版本的 schema 渲染
- **AND** 表单数据记录的 form_version 为 2

### Requirement: 表单数据多租户隔离

表单数据 SHALL 按租户隔离，不同租户的表单数据互不可见。

查询表单数据时，系统 SHALL 自动过滤当前租户的数据。

#### Scenario: 租户隔离查询
- **WHEN** 租户 A 的用户查询表单数据
- **THEN** 仅返回租户 A 的表单数据
- **AND** 不返回租户 B 的数据

