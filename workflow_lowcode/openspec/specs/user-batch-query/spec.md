# user-batch-query Specification

## Purpose
TBD - created by archiving change approver-picker. Update Purpose after archive.
## Requirements
### Requirement: 用户查询支持 orgIds 数组筛选

系统 SHALL 在 `UserQueryRequest` 中支持 `orgIds: List<Long>` 可选字段，当该字段非空时，查询结果 MUST 包含 orgId 在 orgIds 列表中的所有用户（OR 语义）。

#### Scenario: 按 orgIds 筛选用户
- **WHEN** 请求 `GET /users?orgIds=1,2,3`
- **THEN** 返回 orgId 为 1 或 2 或 3 的所有用户（分页）

#### Scenario: orgIds 为空时不影响查询
- **WHEN** 请求 `GET /users`（不带 orgIds 或 orgIds 为空）
- **THEN** 查询不按组织筛选，返回所有用户（受其他条件约束）

---

### Requirement: 用户查询支持 roleIds 数组筛选

系统 SHALL 在 `UserQueryRequest` 中支持 `roleIds: List<Long>` 可选字段，当该字段非空时，查询结果 MUST 包含在 sys_user_role 表中关联了 roleIds 中任意角色的所有用户（OR 语义）。

#### Scenario: 按 roleIds 筛选用户
- **WHEN** 请求 `GET /users?roleIds=1,2`
- **THEN** 返回关联角色 1 或角色 2 的所有用户（分页）

#### Scenario: roleIds 为空时不影响查询
- **WHEN** 请求 `GET /users`（不带 roleIds 或 roleIds 为空）
- **THEN** 查询不按角色筛选

---

### Requirement: orgIds 与 roleIds 合并 OR 查询

系统 SHALL 在 `UserQueryRequest` 同时包含 orgIds 和 roleIds 时，以 OR 语义合并查询：返回「orgId 在 orgIds 中」OR「关联 roleIds 中任意角色」的所有用户，去重后分页。

#### Scenario: 同时按组织和角色合并查询
- **WHEN** 请求 `GET /users?orgIds=1&roleIds=2`
- **THEN** 返回 orgId=1 的用户 ∪ 关联 roleId=2 的用户，去重，分页

#### Scenario: orgIds 和 roleIds 与其他筛选条件叠加
- **WHEN** 请求 `GET /users?orgIds=1&roleIds=2&status=1`
- **THEN** 在「orgId=1 OR 关联 roleId=2」的结果上，再 AND 过滤 status=1

---

### Requirement: 批量查询用户接口

系统 SHALL 提供 `GET /users/batch?ids=1,2,3` 接口，根据传入的用户 ID 列表批量返回用户信息（UserVO），不存在的 ID 静默跳过。

#### Scenario: 批量查存在的用户
- **WHEN** 请求 `GET /users/batch?ids=1,2,3` 且三个 ID 均存在
- **THEN** 返回 200，body 为 `{rows: [UserVO, UserVO, UserVO]}`（顺序不限）

#### Scenario: 批量查含不存在 ID
- **WHEN** 请求 `GET /users/batch?ids=1,999` 且 ID 999 不存在
- **THEN** 返回 200，rows 仅包含 ID=1 的用户，999 静默跳过

#### Scenario: 批量查空列表
- **WHEN** 请求 `GET /users/batch?ids=`（空）
- **THEN** 返回 200，rows 为空数组

---

### Requirement: orgIds/roleIds 与现有筛选条件兼容

系统 SHALL 保证新增的 orgIds/roleIds 字段与现有 username/nickname/orgId/status 筛选条件以 AND 语义叠加，不破坏现有查询行为。

#### Scenario: 旧调用不受影响
- **WHEN** 请求 `GET /users?orgId=1&status=1`（不传 orgIds/roleIds）
- **THEN** 行为与变更前完全一致，返回 orgId=1 且 status=1 的用户

#### Scenario: orgIds 与单个 orgId 同时存在
- **WHEN** 请求 `GET /users?orgId=1&orgIds=2,3`
- **THEN** 两者 AND 叠加：orgId=1 AND (orgId IN [2,3])，实际无结果（因 orgId 不可能同时等于 1 和 2/3），返回空。此为调用方误用，系统不特殊处理。

