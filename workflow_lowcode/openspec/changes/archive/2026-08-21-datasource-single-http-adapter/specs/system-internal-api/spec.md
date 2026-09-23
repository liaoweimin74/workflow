# system-internal-api Specification

## ADDED Requirements

### Requirement: 系统结构内部 REST 接口
系统 SHALL 暴露部门与用户的内部 REST 接口，仅供 `internal://` 数据源路由器调用（不对外部公开）。接口 SHALL 携带租户上下文（TenantProvider）。
- 部门树：`GET /api/v1/internal/system/dept-tree` → 扁平行（id/parentId/label/code），`parentId` 为空字符串表示根节点
- 用户列表：`GET /api/v1/internal/system/users` → 分页（id/username/nickname/orgId/orgName/status）

#### Scenario: 查询部门树为扁平行
- **WHEN** type=SYSTEM、sourceKey="dept-tree" 的数据源被查询（keyword 为关键字）
- **THEN** 系统返回扁平部门行（含 parentId）
- **AND** 关键字匹配 label/code

#### Scenario: 查询用户列表
- **WHEN** type=SYSTEM、sourceKey="user-tree" 的数据源被查询（分页 + keyword）
- **THEN** 系统返回分页用户行
- **AND** keyword 映射到 username/姓名 模糊搜索

### Requirement: 系统结构 CRUD 接口
系统 SHALL 同时暴露部门与用户的增删改接口（委托 OrganizationService / UserService），以支持 SYSTEM 数据源的写操作。
- 部门：`POST /api/v1/internal/system/dept-tree`、`PUT /api/v1/internal/system/dept-tree/{id}`、`DELETE /api/v1/internal/system/dept-tree/{id}`
- 用户：`POST /api/v1/internal/system/users`、`PUT /api/v1/internal/system/users/{id}`、`DELETE /api/v1/internal/system/users/{id}`

#### Scenario: 新增部门
- **WHEN** type=SYSTEM 数据源执行 create，data 含 parentId/orgName/orgCode
- **THEN** 系统调用 OrganizationService.create 并返回新部门行
- **AND** 写失败时返回 400（如上级不存在）

#### Scenario: 删除用户
- **WHEN** type=SYSTEM 数据源执行 delete，data 含 id
- **THEN** 系统调用 UserService.delete
- **AND** 关联用户不存在返回 404

### Requirement: 系统结构列元数据
系统 SHALL 提供内部元数据接口，返回各 sourceKey 对应的列定义（ColumnConfig 列表）与 writable 标记。
- dept-tree → [id, parentId, label, code]，writable=true
- user-tree → [id, username, nickname, orgId, orgName, status]，writable=true

#### Scenario: 获取 SYSTEM 源的列定义
- **WHEN** 用户查询 type=SYSTEM 数据源的 metadata
- **THEN** 系统返回 sourceKey 对应列定义
- **AND** writable=true（支持 CRUD）
