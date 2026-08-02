-- ============================================================
-- V11: 流程分类菜单
-- ============================================================

-- 流程分类菜单（挂在流程管理下）
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, created_at, updated_at) VALUES
(104, 100, '流程分类', 1, 'process/category', 'category/CategoryPage', 'process:category:list', 'FolderOpened', 4, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id = 104
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);
