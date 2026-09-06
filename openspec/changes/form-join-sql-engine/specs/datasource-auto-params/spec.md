# datasource-auto-params Delta Specification

> 变更 `form-join-sql-engine`：FORM 数据源 params 生成逻辑扩展支持 queryMode 的 JOIN/SQL 配置段

## MODIFIED Requirements

### Requirement: 系统生成 FORM/SYSTEM 数据源参数

系统 SHALL 在创建/启用 type=FORM 与 type=SYSTEM 的数据源时，根据 formKey/sourceKey 自动生成 `params` JSON（API 路径 + list/get/create/update/delete 操作 + parse/totalParse 规则 + FORM 的 `queryMode` 与查询配置段）。自动生成的 CRUD 接口 params SHALL 为只读（UI 不可编辑）；FORM 数据源的查询配置段（`queryMode`/`joins`/`query`/`columns`）SHALL 允许管理员编辑，缺省 `queryMode=config` 且 joins 为空（等价当前单表行为，向后兼容）�-
- FORM：list→GET /api/v1/biz-data/{formKey}，create→POST /api/v1/biz-data/{formKey}，get→GET /api/v1/biz-data/{formKey}/{id}，update→PUT /api/v1/biz-data/{formKey}/{id}，delete→DELETE /api/v1/biz-data/{formKey}/{id}；parse="records"，totalParse="total"；params 追加 queryMode + joins/query/columns（可编辑）
- SYSTEM：list→GET /api/v1/internal/system/{internalKey}，get/create/update/delete 对应内部接口；internalKey 由 sourceKey 映射（dept-tree→dept-tree，user-tree→users）
#### Scenario: 创建 FORM 数据源时自动生成 params
- **WHEN** 用户创建 type=FORM、formKey="product" 的数据源
- **THEN** 系统生成 params JSON（接口 action=/api/v1/biz-data/product 等 + 缺省 queryMode=config 且 joins 空）
- **AND** 前端 DataSourceListPage 以只读展示 CRUD 接口 params，允许编辑关联查询配置段

#### Scenario: 编辑 FORM 数据源 JOIN 配置不回退 CRUD
- **WHEN** 管理员编辑 FORM 数据源的 queryMode/joins/query/columns
- **THEN** 系统保留自动生成的 CRUD 接口 params 不变
- **AND** 仅更新查询配置段

#### Scenario: 启用 SYSTEM 数据源时回填缺省 internalKey
- **WHEN** 用户启用 type=SYSTEM、sourceKey="dept-tree" 的数据源
- **THEN** 系统生成 params（list action=/api/v1/internal/system/dept-tree）
- **AND** sourceKey 不在枚举范围返回 400
