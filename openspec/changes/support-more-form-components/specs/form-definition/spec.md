# form-definition Specification (delta)

## Purpose
修改 form-definition 的发布校验与列映射逻辑：扩展支持组件、subForm storageMode 分派。

## Requirements
### Requirement: 表单定义发布 (MODIFIED)

系统 SHALL 支持发布表单定义，将 DRAFT 状态的表单发布为新版本。

发布时，系统 SHALL 创建新版本记录（version 自增），状态为 PUBLISHED，并更新 published_version。

发布前，系统 SHALL 比较当前 DRAFT 的 schema 与该 key 最近一次 PUBLISHED 记录的 schema。若 schema 未变化，系统 SHALL 拒绝发布。

同一表单定义同时只 SHALL 有一个 PUBLISHED 版本。新版本发布后，旧 PUBLISHED 版本 SHALL 变为 ARCHIVED。

已发布（PUBLISHED）版本的 schema 不可修改，修改已发布表单 SHALL 创建新的 DRAFT 副本。

发布 type=BUSINESS 的表单时，系统 SHALL 基于 column_config 通过运行时受控 DDL 创建或变更物理表 wf_biz_<formKey>（见 business-form-data 能力），并将结构变更随新版本记录审计。

发布 type=BUSINESS 的表单时，系统 SHALL 对发布过程加锁（对 form_def 行 SELECT ... FOR UPDATE），防止并发发布导致 DDL 竞态。

发布 type=BUSINESS 的表单时，系统 SHALL 校验 schema 不含纯展示型/结构性不支持组件（divider、groupContainer、dataTable 等），子表单（subForm）SHALL 以 JSON 列方式支持（见 biz-form-extra-components 能力）。

发布 type=BUSINESS 的表单时，若列映射含 subForm 且 storageMode=JSON，系统 SHALL 将 subForm 字段映射为主表 JSON 列并走现有 ensureTable 逻辑；storageMode=SUB_TABLE 的列 SHALL 被拒绝（本期未实现）。

#### Scenario: 发布业务表单 (MODIFIED)

- **WHEN** 用户调用 POST /api/v1/form-definitions/{id}/publish
- **AND** 表单 type=BUSINESS
- **AND** column_config 包含合法列映射
- **THEN** 系统创建新版本记录（version 自增，status=PUBLISHED）
- **AND** 系统执行受控 DDL 创建或变更物理表 wf_biz_<formKey>
- **AND** 新版本记录保存结构变更历史

#### Scenario: 发布业务表单含 subForm（JSON 模式）

- **WHEN** 用户调用 POST /api/v1/form-definitions/{id}/publish
- **AND** 表单 type=BUSINESS
- **AND** column_config 含 subForm 列且 storageMode=JSON
- **THEN** 系统执行受控 DDL 创建或变更物理表 wf_biz_<formKey>
- **AND** subForm 列以 JSON 列建表

#### Scenario: 发布业务表单含 subForm（SUB_TABLE 模式）

- **WHEN** 用户调用 POST /api/v1/form-definitions/{id}/publish
- **AND** column_config 含 storageMode=SUB_TABLE 的列
- **THEN** 系统返回 400 错误
- **AND** 提示子表模式暂未实现
- **AND** 不创建新版本记录

#### Scenario: 发布业务表单但 schema 含纯展示型组件

- **WHEN** 用户调用 POST /api/v1/form-definitions/{id}/publish
- **AND** 表单 type=BUSINESS
- **AND** schema 包含 divider/groupContainer/dataTable 组件
- **THEN** 系统返回 400 错误
- **AND** 提示移除不支持组件后方可发布
- **AND** 不创建新版本记录

### Requirement: 修改已发布表单

系统 SHALL 在用户对 PUBLISHED 状态的表单调用 PUT 更新时，创建新的 DRAFT 副本（同 key，同 version，同 schema），原 PUBLISHED 版本保持不变。此需求保持不变（无变更）。
