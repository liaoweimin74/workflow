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
- FORM：formKey 对应业务表单存在且（启用时）已发布；params 自动生成（只读）。
- SYSTEM：sourceKey 命中内部接口枚举（dept-tree / user-tree）；params 自动生成。
- API：sourceKey 必填，params 为合法 JSON（含 list action）。

#### Scenario: 非法 SYSTEM key
- **WHEN** 用户创建 type=SYSTEM、sourceKey="unknown-tree"
- **THEN** 系统返回 400 错误

#### Scenario: 启用 FORM 数据源时自动生成 params
- **WHEN** 用户启用 type=FORM、formKey="product"（表单已发布）的数据源
- **THEN** 系统补填 params（接口 action=/api/v1/biz-data/product 等）
- **AND** 前端仅读展示

### Requirement: 数据源管理界面
系统 SHALL 提供数据源管理页面 (DataSourceListPage)，以单一「API 配置」页签呈现：type 选择器（FORM/SYSTEM/API） + 统一 API 操作/列定义配置。FORM/SYSTEM 的 API 配置 SHALL 自动生成且只读；仅 API 类型允许编辑。同时 SHALL 支持创建、编辑、启用、禁用、删除、按类型/状态筛选。
设计器 SHALL 仅展示当前租户 ENABLED 数据源。

#### Scenario: 单页签配置 FORM 数据源
- **WHEN** 用户在数据源管理页创建 type=FORM、formKey="product"
- **THEN** 界面在 API 配置页签内只读展示 product 的 CRUD 接口地址
- **AND** 用户不可编辑接口地址

#### Scenario: 编辑 API 数据源
- **WHEN** 用户在 API 配置页签编辑 type=API 数据源
- **THEN** 允许编辑 list/get/create/update/delete action+method、column 定义、headers

### Requirement: 数据源管理不建表

数据源管理 SHALL 只登记元数据（`wf_data_source` 表），创建/启用/禁用/删除 SHALL NOT 调用 DynamicTableManager、不执行任何 CREATE TABLE / ALTER TABLE 语句。

#### Scenario: 启用数据源不触发 DDL
- **WHEN** FORM 数据源（formKey="product"）被启用
- **THEN** 不执行任何 DDL
- **AND** wf_biz_product 物理表保持原状（由表单发布流程管理）

### Requirement: DataSourceAdapter 统一实现
系统 SHALL 注册唯一 `UnifiedDataSourceAdapter`，按数据源类型与 sourceKey 统一派发查询/元数据/单条/增删改：
- type=FORM：走 internal:// /api/v1/biz-data/{formKey}，委托 BizDataController；
- type=SYSTEM：走 internal:// /api/v1/internal/system/{internalKey}，委托 SystemInternalController；
- type=API：走外部 HTTP（HttpLogicExecutor），按 params 配置的多操作执行。
所有类型均 SHALL 支持 metadata/query/get/create/update/delete。只读能力不足时 SHALL 继承 default 抛"该数据源不支持XX"。

#### Scenario: FORM 数据源查询
- **WHEN** 页面查询请求引用 type=FORM 数据源
- **THEN** 查询路由到 UnifiedDataSourceAdapter → internal:// BizDataController 执行分页过滤
- **AND** 返回 BizDataPageVO

#### Scenario: SYSTEM 数据源查询
- **WHEN** 页面查询请求引用 type=SYSTEM、sourceKey="dept-tree" 的数据源
- **THEN** 查询路由到 internal:// SystemInternalController，返回扁平部门行
- **AND** 不再返回"数据源类型未启用"

#### Scenario: API 数据源查询
- **WHEN** 页面查询请求引用 type=API 的数据源
- **THEN** 系统执行配置的外部 list action，按 parse/totalParse 提取
- **AND** 返回 BizDataPageVO（不再返回"not enabled"）

#### Scenario: 只读数据源写操作返回不支持
- **WHEN** 数据源为仅读配置（如 SYSTEM dept-tree 未配置写操作）执行 create
- **THEN** 系统返回 400"该数据源不支持新增"
- **AND** 不执行任何写操作

