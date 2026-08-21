## MODIFIED Requirements

### Requirement: 数据源 CRUD

系统 SHALL 提供全局数据源管理接口 `GET /api/v1/data-sources`。
数据源字段 SHALL 包含：id、tenantId、name、type（FORM/SYSTEM/API）、formKey、sourceKey、params、status、createdAt、updatedAt。
同一租户内 name SHALL 唯一（重复创建返回 400）。
创建后的数据源 SHALL 为 DRAFT 状态；类型为 FORM 时 formKey 对应业务表单必须存在（不存在返回 400）；类型为 SYSTEM/API 时 sourceKey 必填。
用户 SHALL NOT 能够手动创建、编辑、删除数据源，数据源由系统自动管理。

#### Scenario: 查看 FORM 数据源
- **WHEN** 用户查看 type=FORM 的数据源
- **THEN** 系统显示数据源详情，包含关联的业务表单信息
- **AND** 所有字段为只读

#### Scenario: 查看 SYSTEM 数据源
- **WHEN** 用户查看 type=SYSTEM 的数据源
- **THEN** 系统显示数据源详情，包含系统数据类型信息
- **AND** 所有字段为只读

#### Scenario: 查看 API 数据源
- **WHEN** 用户查看 type=API 的数据源
- **THEN** 系统显示数据源详情，包含 API 配置信息
- **AND** 所有字段为只读

#### Scenario: 禁止创建数据源
- **WHEN** 用户尝试创建数据源
- **THEN** 系统 SHALL 拒绝操作并返回错误信息"数据源由系统自动管理，不支持手动创建"

#### Scenario: 禁止编辑数据源
- **WHEN** 用户尝试编辑数据源
- **THEN** 系统 SHALL 拒绝操作并返回错误信息"数据源由系统自动管理，不支持手动编辑"

#### Scenario: 禁止删除数据源
- **WHEN** 用户尝试删除数据源
- **THEN** 系统 SHALL 拒绝操作并返回错误信息"数据源由系统自动管理，不支持手动删除"

---

### Requirement: 数据源生命周期状态机

数据源状态机 SHALL 为 `DRAFT ⇄ ENABLED ⇄ DISABLED` 单向流转（DRAFT→ENABLED→DISABLED，DISABLED 可转回 ENABLED）。
启用（ENABLED）时系统 SHALL 校验 type 必填项齐全且合法，不合法返回 400 且状态不变。
禁用（DISABLED）SHALL 不影响已发布页面运行，但 SHALL 阻止新页面绑定或已绑定页面重新发布引用该数据源。
删除 SHALL 仅允许 DRAFT 状态；ENABLED/DISABLED 的数据源必须先禁用再删除（防止已发布页面引用悬空）。
用户 SHALL NOT 能够手动更改数据源状态，数据源状态由系统自动管理。

#### Scenario: 自动启用 FORM 数据源
- **WHEN** 系统自动创建 FORM 数据源
- **THEN** 数据源状态 SHALL 自动设置为 ENABLED
- **AND** 用户不能修改数据源状态

#### Scenario: 自动启用 SYSTEM 数据源
- **WHEN** 系统自动创建 SYSTEM 数据源
- **THEN** 数据源状态 SHALL 自动设置为 ENABLED
- **AND** 用户不能修改数据源状态

#### Scenario: 禁止手动启用数据源
- **WHEN** 用户尝试手动启用数据源
- **THEN** 系统 SHALL 拒绝操作并返回错误信息"数据源状态由系统自动管理，不支持手动启用"

#### Scenario: 禁止手动禁用数据源
- **WHEN** 用户尝试手动禁用数据源
- **THEN** 系统 SHALL 拒绝操作并返回错误信息"数据源状态由系统自动管理，不支持手动禁用"

---

### Requirement: 数据源类型合法性校验

系统 SHALL 按类型校验数据源配置合法性：
- FORM：formKey 对应业务表单存在且（启用时）已发布；params 自动生成（只读）。
- SYSTEM：sourceKey 命中内部接口枚举（dept-tree / user-tree）；params 自动生成。
- API：sourceKey 必填，params 为合法 JSON（含 list action）。

#### Scenario: 自动创建 FORM 数据源时校验
- **WHEN** 系统自动创建 FORM 数据源
- **THEN** 系统 SHALL 校验 formKey 对应的业务表单存在
- **AND** 如果表单不存在，系统 SHALL 记录错误日志但不影响业务表单创建

#### Scenario: 自动创建 SYSTEM 数据源时校验
- **WHEN** 系统自动创建 SYSTEM 数据源
- **THEN** 系统 SHALL 校验 sourceKey 是否在内部接口枚举中
- **AND** 如果不在枚举中，系统 SHALL 记录错误日志

---

### Requirement: 数据源管理界面

系统 SHALL 提供数据源管理页面 (DataSourceListPage)，以单一「API 配置」页签呈现：type 选择器（FORM/SYSTEM/API） + 统一 API 操作/列定义配置。FORM/SYSTEM 的 API 配置 SHALL 自动生成且只读；仅 API 类型允许编辑。同时 SHALL 支持查看、按类型/状态筛选。
设计器 SHALL 仅展示当前租户 ENABLED 数据源。
用户 SHALL NOT 能够新增、删除、编辑数据源，只能查看。

#### Scenario: 查看 FORM 数据源配置
- **WHEN** 用户查看 type=FORM 的数据源配置
- **THEN** 界面在 API 配置页签内只读展示表单的 CRUD 接口地址
- **AND** 用户不可编辑接口地址

#### Scenario: 查看 SYSTEM 数据源配置
- **WHEN** 用户查看 type=SYSTEM 的数据源配置
- **THEN** 界面在 API 配置页签内只读展示系统数据接口地址
- **AND** 用户不可编辑接口地址

#### Scenario: 查看 API 数据源配置
- **WHEN** 用户查看 type=API 的数据源配置
- **THEN** 界面在 API 配置页签内只读展示 API 接口配置
- **AND** 用户不可编辑接口配置

#### Scenario: 禁止新增数据源
- **WHEN** 用户尝试新增数据源
- **THEN** 系统 SHALL 不显示新增按钮，或显示新增按钮但点击后提示"数据源由系统自动管理，不支持手动新增"

#### Scenario: 禁止编辑数据源
- **WHEN** 用户尝试编辑数据源
- **THEN** 系统 SHALL 不显示编辑按钮，或显示编辑按钮但点击后提示"数据源由系统自动管理，不支持手动编辑"

#### Scenario: 禁止删除数据源
- **WHEN** 用户尝试删除数据源
- **THEN** 系统 SHALL 不显示删除按钮，或显示删除按钮但点击后提示"数据源由系统自动管理，不支持手动删除"