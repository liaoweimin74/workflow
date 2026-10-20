-- ============================================================
-- V63: 系统管理 → 数据权限 菜单
--
-- 数据范围 v2 的权限管理页（权限对象 + 覆盖度盘点）。菜单挂在「系统管理」(id=1)
-- 末尾（sort 8），组件路径与前端静态路由 /system/row-permission 对应。
-- 页面接口全是管理员端点（能改写权限对象等于能给自己放行），菜单只授给 ROLE_ADMIN；
-- 即使有人被分配到此菜单，接口层仍会 403。
--
-- 【幂等】NOT EXISTS 防御，可重复执行。
-- ============================================================

INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 322, NOW(3), NOW(3), 0, 'system/row-permission/RowPermissionPage', 'Lock', '数据权限', 1, 1, '/system/row-permission', 'system:rowpermission:list', 8, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 322);

INSERT INTO sys_role_menu (`role_id`, `menu_id`)
SELECT 1, 322 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu WHERE role_id = 1 AND menu_id = 322);
