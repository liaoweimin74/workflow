## Why

已发布视图/页面目前只能通过 `/page/:pageKey` 运行，与系统菜单脱节，普通用户无发现入口；且 `PageDefinitionController.getByKey` 与 `PageQueryController.query` 均无后端权限校验，任何登录用户凭 URL 即可访问任意已发布页面及其业务数据，与租户隔离预期不符。现借已有 `sys_menu` 权限体系（角色→菜单→permission→hasPermission）闭环"设计→发布→挂接→访问"，并为渲染/数据接口补上后端防线。

## What Changes

**页面挂接到系统菜单（设计器一键挂接，支持多挂接）**
- From: 页面发布后仅能手动去菜单管理页创建 `/page/:key` 链接，且无状态反馈
- To: 设计器发布后提供"挂接菜单"操作，每次挂接创建一条 `sys_menu` 记录（path=/page/{key}、component=page/PageRenderer、permission=page:read:{key}）；同一页面可挂多个菜单（不同目录/名称）；配套菜单列表（`GET /{key}/menus`）与解除挂接（软删）
- Reason: 形成完整闭环，降低操作成本；多入口/分部门菜单是真实业务常态
- Impact: 非破坏性；新增接口与按钮

**页面访问双重控制（菜单可见性 + 后端校验，OR 语义）**
- From: 页面渲染/数据接口零鉴权，URL 直填即达
- To: `GET /api/v1/pages/{key}/definition`（非 preview）与 `GET /api/v1/pages/{pageKey}/data` 按菜单 permission 校验：无任何关联菜单→404，拥有**任一**关联菜单的 `page:read:{key}` 权限→放行，全部菜单均无权限→403；preview=true 豁免（设计流程畅通）
- Reason: 补上后端防线，防止绕过菜单访问
- Impact: 非破坏性（既有已挂接页面若权限码变更需重新授权，见权限码调整）

**菜单权限码命名调整**
- From: 既有 spec 采用全局共享权限码（page:view、page:edit）
- To: 每页唯一权限码 `page:read:{pageKey}`（action 后缀预留扩展位）
- Reason: 支持按页面独立授权；与现有 `page:*` 命名空间兼容
- Impact: 破坏性（迁移前挂接的页面需按新格式重建权限码）；本变更同时提供挂接接口承担迁移

## Capabilities

### New Capabilities
- `page-menu-mount`: 页面挂接到系统菜单——设计器一键挂接（幂等）、挂接状态查询、权限码生成与后端双重访问控制（菜单可见性 + 接口校验 404/403）

### Modified Capabilities
- `query-page-renderer`: "页面菜单注册"需求细化——权限码从 `page:view/page:edit` 调整为每页唯一 `page:read:{pageKey}`；渲染与数据查询接口增加后端权限校验（无菜单 404 / 无权限 403）；补充预览豁免规则

## Impact

- 后端：`SysMenuRepository`（新增 findByPathAndIsDeleted 返回 List）、`PageDefinitionController`/`PageQueryController`（OR 语义权限校验）、新增挂接接口（POST /{id}/mount-menu、GET /{key}/menus 列表、DELETE /menus/{menuId} 解除）
- 前端：设计器工具栏新增"挂接菜单"按钮 + 弹窗（名称/所属目录，目录树来自 authStore.menus）+ 已挂列表（N 个菜单 + 每条解除挂接）+ 防误操作提示
- 数据：复用 `sys_menu`，不新增表
- 测试：后端集成测试（挂接创建/多挂接/列表/解除/404/403/OR 放行/preview 豁免）+ 前端冒烟
