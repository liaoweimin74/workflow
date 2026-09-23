-- ============================================================
-- 流程管理菜单：流程定义、流程中心、待办处理
-- ============================================================

-- 父菜单：流程管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, created_at, updated_at) VALUES
(100, NULL, '流程管理', 0, '/process', NULL, NULL, 'Operation', 2, NOW(), NOW());

-- 子菜单
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, created_at, updated_at) VALUES
(101, 100, '流程定义', 1, '/process/definition', 'process/ProcessListPage', 'process:definition:list', 'Document', 1, NOW(), NOW()),
(102, 100, '流程中心', 1, '/process/center', 'process/ProcessCenterPage', 'process:center:list', 'Files', 2, NOW(), NOW()),
(103, 100, '待办处理', 1, '/process/todo', 'process/ProcessTodoPage', 'process:todo:list', 'BellFilled', 3, NOW(), NOW());

-- 流程定义按钮权限
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, created_at, updated_at) VALUES
(110, 101, '流程创建', 2, 'process:definition:create', 1, NOW(), NOW()),
(111, 101, '流程部署', 2, 'process:definition:deploy', 2, NOW(), NOW()),
(112, 101, '流程删除', 2, 'process:definition:delete', 3, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (100, 101, 102, 103, 110, 111, 112)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);
