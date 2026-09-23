-- ============================================================
-- 初始化数据：系统管理员、角色、菜单、权限
-- 执行时机：JPA ddl-auto 建表完成后
-- ============================================================

-- 密码说明：BCrypt 加密，密码为 "admin123"
-- 可使用 https://bcrypt-generator.com/ 生成
-- 示例哈希：$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy

-- 管理员角色
INSERT INTO sys_role (role_name, role_code, description, status, is_deleted, created_at, updated_at)
VALUES ('超级管理员', 'ROLE_ADMIN', '系统超级管理员', 1, 0, NOW(), NOW());

-- 普通用户角色
INSERT INTO sys_role (role_name, role_code, description, status, is_deleted, created_at, updated_at)
VALUES ('普通用户', 'ROLE_USER', '系统普通用户', 1, 0, NOW(), NOW());

-- 管理员用户（密码: admin123）
INSERT INTO sys_user (username, nickname, password, email, status, is_deleted, created_at, updated_at)
VALUES ('admin', '管理员', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', 'admin@workflow.com', 1, 0, NOW(), NOW());

-- 测试用户（密码: test123）
INSERT INTO sys_user (username, nickname, password, email, status, is_deleted, created_at, updated_at)
VALUES ('test', '测试用户', '$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2', 'test@workflow.com', 1, 0, NOW(), NOW());

-- 分配角色
INSERT INTO sys_user_role (user_id, role_id)
SELECT u.id, r.id FROM sys_user u, sys_role r WHERE u.username = 'admin' AND r.role_code = 'ROLE_ADMIN';

INSERT INTO sys_user_role (user_id, role_id)
SELECT u.id, r.id FROM sys_user u, sys_role r WHERE u.username = 'test' AND r.role_code = 'ROLE_USER';

-- Insert default menus
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, created_at, updated_at) VALUES
(1, NULL, '系统管理', 0, '/system', NULL, NULL, 'Setting', 1, NOW(), NOW()),
(2, 1, '用户管理', 1, '/system/user', 'system/user/index', 'system:user:list', 'User', 1, NOW(), NOW()),
(3, 1, '角色管理', 1, '/system/role', 'system/role/index', 'system:role:list', 'UserFilled', 2, NOW(), NOW()),
(4, 1, '菜单管理', 1, '/system/menu', 'system/menu/index', 'system:menu:list', 'Menu', 3, NOW(), NOW()),
(5, 1, '组织机构', 1, '/system/org', 'system/org/index', 'system:org:list', 'Organization', 4, NOW(), NOW()),
(6, 1, '字典管理', 1, '/system/dict', 'system/dict/index', 'system:dict:list', 'List', 5, NOW(), NOW()),
(7, NULL, '首页', 1, '/dashboard', 'dashboard/index', NULL, 'HomeFilled', 0, NOW(), NOW());


-- Menu permissions
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, created_at, updated_at) VALUES
(8, 2, '用户查询', 2, 'system:user:query', 1, NOW(), NOW()),
(9, 2, '用户新增', 2, 'system:user:create', 2, NOW(), NOW()),
(10, 2, '用户修改', 2, 'system:user:update', 3, NOW(), NOW()),
(11, 2, '用户删除', 2, 'system:user:delete', 4, NOW(), NOW()),
(12, 3, '角色查询', 2, 'system:role:query', 1, NOW(), NOW()),
(13, 3, '角色新增', 2, 'system:role:create', 2, NOW(), NOW()),
(14, 3, '角色修改', 2, 'system:role:update', 3, NOW(), NOW()),
(15, 3, '角色删除', 2, 'system:role:delete', 4, NOW(), NOW()),
(16, 4, '菜单查询', 2, 'system:menu:query', 1, NOW(), NOW()),
(17, 4, '菜单新增', 2, 'system:menu:create', 2, NOW(), NOW()),
(18, 4, '菜单修改', 2, 'system:menu:update', 3, NOW(), NOW()),
(19, 4, '菜单删除', 2, 'system:menu:delete', 4, NOW(), NOW()),
(20, 5, '机构查询', 2, 'system:org:query', 1, NOW(), NOW()),
(21, 5, '机构新增', 2, 'system:org:create', 2, NOW(), NOW()),
(22, 5, '机构修改', 2, 'system:org:update', 3, NOW(), NOW()),
(23, 5, '机构删除', 2, 'system:org:delete', 4, NOW(), NOW()),
(24, 6, '字典查询', 2, 'system:dict:query', 1, NOW(), NOW()),
(25, 6, '字典新增', 2, 'system:dict:create', 2, NOW(), NOW()),
(26, 6, '字典修改', 2, 'system:dict:update', 3, NOW(), NOW()),
(27, 6, '字典删除', 2, 'system:dict:delete', 4, NOW(), NOW());