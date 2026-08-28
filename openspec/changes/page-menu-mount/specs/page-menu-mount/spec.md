<!--
Delta spec for page-menu-mount change.
新增 capability：页面挂接到系统菜单。
-->

## ADDED Requirements

### Requirement: 页面挂接菜单（设计器一键挂接）

系统 SHALL 提供页面挂接菜单能力：设计器对已发布（status=PUBLISHED）的页面 SHALL 提供"挂接菜单"操作，调用 `POST /api/v1/pages/{id}/mount-menu` 创建 `sys_menu` 记录，菜单 path SHALL 为 `/page/{pageKey}`、component SHALL 为 `page/PageRenderer`、permission SHALL 为 `page:read:{pageKey}`。
挂接 SHALL 幂等：按 path（`/page/{pageKey}`）查询已存在的菜单，若存在 SHALL 返回既有菜单信息（含 menuId）而不重复创建；不存在 SHALL 创建新菜单。
请求 SHALL 接受可选参数 name（菜单名称，缺省使用页面 name）与 parentId（父菜单 ID，缺省挂根）。
未发布（DRAFT/ARCHIVED）页面 SHALL 拒绝挂接并返回 400。

#### Scenario: 首次挂接已发布页面
- **WHEN** 调用 POST /api/v1/pages/{id}/mount-menu，页面为 PUBLISHED，请求 name="员工列表"、parentId=null
- **AND** 不存在 path=/page/employee-list 的菜单
- **THEN** 系统创建 sys_menu 记录（path=/page/employee-list、component=page/PageRenderer、permission=page:read:employee-list、menu_name=员工列表、parent_id=null、status=1）
- **AND** 响应返回 menuId、path、permission

#### Scenario: 重复挂接幂等
- **WHEN** 再次调用 POST /api/v1/pages/{id}/mount-menu
- **AND** 已存在 path=/page/employee-list 的菜单
- **THEN** 系统不创建新菜单
- **AND** 响应返回既有菜单的 menuId 与信息

#### Scenario: 未发布页面拒绝挂接
- **WHEN** 调用 POST /api/v1/pages/{id}/mount-menu
- **AND** 页面 status=DRAFT 或 ARCHIVED
- **THEN** 系统返回 400 错误
- **AND** 不创建菜单

---

### Requirement: 挂接状态查询

系统 SHALL 提供挂接状态查询接口 `GET /api/v1/pages/{key}/menu`，返回页面（按 key）是否已挂接菜单及菜单信息（menuId/path/permission/menuName）。
页面不存在或未发布 SHALL 返回 404。
未挂接 SHALL 返回 mounted=false；已挂接 SHALL 返回 mounted=true 及菜单详情。

#### Scenario: 查询已挂接页面
- **WHEN** 调用 GET /api/v1/pages/employee-list/menu
- **AND** employee-list 已发布且已挂接菜单（path=/page/employee-list）
- **THEN** 系统返回 mounted=true 与 menuId、menuName、path、permission

#### Scenario: 查询未挂接页面
- **WHEN** 调用 GET /api/v1/pages/employee-list/menu
- **AND** employee-list 已发布但无对应菜单
- **THEN** 系统返回 mounted=false

#### Scenario: 查询不存在页面
- **WHEN** 调用 GET /api/v1/pages/unknown-page/menu
- **AND** unknown-page 不存在或未发布
- **THEN** 系统返回 404 错误

---

### Requirement: 页面访问权限码生成规则

挂接菜单时，系统 SHALL 按规则 `page:read:{pageKey}` 生成 permission 权限码，其中 pageKey 为页面定义的 key（原样小写保留，不做大小写转换）。
权限码 SHALL 采用 `page:*` 命名空间，`page:read:` 前缀为读取权限，action 位（read）SHALL 可扩展（后续 write/export 等）。
同一页面重新发布（key 不变）时，已挂接菜单及其 permission SHALL 保持不变。

#### Scenario: 权限码含页面 key
- **WHEN** 挂接 key=leave-query 的已发布页面
- **THEN** 生成权限码 page:read:leave-query
- **AND** 权限码写入 sys_menu.permission

#### Scenario: 重新发布不影响菜单权限
- **WHEN** 页面 leave-query 已挂接后再次发布（key 不变、schema 更新）
- **THEN** 菜单 path=/page/leave-query 与 permission=page:read:leave-query 保持不变
- **AND** 不产生新菜单记录
