## Context

系统已完成表单设计器、页面设计器（视图轨 VIEW）的开发，视图端到端可用：页面管理（DRAFT/PUBLISHED 状态机）→ 视图设计器 → 发布 → 通用渲染页 `/page/:pageKey`（PageRenderer 基于 SearchTable 渲染）。

当前问题：
1. 已发布的页面/视图只能通过 `/page/:pageKey` 运行，**没有与系统菜单挂接**，用户侧无发现入口
2. `PageDefinitionController.getByKey`、`PageQueryController.query` **均无后端权限校验**——任何登录用户凭 URL 即可访问任意已发布页面（含其 schema 与业务数据），违反租户数据隔离预期
3. 设计器发布后缺乏"快速挂接菜单"的入口

系统已有完整菜单权限体系：`sys_menu` 表（parentId/menuName/menuType/path/component/permission/icon/sortOrder/status/is_deleted）→ `/auth/menus` API（AuthServiceImpl 按角色聚合，ROLE_ADMIN 全量，其余经 sys_role_menu 关联）→ `authStore.menus` → `AdminLayout` 侧边栏渲染 + `hasPermission` 控制。路由 `/page/:pageKey` 已静态注册在 AdminLayout children 下。

约束：
- 沿用现有 Spring Security + LoginUser.permissions 机制，不引入新权限框架
- 视图轨（VIEW）与页面轨（PAGE）共存，本变更以 VIEW 为第一目标，PAGE 天然兼容（同走 `/page/:key`）
- 遵循"发布不建表"理念，本变更亦不新增数据库表（仅复用 sys_menu）

## Goals / Non-Goals

**Goals:**
- 设计器发布后提供"挂接菜单"操作，自动创建指向 `/page/{key}` 的 `sys_menu` 记录
- 后端对页面定义读取（`GET /{key}/definition`）与数据查询（`GET /{pageKey}/data`）增加权限校验：无关联菜单 → 404，有菜单但用户无 `page:read:{key}` 权限 → 403
- 重复挂接幂等：同 path 已存在菜单则返回已有信息，不重复创建
- 预览流程（preview=true）不受影响，设计器可继续预览未发布页面
- 菜单管理页手动创建链接的方式继续可用（两条路径并存）

**Non-Goals:**
- 不做页面实体级权限字段（方案 B 的 `PageDefinition.permission`，后续按需引入）
- 不做外部分享/免登录访问（场景 C，后续按需引入）
- 不做菜单管理页的"页面来源"增强展示
- 不自动清理页面删除后的关联菜单
- 不做数据行级权限（filter 白名单已有，超出本变更范围）

## Decisions

### D1：挂接载体 = sys_menu（不新增表）
通过 `sys_menu` 记录（path=/page/{key}、component=page/PageRenderer、permission=page:read:{key}）承载挂接关系。页面实体不动，与"发布不建表"理念一致。权限体系、菜单树、面包屑全部复用存量机制。

### D2：权限码格式 `page:read:{pageKey}`
采用 action 后缀预留扩展位（page:{key}:{action}），未来读/写/导出细粒度时无需改表，仅调整挂接/校验逻辑。菜单 `permission` 字符串与 `LoginUser.permissions`（由角色→菜单聚合而来）直接匹配。

### D3：后端校验点 = 定义读取 + 数据查询两个接口
- `GET /api/v1/pages/{key}/definition`（非 preview）：按 path 反查菜单 → 无菜单 404 / 菜单禁用 400 / 无权限 403
- `GET /api/v1/pages/{pageKey}/data`：同规则校验（页面渲染的数据接口必须与页面本身同权限）

### D4：多挂接（非幂等单挂）
`POST /api/v1/pages/{id}/mount-menu`：**每次调用创建一条新菜单**（可传 name/parentId），同一页面可挂到多个目录/以多个名称出现。`sys_menu.path` 无唯一约束，多菜单同 path 技术上无障碍。挂接弹窗展示"该页面已挂 N 个菜单"提示，防误操作。

### D5：菜单管理（列表 + 解除）
`GET /api/v1/pages/{key}/menus` 返回该页面全部关联菜单（数组：menuId/menuName/path/parentId/status），设计器展示"已挂 N 个菜单"列表；每条菜单提供"解除挂接"（软删：is_deleted=1），解除不影响页面本身。

### D6：挂接时机 = PUBLISHED
仅已发布页面可挂接（DRAFT 不可），避免把未定型页面暴露给终端用户。重新发布（key 不变）菜单无需变动。

### D7：访问校验 OR 语义
`PageAccessGuard.assertPageAccess(pageKey)`：按 path 查询**全部**关联菜单（is_deleted=0）；一个都没有 → 404；有菜单但任一菜单对当前用户有权限（经 `PermissionEvaluator.hasPermission`）→ 放行；全部菜单均无权限 → 403。menuType 不参与过滤（按钮/目录均可作为授权依据，但页面菜单均为 menuType=1 目录，天然一致）。

### D8：预览豁免校验
`preview=true` 跳过权限校验（设计器内部使用，路径带 preview 参数），保持设计-预览-发布流程不被打断。数据查询接口（无 preview 参数）始终校验。

## Risks / Trade-offs

- [页面 key 变更导致旧菜单失效] → 设计器层面限制 key 创建后不可修改（软约束）；后续可加"同步菜单"能力
- [删除页面后残留菜单指向 404] → 本变更不自动删菜单，由管理员在菜单管理页清理；删除流程中可后续加提示（Open Question）
- [权限码冲突（与其他业务权限同值）] → `page:read:` 前缀命名空间隔离，冲突概率极低；挂接时按 path 反查不依赖 permission 唯一
- [findByPath 多租户/软删歧义] → repository 方法限定 `path + isDeleted=0`（+ tenant 上下文若适用），列表查询与 OR 校验共用同一查询，保证一致
- [多挂接导致菜单冗余/误操作] → 挂接弹窗展示"已挂 N 个菜单"提示 + 列表管理 + 解除挂接能力；用户确认后才创建新菜单
- [preview 豁免被滥用] → preview 仅作用于 definition 读取接口且需已登录；数据接口始终校验，风险可控

## Migration Plan

1. 新增 `SysMenuRepository.findByPathAndIsDeleted`（返回 List，含 isDeleted 过滤）
2. 新增 `PageMenuController`（或并入 PageDefinitionController）：`POST /{id}/mount-menu`（每次创建新菜单）、`GET /{key}/menus`（列表）、`DELETE /menus/{menuId}`（解除=软删）
3. 修改 `PageDefinitionController.getByKey`、`PageQueryController.query` 增加权限校验（注入 SysMenuRepository + PermissionEvaluator，OR 语义）
4. 前端：设计器（PageDesignerRouter.vue / PageRenderer 的父级设计视图）工具栏新增"挂接菜单"按钮 + 弹窗（菜单名称/所属目录，目录树来自 authStore.menus）；已挂列表展示（N 个菜单）+ 每条"解除挂接"；挂接弹窗防误操作提示
5. 后端集成测试：挂接创建/多挂接/列表/解除/404/403/OR 放行/preview 豁免；前端冒烟
6. 回滚：后端校验逻辑可独立回退（去掉校验分支即恢复现状）；菜单记录与页面无强约束，删除即解除

## Open Questions

- 删除已发布页面时，是否提示"存在关联菜单"？（建议后续迭代加，本变更不做）
- `key` 是否硬性不可变？（本变更先软约束，是否加后端强校验待定）
- 菜单管理页是否要展示"来源页面"（pageKey）？（可选增强）
