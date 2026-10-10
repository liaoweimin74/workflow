-- ============================================================
-- V15: 流程分类 CRUD 按钮权限点
-- 补齐 process:category:create/update/delete（前端 SearchTable 权限控制依赖）
-- ============================================================

INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(113, 104, '分类创建', 2, 'process:category:create', 1, 1, 0, NOW(), NOW()),
(114, 104, '分类编辑', 2, 'process:category:update', 2, 1, 0, NOW(), NOW()),
(115, 104, '分类删除', 2, 'process:category:delete', 3, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (113, 114, 115)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);
