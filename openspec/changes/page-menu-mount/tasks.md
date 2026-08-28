## 1. 后端：挂接接口与权限校验基础

- [ ] 1.1 `SysMenuRepository` 新增 `findByPath(String path)`（限定 is_deleted=0；若适用追加 tenant 过滤），返回 Optional
- [ ] 1.2 新增 `PageMenuController`（或并入 PageDefinitionController）：`POST /api/v1/pages/{id}/mount-menu` — 校验 PUBLISHED、幂等按 path 查重、创建 sys_menu（path=/page/{key}、component=page/PageRenderer、permission=page:read:{key}、name 缺省用页面 name、parentId 可空）、返回 MenuResponse（menuId/path/permission/menuName）
- [ ] 1.3 新增 `GET /api/v1/pages/{key}/menu` — 按 key 取已发布页面（404 兜底）、按 path 反查菜单、返回 {mounted, menuId, menuName, path, permission}
- [ ] 1.4 新增 `MenuResponse`/`MountMenuRequest` DTO（name、parentId）

## 2. 后端：页面访问权限校验

- [ ] 2.1 `PageDefinitionController.getByKey`（非 preview 分支）注入校验：按 path=/page/{key} 反查菜单 → 无菜单 404 / 菜单 status!=1 或 is_deleted=1 → 400 / 用户无 page:read:{key} → 403；preview=true 跳过
- [ ] 2.2 `PageQueryController.query` 注入同规则校验（无菜单 404 / 无权限 403）
- [ ] 2.3 抽取共享校验逻辑（如 `PageAccessGuard` 组件或 service 方法），两 Controller 复用，避免重复代码
- [ ] 2.4 从 `Authentication` 取 `LoginUser`（com.workflow.framework.security.domain）的 permissions 集合，未登录/异常情况按无权限处理

## 3. 后端：测试

- [ ] 3.1 挂接接口测试：首次挂接成功（校验 sys_menu 字段）、重复挂接幂等（返回同 menuId 不新增）、DRAFT 拒绝 400、parentId/name 生效
- [ ] 3.2 挂接状态查询测试：已挂/未挂/不存在页面 404
- [ ] 3.3 权限校验测试：getByKey 无菜单 404、无权限 403、有权限 200、preview=true 豁免；query 无菜单 404、无权限 403
- [ ] 3.4 回归：既有页面渲染/查询测试（已挂接页面带权限仍可访问）

## 4. 前端：设计器挂接入口

- [ ] 4.1 页面设计器（PageDesignerRouter.vue / PageRenderer 所属设计视图）工具栏新增"挂接菜单"按钮，仅 PUBLISHED 显示；进入页面时调用 `GET /{key}/menu` 判断已挂状态（已挂 → 按钮变为"已挂接"+ 查看菜单跳转）
- [ ] 4.2 挂接弹窗：菜单名称（缺省页面名）+ 所属目录树（来自 authStore.menus 过滤 menuType===1，node-key=id，可清空=挂根）+ 确认/取消
- [ ] 4.3 前端 api 封装：`pageApi.mountMenu(id, {name, parentId})`、`pageApi.getMenuByKey(key)`
- [ ] 4.4 挂接成功提示 + 刷新挂接状态；失败（未发布等）展示后端错误消息

## 5. 验证与收尾

- [ ] 5.1 后端集成测试全绿（mvn test 相关模块）
- [ ] 5.2 前端构建通过（npm run build / vue-tsc）
- [ ] 5.3 手动冒烟：设计器发布 → 挂接 → 侧边栏出现菜单 → 有权限用户访问 / 无权限用户 403
