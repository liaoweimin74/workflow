-- ============================================================
-- 菜单合并：表单管理(120) + 查询界面管理(140) → 表单视图管理(160)
-- 原三个子菜单（表单列表 121 / 页面列表 141 / 数据源管理 142）统一挂到新父菜单下
-- ============================================================

-- 1. 新建父菜单：表单视图管理（占位原 120/140 的顶级位置，sort=3）
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(160, NULL, '表单视图管理', 0, '/form', NULL, NULL, 'Grid', 3, 1, 0, NOW(), NOW());

-- 2. 子菜单改挂新父菜单
UPDATE sys_menu SET parent_id = 160, updated_at = NOW() WHERE id IN (121, 141, 142);

-- 3. 停用旧父菜单（软删除，保留历史记录）
UPDATE sys_menu SET status = 0, is_deleted = 1, updated_at = NOW() WHERE id IN (120, 140);

-- 4. 授权 ROLE_ADMIN 新父菜单（子菜单权限 121/141/142 及按钮权限此前已授权，层级不变）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, 160 FROM sys_role r
WHERE r.role_code = 'ROLE_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = 160);