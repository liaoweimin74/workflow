# datasource-auto-params Specification

## ADDED Requirements

### Requirement: 系统生成 FORM/SYSTEM 数据源参数
系统 SHALL 在创建/启用 type=FORM 或 type=SYSTEM 的数据源时，根据 formKey/sourceKey 自动生成 `params` JSON（API 路径 + list/get/create/update/delete 操作 + parse/totalParse 规则）。生成的 params SHALL 为只读（UI 不可编辑）。
- FORM：list→GET /api/v1/biz-data/{formKey}，create→POST /api/v1/biz-data/{formKey}，get→GET /api/v1/biz-data/{formKey}/{id}，update→PUT /api/v1/biz-data/{formKey}/{id}，delete→DELETE /api/v1/biz-data/{formKey}/{id}；parse="records"，totalParse="total"
- SYSTEM：list→GET /api/v1/internal/system/{internalKey}，get/create/update/delete 对应内部接口；internalKey 由 sourceKey 映射（dept-tree→dept-tree，user-tree→users）

#### Scenario: 创建 FORM 数据源时自动生成 params
- **WHEN** 用户创建 type=FORM、formKey="product" 的数据源
- **THEN** 系统生成 params JSON（接口 action=/api/v1/biz-data/product 等）
- **AND** 前端 DataSourceListPage 以只读展示该 params，非 API 类型用户不可编辑

#### Scenario: 启用 SYSTEM 数据源时回填缺省 internalKey
- **WHEN** 用户启用 type=SYSTEM、sourceKey="dept-tree" 的数据源
- **THEN** 系统生成 params（list action=/api/v1/internal/system/dept-tree）
- **AND** sourceKey 不在枚举范围返回 400

### Requirement: 单页签 API 配置界面
前端 DataSourceListPage SHALL 合并为单一「API 配置」页签：type 选择器（FORM/SYSTEM/API），下方为统一的 API 操作/列定义配置。FORM/SYSTEM 显示自动生成的接口配置为只读；仅 API 类型允许用户编辑。

#### Scenario: 切换为 SYSTEM 类型
- **WHEN** 用户在配置页选择 type=SYSTEM、sourceKey="user-tree"
- **THEN** 界面展示自动生成的 user-tree 接口配置（只读）
- **AND** 用户无法编辑接口地址

#### Scenario: 编辑 API 类型数据源
- **WHEN** 用户选择 type=API
- **THEN** 界面允许编辑 list/get/create/update/delete action+method、column 定义、headers 等
