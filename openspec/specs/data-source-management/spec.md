# data-source-management Specification

## Purpose
TBD - created by archiving change query-view-designer. Update Purpose after archive.
## Requirements
### Requirement: 数据源 CRUD

系统 SHALL 提供全局数据源管理接口 `GET/POST/PUT/DELETE /api/v1/data-sources`。
数据源字段 SHALL 包含：id、tenantId、name、type（FORM/SYSTEM/API）、formKey、sourceKey、params、status、createdAt、updatedAt。
同一租户内 name SHALL 唯一（重复创建返回 400）。
创建后的数据源 SHALL 为 DRAFT 状态；类型为 FORM 时 formKey 对应业务表单必须存在（不存在返回 400）；类型为 SYSTEM/API 时 sourceKey 必填。

#### Scenario: 创建 FORM 数据源
- **WHEN** 用户创建 type=FORM 的数据源，name="商品列表"，formKey="product"
- **AND** product 表单存在
- **THEN** 创建成功（status=DRAFT）
- **AND** 后续页面可通过 refId 引用该数据源

#### Scenario: 创建引用不存在表单的数据源
- **WHEN** 用户创建 type=FORM 的数据源
- **AND** formKey="not-exist-form" 且该表单不存在
- **THEN** 系统返回 400 错误
- **AND** 不创建记录

#### Scenario: 同租户重复名称
- **WHEN** 用户创建第二个 name="商品列表" 的数据源（同租户内）
- **THEN** 系统返回 400 错误（name 冲突）

#### Scenario: 创建 API 数据源（一期仅登记）
- **WHEN** 用户创建 type=API 的数据源，name="外部库存"，sourceKey="external-stock"，params 含鉴权参数
- **THEN** 创建成功（status=DRAFT）
- **AND** 页面可绑定该数据源（查询时返回"数据源类型未启用"）

---

### Requirement: 数据源生命周期状态机

数据源状态机 SHALL 为 `DRAFT ⇄ ENABLED ⇄ DISABLED` 单向流转（DRAFT→ENABLED→DISABLED，DISABLED 可转回 ENABLED）。
启用（ENABLED）时系统 SHALL 校验 type 必填项齐全且合法，不合法返回 400 且状态不变。
禁用（DISABLED）SHALL 不影响已发布页面运行，但 SHALL 阻止新页面绑定或已绑定页面重新发布引用该数据源。
删除 SHALL 仅允许 DRAFT 状态；ENABLED/DISABLED 的数据源必须先禁用再删除（防止已发布页面引用悬空）。

#### Scenario: 启用数据源
- **WHEN** 用户对 type=FORM、formKey="product"（表单已发布）的 DRAFT 数据源调用启用
- **THEN** 数据源变为 ENABLED
- **AND** 页面发布校验可通过该数据源的 refId 引用

#### Scenario: 启用必填项不齐全的数据源
- **WHEN** 用户启用 type=FORM 但 formKey 为空的数据源
- **THEN** 系统返回 400 错误
- **AND** 状态保持 DRAFT

#### Scenario: 禁用已发布页面引用的数据源
- **WHEN** 用户禁用数据源 DS-A
- **AND** 已发布页面 P 的 dataSources 引用了 DS-A
- **THEN** 禁用成功，页面 P 运行不受影响（其发布时快照已固定查询字段）
- **AND** 页面 P 修改 schema 后重新发布时，因引用了 DISABLED 数据源而返回 400

#### Scenario: 删除非 DRAFT 数据源
- **WHEN** 用户删除 ENABLED 状态的数据源
- **THEN** 系统返回 400（需先禁用）
- **AND** 记录保留

---

### Requirement: 数据源类型合法性校验

系统 SHALL 按类型校验数据源配置合法性：
- FORM：formKey 对应业务表单存在且该表单已发布（启用时校验；DRAFT 保存仅校验存在性）
- SYSTEM：sourceKey 命中系统结构注册表枚举（dept-tree / user-tree 等）
- API：sourceKey 必填，params 为合法 JSON（非法返回 400）

FORM 数据源绑定表单的列集合（column_config）在启用时快照记录，供页面发布校验引用列一致性。

#### Scenario: 启用绑定未发布表单的数据源
- **WHEN** 用户启用 type=FORM、formKey="draft-form" 的数据源
- **AND** draft-form 表单存在但未发布（status=DRAFT）
- **THEN** 系统返回 400 错误
- **AND** 状态保持 DRAFT

#### Scenario: 非法 SYSTEM key
- **WHEN** 用户创建 type=SYSTEM、sourceKey="unknown-tree"（不在注册表枚举中）
- **THEN** 系统返回 400 错误

#### Scenario: 非法 API params
- **WHEN** 用户创建 type=API、params 为非法 JSON 字符串
- **THEN** 系统返回 400 错误

---

### Requirement: 数据源管理界面

系统 SHALL 提供数据源管理页面（DataSourceListPage），展示数据源列表（名称/类型/绑定对象/状态/更新时间），支持创建、编辑、启用、禁用、删除、按类型/状态筛选。
设计器（PageDesigner）SHALL 提供数据源下拉选择：仅展示当前租户 ENABLED 状态的数据源。

#### Scenario: 列表页展示与筛选
- **WHEN** 管理员打开数据源管理页
- **THEN** 展示当前租户全部数据源（含 type/status 徽标）
- **AND** 可按 type 与 status 筛选

#### Scenario: 设计器仅展示可用数据源
- **WHEN** 用户在 PageDesigner 中为数据组件选择数据源
- **THEN** 下拉仅列出当前租户 ENABLED 的数据源
- **AND** DRAFT/DISABLED 数据源不可见

---

### Requirement: DataSourceAdapter SPI 预留（一期不实装查询）

系统 SHALL 定义 `DataSourceAdapter` SPI：`supports(type)` / `query(DataSourceDefinition, PageQuery, TenantContext)`。
一期仅注册 FORM 适配器（路由到 BizDataService），SYSTEM/API 适配器 SHALL 预留接口但返回"数据源类型未启用"错误。
新数据源类型接入 SHALL 通过注册新适配器实现，不修改页面查询链路。

#### Scenario: FORM 数据源查询
- **WHEN** 页面查询请求引用 type=FORM 数据源
- **THEN** 查询路由到 BizDataService 执行分页过滤（受页面绑定层白名单约束）

#### Scenario: API 数据源查询返回未启用
- **WHEN** 页面查询请求引用 type=API 数据源
- **THEN** 系统返回"数据源类型未启用"错误
- **AND** 不发起外部请求

---

### Requirement: 数据源管理不建表

数据源管理 SHALL 只登记元数据（`wf_data_source` 表），创建/启用/禁用/删除 SHALL NOT 调用 DynamicTableManager、不执行任何 CREATE TABLE / ALTER TABLE 语句。

#### Scenario: 启用数据源不触发 DDL
- **WHEN** FORM 数据源（formKey="product"）被启用
- **THEN** 不执行任何 DDL
- **AND** wf_biz_product 物理表保持原状（由表单发布流程管理）

