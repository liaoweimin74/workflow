# page-menu-mount Specification

## Purpose
TBD - created by archiving change page-menu-mount. Update Purpose after archive.
## Requirements
### Requirement: 页面挂接菜单（设计器一键挂接，支持多挂接）

系统 SHALL 提供页面挂接菜单能力：设计器对已发布（status=PUBLISHED）的页面 SHALL 提供"挂接菜单"操作，调用 `POST /api/v1/pages/{id}/mount-menu` 创建一条 `sys_menu` 记录，菜单 path SHALL 为 `/page/{pageKey}`、component SHALL 为 `page/PageRenderer`、permission SHALL 为 `page:read:{pageKey}`。
挂接 SHALL 支持多挂接：同一页面 SHALL 可挂接多个菜单（不同 name/parentId），每次调用 SHALL 创建一条新菜单，不要求同 path 唯一。
请求 SHALL 接受可选参数 name（菜单名称，缺省使用页面 name）与 parentId（父菜单 ID，缺省挂根）。
未发布（DRAFT/ARCHIVED）页面 SHALL 拒绝挂接并返回 400。

#### Scenario: 首次挂接已发布页面
- **WHEN** 调用 POST /api/v1/pages/{id}/mount-menu，页面为 PUBLISHED，请求 name="员工列表"、parentId=null
- **THEN** 系统创建 sys_menu 记录（path=/page/employee-list、component=page/PageRenderer、permission=page:read:employee-list、menu_name=员工列表、parent_id=null、status=1）
- **AND** 响应返回 menuId、path、permission

#### Scenario: 同一页面挂接多个菜单
- **WHEN** 对同一 PUBLISHED 页面先后调用两次挂接，第一次 parentId=1（人事目录）、name="请假查询"，第二次 parentId=2（考勤目录）、name="假期管理"
- **THEN** 系统创建两条独立的 sys_menu 记录（path 均为 /page/leave-query）
- **AND** 两条记录的 parent_id、menu_name 各自不同
- **AND** 两条记录的 permission 均为 page:read:leave-query

#### Scenario: 未发布页面拒绝挂接
- **WHEN** 调用 POST /api/v1/pages/{id}/mount-menu
- **AND** 页面 status=DRAFT 或 ARCHIVED
- **THEN** 系统返回 400 错误
- **AND** 不创建菜单

---

### Requirement: 挂接菜单列表查询

系统 SHALL 提供挂接菜单列表查询接口 `GET /api/v1/pages/{key}/menus`，返回页面（按 key）的全部关联菜单列表。
页面不存在或未发布 SHALL 返回 404。
未挂接 SHALL 返回空数组；已挂接 SHALL 返回菜单数组，每项包含 menuId、menuName、path、parentId、permission、status。

#### Scenario: 查询已挂接页面（多菜单）
- **WHEN** 调用 GET /api/v1/pages/employee-list/menus
- **AND** employee-list 已发布且已挂接 2 个菜单（path 均为 /page/employee-list）
- **THEN** 系统返回长度为 2 的数组
- **AND** 每项包含 menuId、menuName、path、parentId、permission

#### Scenario: 查询未挂接页面
- **WHEN** 调用 GET /api/v1/pages/employee-list/menus
- **AND** employee-list 已发布但无关联菜单
- **THEN** 系统返回空数组

#### Scenario: 查询不存在页面
- **WHEN** 调用 GET /api/v1/pages/unknown-page/menus
- **AND** unknown-page 不存在或未发布
- **THEN** 系统返回 404 错误

---

### Requirement: 解除挂接菜单

系统 SHALL 提供解除挂接接口 `DELETE /api/v1/pages/menus/{menuId}`，将指定菜单软删除（is_deleted=1），解除该页面与菜单的关联。
解除挂接 SHALL 不影响页面本身及其它关联菜单。
对已软删或不存在的 menuId SHALL 返回 404。

#### Scenario: 解除一个菜单不影响其它
- **WHEN** 调用 DELETE /api/v1/pages/menus/{menuId}
- **AND** 该菜单为某 PUBLISHED 页面的关联菜单之一（同页面另有其它关联菜单）
- **THEN** 该菜单 is_deleted 置为 1
- **AND** 页面定义与其它关联菜单保持不变

#### Scenario: 解除不存在的菜单
- **WHEN** 调用 DELETE /api/v1/pages/menus/{ghostId}
- **AND** ghostId 对应菜单不存在或已软删
- **THEN** 系统返回 404 错误

---

### Requirement: 页面访问权限码生成规则

挂接菜单时，系统 SHALL 按规则 `page:read:{pageKey}` 生成 permission 权限码，其中 pageKey 为页面定义的 key（原样保留，不做大小写转换）。
权限码 SHALL 采用 `page:*` 命名空间，`page:read:` 前缀为读取权限，action 位（read）SHALL 可扩展（后续 write/export 等）。
同一页面重新发布（key 不变）时，已挂接菜单及其 permission SHALL 保持不变。

#### Scenario: 权限码含页面 key
- **WHEN** 挂接 key=leave-query 的已发布页面
- **THEN** 生成权限码 page:read:leave-query
- **AND** 权限码写入 sys_menu.permission

#### Scenario: 重新发布不影响菜单权限
- **WHEN** 页面 leave-query 已挂接后再次发布（key 不变、schema 更新）
- **THEN** 全部关联菜单的 path=/page/leave-query 与 permission=page:read:leave-query 保持不变
- **AND** 不产生新菜单记录

