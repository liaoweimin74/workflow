# data-source-management Delta Specification

> 变更 `form-join-sql-engine`：FORM 数据源 params 由"自动生成只读"改为"CRUD 接口自动生成只读 + JOIN/SQL 查询配置开放编辑"

## MODIFIED Requirements

### Requirement: 数据源类型合法性校验

系统 SHALL 按类型校验数据源配置合法性：
- FORM：formKey 对应业务表单存在且（启用时）已发布；params 自动生成（只读），但其中的 JOIN/SQL 查询配置段（`queryMode`/`joins`/`query`/`columns`）允许管理员编辑，且须通过查询配置合法性校验（config 模式 targetFormKey 存在、virtualKey 唯一；sql 模式仅 SELECT、含 `:tenantId`、columns 声明合法）�- SYSTEM：sourceKey 命中内部接口枚举（dept-tree / user-tree）；params 自动生成（只读）�- API：sourceKey 必填，params 为合法 JSON（含 list action）�?
#### Scenario: 自动创建 FORM 数据源时校验
- **WHEN** 系统自动创建 FORM 数据源
- **THEN** 系统 SHALL 校验 formKey 对应的业务表单存在
- **AND** 如果表单不存在，系统 SHALL 记录错误日志但不影响业务表单创建
- **AND** 自动生成的 CRUD 接口 params 为只读

#### Scenario: 编辑 FORM 数据源 JOIN 配置
- **WHEN** 管理员编辑 FORM 数据源的 config 模式 joins 配置
- **THEN** 系统 SHALL 校验 targetFormKey 对应表单存在、virtualKey 唯一
- **AND** 校验通过后保存，CRUD 接口 params 段保持不变

#### Scenario: 编辑 FORM 数据源 SQL 模板
- **WHEN** 管理员编辑 FORM 数据源的 sql 模式 query 与 columns
- **THEN** 系统 SHALL 校验仅 SELECT、含 `:tenantId`、columns 与 SELECT 输出匹配
- **AND** 校验通过后保存，CRUD 接口 params 段保持不变

#### Scenario: 自动创建 SYSTEM 数据源时校验
- **WHEN** 系统自动创建 SYSTEM 数据源
- **THEN** 系统 SHALL 校验 sourceKey 是否在内部接口枚举中
- **AND** 如果不在枚举中，系统 SHALL 记录错误日志

### Requirement: 数据源管理界面

系统 SHALL 提供数据源管理页面（DataSourceListPage），以单一「API 配置」页签呈现：type 选择器（FORM/SYSTEM/API）+ 统一 API 操作/列定义配置。FORM/SYSTEM 的 API 配置 SHALL 自动生成且只读；FORM 数据源 SHALL 额外提供「关联查询配置」（JOIN/SQL 双模式）编辑入口，允许管理员配置 `queryMode` 及对应的 joins/query/columns；API 类型允许编辑。同时 SHALL 支持查看、按类型/状态筛选。设计器 SHALL 仅展示当前租户 ENABLED 数据源。用户 SHALL NOT 能够新增、删除数据源，只能查看与（FORM 查询配置、API 配置）编辑。
#### Scenario: 查看 FORM 数据源配置
- **WHEN** 用户查看 type=FORM 的数据源配置
- **THEN** 界面在「API 配置」页签内只读展示表单的 CRUD 接口地址
- **AND** 用户可编辑「关联查询配置」（JOIN/SQL 双模式）

#### Scenario: 查看 SYSTEM 数据源配置
- **WHEN** 用户查看 type=SYSTEM 的数据源配置
- **THEN** 界面在「API 配置」页签内只读展示系统数据接口地址
- **AND** 用户不可编辑接口地址

#### Scenario: 查看 API 数据源配置
- **WHEN** 用户查看 type=API 的数据源配置
- **THEN** 界面在「API 配置」页签内只读展示 API 接口配置
- **AND** 用户不可编辑接口配置
