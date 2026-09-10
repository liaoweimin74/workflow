# data-source-management Specification (Delta)

Baseline: openspec/specs/data-source-management/spec.md

## RENAMED Requirements

- FROM: `### Requirement: DataSourceAdapter SPI 预留（一期不实装查询）`
- TO: `### Requirement: DataSourceAdapter 统一实现`

## MODIFIED Requirements

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
