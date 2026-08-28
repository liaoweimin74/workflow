# page-menu Specification

## Purpose
TBD - created by archiving change page-menu-mount. Update Purpose after archive.
## Requirements
### Requirement: 已发布页面可挂接为系统菜单

系统 SHALL 将已发布（PUBLISHED）的 VIEW/PAGE 页面挂接为 sys_menu 菜单行；同一页面 SHALL 可多次挂接到不同父目录（多挂接，不合并、不查重）；DRAFT/ARCHIVED 页面 SHALL 拒绝挂接（400）。挂接 SHALL 自动派生 path=/page/{key}、component=page/PageRenderer、permission=page:read:{key}。

#### Scenario: 挂接已发布视图
- **WHEN** POST /api/v1/pages/{id}/mount-menu（页面 status=PUBLISHED）
- **THEN** 创建 sys_menu（type=1 menu、path=/page/{key}）
- **AND** 重复调用创建独立新菜单（多挂接）

#### Scenario: 拒绝未发布页面
- **WHEN** 页面 status=DRAFT 时调用 mount-menu
- **THEN** 返回 400，不落库

#### Scenario: 解除挂接
- **WHEN** DELETE /api/v1/pages/menus/{menuId}
- **THEN** 菜单行 is_deleted=1（软删）
- **AND** 列表查询不再返回该菜单，页面及其它挂接不受影响

#### Scenario: 多挂接列表查询
- **WHEN** GET /api/v1/pages/{key}/menus
- **THEN** 返回该 key 的全部挂接菜单数组（含 parentId/name/permission/status）

### Requirement: 挂接菜单自动授权管理员

管理员挂接时，新菜单 SHALL 自动授权给 ROLE_ADMIN 角色（sys_role_menu），保证挂接者立即可访问；重复挂接 SHALL 不重复授权。

#### Scenario: 管理员挂接自动授权
- **WHEN** ROLE_ADMIN 用户挂接菜单
- **THEN** 插入 sys_role_menu(ROLE_ADMIN, newMenuId)
- **AND** 已授权时不再重复插入

#### Scenario: 非管理员挂接不自动授权
- **WHEN** 非管理员用户挂接菜单
- **THEN** 不插入 sys_role_menu（由角色管理分配）

### Requirement: 页面访问需持有挂接菜单权限

系统 SHALL 通过 PageAccessGuard 校验页面访问：访问者权限集合 SHALL 命中任意挂接菜单的 permission（OR 语义）；无任何挂接菜单（或全部软删）SHALL 返回 404；存在挂接但权限未命中 SHALL 返回 403；管理员（ROLE_ADMIN/admin）SHALL 绕过校验。校验 SHALL 应用于页面定义读取（非 preview）与数据查询接口。

#### Scenario: 有挂接菜单且持有权限可访问
- **WHEN** 至少一条 status=1 的挂接菜单，且用户权限命中其 permission
- **THEN** getByKey（非 preview）与 query 接口放行

#### Scenario: 无挂接菜单
- **WHEN** 页面无任何挂接菜单（或全部软删）
- **THEN** 返回 404（不暴露页面存在）

#### Scenario: 无权限访问
- **WHEN** 存在挂接菜单但用户权限未命中任何一条
- **THEN** 返回 403

#### Scenario: 预览豁免
- **WHEN** getByKey 携带 preview=true
- **THEN** 跳过权限校验，设计器可预览未发布页面

### Requirement: 路由与渲染器

路由 /page/:pageKey SHALL 指向 PageRenderer；VIEW 使用 SearchTable 渲染（查询区/表格/操作/详情），PAGE 委托 PageRendererPage；同一组件不同 pageKey 切换时 SHALL 重新加载。页签标题 SHALL 取挂接菜单名称（叶子菜单优先），无菜单时回退路由 meta.title。表格尺寸 SHALL 统一为正常（default）。

#### Scenario: 切换不同页面
- **WHEN** 导航从 /page/A 到 /page/B
- **THEN** PageRenderer/PageRendererPage 按 pageKey 变化重新加载对应页面

#### Scenario: 页签标题取菜单名称
- **WHEN** 菜单（path=/page/{key}）打开页面
- **THEN** 页签标题等于菜单名称
- **AND** 父子同 path（如 /form）时匹配叶子菜单而非父目录

#### Scenario: 表格尺寸一致
- **WHEN** 预览与正式访问同一页面
- **THEN** 表格尺寸一致（default，无紧凑/正常区分）

### Requirement: 权限体系修复

JWT 认证过滤器 SHALL 按 userId 加载真实角色与权限集合（LoginUserService），使后端鉴权生效；PermissionEvaluator 管理员判定 SHALL 兼容 admin 与 ROLE_ADMIN。

#### Scenario: 每次请求带完整权限
- **WHEN** 请求携带有效 access token
- **THEN** SecurityContext 中 LoginUser 的 roles/permissions 非空（按用户角色-菜单聚合）
- **AND** 后端权限校验（@pe / PageAccessGuard）据此生效

