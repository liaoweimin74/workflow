-- ============================================================
-- V76: A4 端身份 Tab 按钮权限行 + ROLE_ADMIN 授权（J5a，spec client-login-identity「A4 端身份 Tab」）
--
-- 挂「用户管理」（system:user:list，现网 id=2 但 id 空间自增漂移，子查询定位不照抄）。
-- 授权面 = 前端按钮权限码显隐 + 端点登录校验（沿用现网 system 控制器无 @PreAuthorize 先例）。
-- 绑定码签发按钮（system:user:bindcode）管控前端入口，后端链复用 POST /api/auth/bind-code/issue（J3）。
-- ⚠️ status/is_deleted 显式写（sys_menu status 无默认值约定，漏写落 0=禁用）。
-- ⚠️ client_id 列（V72）省略 = DEFAULT 1 = portal 平台端（管理按钮只挂管理端）。
-- 格式跟随 V74（自增 + permission 子查询回连，幂等可重放）。
-- ============================================================

SET @user_menu_id = (SELECT id FROM sys_menu WHERE `permission` = 'system:user:list' LIMIT 1);

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT @user_menu_id, '端身份查看', 2, NULL, NULL, 'system:user:identity', NULL, 5, 1, 0, NOW(6), NOW(6) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE `permission` = 'system:user:identity');

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT @user_menu_id, '端身份解绑', 2, NULL, NULL, 'system:user:unbind', NULL, 6, 1, 0, NOW(6), NOW(6) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE `permission` = 'system:user:unbind');

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT @user_menu_id, '设备吊销', 2, NULL, NULL, 'system:user:revoke', NULL, 7, 1, 0, NOW(6), NOW(6) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE `permission` = 'system:user:revoke');

INSERT INTO sys_menu (parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT @user_menu_id, '绑定码签发', 2, NULL, NULL, 'system:user:bindcode', NULL, 8, 1, 0, NOW(6), NOW(6) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE `permission` = 'system:user:bindcode');

-- 给 ROLE_ADMIN 赋值新按钮权限（管理员走免过滤分支，此处保持与其他菜单一致的授权记录）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.permission IN ('system:user:identity', 'system:user:unbind', 'system:user:revoke', 'system:user:bindcode')
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- 核对：4 行齐备（结果不影响迁移成败）
SELECT COUNT(*) AS a4_button_rows FROM sys_menu
WHERE permission IN ('system:user:identity', 'system:user:unbind', 'system:user:revoke', 'system:user:bindcode');
