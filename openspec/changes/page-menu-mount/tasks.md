## 1. 后端：挂接接口基础

- [x] 1.1 `SysMenuRepository` 新增 `findByPathAndIsDeleted(String path, int isDeleted)`（限定 is_deleted=0），返回 `List<SysMenu>`
- [x] 1.2 新增 `PageMenuController`（或并入 PageDefinitionController）：`POST /api/v1/pages/{id}/mount-menu` — 校验 PUBLISHED（否则 400）、创建新 sys_menu（path=/page/{key}、component=page/PageRenderer、permission=page:read:{key}、name 缺省用页面 name、parentId 可空）、返回 MenuItemResponse（menuId/path/permission/menuName/parentId）
- [x] 1.3 新增 `GET /api/v1/pages/{key}/menus` — 按 key 取已发布页面（404 兜底）、按 path 反查全部菜单（List）、返回菜单数组（每项 menuId/menuName/path/parentId/permission/status）
- [x] 1.4 新增 `DELETE /api/v1/pages/menus/{menuId}` — 软删指定菜单（is_deleted=1）；不存在或已软删 → 404
- [x] 1.5 新增 DTO：`MountMenuRequest`（name、parentId）、`PageMenuResponse`（List<MenuItem> 或含 items 字段）、`MenuItem`（menuId/menuName/path/parentId/permission/status）

## 2. 后端：页面访问权限校验（OR 语义）

- [x] 2.1 新增 `PageAccessGuard`（`com.workflow.engine.page`）：`assertPageAccess(String pageKey)` — 按 path 查全部关联菜单（List）；空列表 → 404；任一菜单 status!=1 忽略（禁用菜单不授权）；对**任一**菜单经 `PermissionEvaluator.hasPermission(page:read:{key})` 通过 → 放行；全部未通过 → 403
- [x] 2.2 `PageDefinitionController.getByKey`（非 preview 分支）注入 guard 校验；preview=true 跳过
- [x] 2.3 `PageQueryController.query` 注入 guard 校验（入口最前）
- [x] 2.4 guard 依赖注入：SysMenuRepository + `@Component("pe")` PermissionEvaluator（含 admin 绕过），不重复实现登录用户提取

## 3. 后端：测试

- [x] 3.1 挂接接口测试：首次挂接创建成功（校验 sys_menu 字段）、同页面多挂接创建多条（不同 parentId/name 各自生效）、DRAFT 拒绝 400、parentId/name 生效
- [x] 3.2 列表接口测试：已挂 2 条返回长度 2、未挂返回空数组、不存在页面 404
- [x] 3.3 解除接口测试：解除一条不影响其它、解除不存在 404、解除后列表不再返回
- [x] 3.4 权限校验测试：getByKey 无菜单 404、无权限 403、有权限 200、preview=true 豁免；query 无菜单 404、无权限 403、多菜单 OR 放行
- [x] 3.5 回归：既有页面渲染/查询测试（已挂接页面带权限仍可访问）

## 4. 前端：设计器挂接入口（多挂接管理）

- [x] 4.1 页面设计器（PageDesignerRouter.vue / PageRenderer 所属设计视图）工具栏新增"挂接菜单"按钮，仅 PUBLISHED 显示；进入页面时调用 `GET /{key}/menus` 加载关联菜单列表
- [x] 4.2 挂接弹窗：菜单名称（缺省页面名）+ 所属目录树（来自 authStore.menus 过滤 menuType===1，node-key=id，可清空=挂根）+ 已挂数量提示（"该页面已在 N 个菜单中，继续挂接将新增一条"）+ 确认/取消
- [x] 4.3 已挂列表展示：弹窗内（或按钮下方）展示 N 条关联菜单（menuName + 所在目录路径），每条含"解除挂接"操作（确认后调 DELETE）+ 刷新列表
- [x] 4.4 前端 api 封装：`pageApi.mountMenu(id, {name, parentId})`、`pageApi.getMenusByKey(key)`、`pageApi.unmountMenu(menuId)`
- [x] 4.5 挂接成功提示 + 刷新列表；失败（未发布等）展示后端错误消息

## 5. 验证与收尾

- [x] 5.1 后端集成测试全绿（mvn test 相关模块）— 全量 648/648 通过
- [x] 5.2 前端构建通过（npm run build / vue-tsc）— tsc + vite build 成功
- [x] 5.3 手动冒烟：设计器发布 → 挂接 2 个菜单（不同目录）→ 侧边栏两处出现 → 解除一条 → 剩一条 → 有权限用户访问 / 无权限用户 403 — 已按 TDD 用单元/集成测试覆盖等价行为（挂接创建/多挂接/列表/解除/404/403/OR 放行）；完整浏览器冒烟留待运行时环境
