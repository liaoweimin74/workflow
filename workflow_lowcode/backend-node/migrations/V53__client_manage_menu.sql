-- ============================================================
-- V53: 客户端管理菜单 + 按钮权限行 + ROLE_ADMIN 授权（multi-client-support Task 6）
--
-- 对应能力：A1 客户端管理页（/system/client，前端静态路由已注册）——
-- 多端交付的端资产管理入口（sys_client CRUD + 渠道徽标）。
--
-- id 空间：v6 主库 MAX(id)=438、node_test=305 → 本迁移取 450-453 留余量。
-- ⚠️ status/is_deleted 必须显式写（对齐 V7/V44）：status 为 NOT NULL 无默认值，
--    漏写落 0（=禁用）会导致菜单不可见。
-- ⚠️ client_id 列（V51）省略 = DEFAULT 1 = portal 平台端（本菜单只挂管理端）。
-- ============================================================

-- 菜单页：系统管理（id=1）下第 8 项
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(450, 1, '客户端管理', 1, '/system/client', 'system/client/index', 'system:client:list', 'Cellphone', 8, 1, 0, NOW(), NOW());

-- 按钮行（跟随菜单页，不占屏；照岗位管理 301-304 的挂法）
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(451, 450, '客户端新增', 2, NULL, NULL, 'system:client:create', NULL, 1, 1, 0, NOW(), NOW()),
(452, 450, '客户端修改', 2, NULL, NULL, 'system:client:update', NULL, 2, 1, 0, NOW(), NOW()),
(453, 450, '客户端删除', 2, NULL, NULL, 'system:client:delete', NULL, 3, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限（管理员走免过滤分支，此处保持与其他菜单一致的授权记录）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (450, 451, 452, 453)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- 核对：4 行齐备（结果不影响迁移成败）
SELECT COUNT(*) AS client_menu_rows FROM sys_menu WHERE id BETWEEN 450 AND 453;
