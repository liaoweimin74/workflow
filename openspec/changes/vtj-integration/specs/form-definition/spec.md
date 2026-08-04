# form-definition Delta Spec

## MODIFIED Requirements

### Requirement: 表单定义 CRUD

系统 SHALL 提供表单定义的创建、查询、更新、删除接口。

表单定义 SHALL 包含以下属性：id（UUID）、tenant_id（租户）、name（表单名称）、key（表单标识，同租户唯一）、schema（VTJ DSL JSON）、version（版本号）、status（DRAFT/PUBLISHED/ARCHIVED）、published_version（当前发布版本号）、created_by、created_at、updated_at。

创建表单定义时，系统 SHALL 生成 UUID 作为 id，设置 version=1，status=DRAFT。

更新表单定义时，系统 SHALL 创建新版本（version 自增），保留旧版本记录。

删除表单定义时，系统 SHALL 执行软删除（标记 ARCHIVED），不物理删除。

#### Scenario: 创建表单定义
- **WHEN** 用户调用 POST /api/v1/form-definitions，提供 name 和 key
- **THEN** 系统创建表单定义记录
- **AND** id 为生成的 UUID
- **AND** version = 1，status = DRAFT
- **AND** 返回创建的表单定义

#### Scenario: 查询表单定义列表
- **WHEN** 用户调用 GET /api/v1/form-definitions，提供分页参数
- **THEN** 系统返回当前租户的表单定义列表（分页）
- **AND** 每条记录包含 id、name、key、version、status、created_at

#### Scenario: 获取表单定义详情
- **WHEN** 用户调用 GET /api/v1/form-definitions/{id}
- **THEN** 系统返回表单定义详情，包含完整 VTJ DSL JSON

#### Scenario: 更新表单定义
- **WHEN** 用户调用 PUT /api/v1/form-definitions/{id}，提供新的 VTJ DSL JSON
- **THEN** 系统创建新版本记录（version 自增）
- **AND** 旧版本保留
- **AND** 返回新版本的表单定义

#### Scenario: 删除表单定义
- **WHEN** 用户调用 DELETE /api/v1/form-definitions/{id}
- **THEN** 系统将表单定义状态标记为 ARCHIVED
- **AND** 不物理删除记录
