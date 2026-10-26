-- ============================================================
-- V74: 客户端管理菜单 + 按钮权限行 + ROLE_ADMIN 授权（J1，移植 backend-node V53）
--
-- A1 客户端管理页（/system/client，前端静态路由已在 P0 注册）——多端交付的端资产管理入口。
-- 目录归位按 design D4 / spec client-channel-model「菜单节点 MUST 挂开发管理」，
-- 沿用 V66 口径（path 与权限码命名空间不随目录走，/system/client 与 system:client:* 不动）。
--
-- 与 node V53 的差异：id 空间。workflow 库 sys_menu MAX(id)=9325 且业务行持续自增，
-- 不能照抄固定 450-453——改为自增 + permission 子查询回连（幂等且无 id 冲突面）。
-- ⚠️ status/is_deleted 显式写（现网 sys_menu status 无默认值约定，漏写落 0=禁用）。
-- ⚠️ client_id 列（V72）省略 = DEFAULT 1 = portal 平台端（本菜单只挂管理端）。
-- ============================================================

-- 菜单页：开发管理（id=180，V66 同款写死）下 sort 8（该级现至 数据权限=7，实测确认追加值）
INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT 180, '客户端管理', 1, '/system/client', 'system/client/index', 'system:client:list', 'Cellphone', 8, 1, 0, NOW(6), NOW(6) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE `permission` = 'system:client:list');

SET @client_menu_id = (SELECT id FROM sys_menu WHERE `permission` = 'system:client:list' LIMIT 1);

-- 按钮行（跟随菜单页，不占屏）
INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT @client_menu_id, '客户端新增', 2, NULL, NULL, 'system:client:create', NULL, 1, 1, 0, NOW(6), NOW(6) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE `permission` = 'system:client:create');

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT @client_menu_id, '客户端修改', 2, NULL, NULL, 'system:client:update', NULL, 2, 1, 0, NOW(6), NOW(6) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE `permission` = 'system:client:update');

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT @client_menu_id, '客户端删除', 2, NULL, NULL, 'system:client:delete', NULL, 3, 1, 0, NOW(6), NOW(6) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE `permission` = 'system:client:delete');

-- 给 ROLE_ADMIN 赋值新菜单权限（管理员走免过滤分支，此处保持与其他菜单一致的授权记录）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.permission IN ('system:client:list', 'system:client:create', 'system:client:update', 'system:client:delete')
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- 核对：4 行齐备（结果不影响迁移成败）
SELECT COUNT(*) AS client_menu_rows FROM sys_menu WHERE permission LIKE 'system:client:%';
