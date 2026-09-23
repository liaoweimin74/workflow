-- ============================================================
-- V2__init.sql  全量数据库初始化（Flyway 合并精简版）
-- 由 V2~V31 共 29 个迁移文件合并而来：仅保留种子数据/菜单/权限/数据清理
-- 表结构与索引统一由 JPA 实体（ddl-auto=update）管理，Flyway 不再负责建表
-- ============================================================

-- ################################################################
-- 原迁移文件: V2__init_data.sql
-- ################################################################
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
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(1, NULL, '系统管理', 0, '/system', NULL, NULL, 'Setting', 1, 1, 0, NOW(), NOW()),
(2, 1, '用户管理', 1, '/system/user', 'system/user/index', 'system:user:list', 'User', 1, 1, 0, NOW(), NOW()),
(3, 1, '角色管理', 1, '/system/role', 'system/role/index', 'system:role:list', 'UserFilled', 2, 1, 0, NOW(), NOW()),
(4, 1, '菜单管理', 1, '/system/menu', 'system/menu/index', 'system:menu:list', 'Menu', 3, 1, 0, NOW(), NOW()),
(5, 1, '组织机构', 1, '/system/org', 'system/org/index', 'system:org:list', 'Organization', 4, 1, 0, NOW(), NOW()),
(6, 1, '字典管理', 1, '/system/dict', 'system/dict/index', 'system:dict:list', 'List', 5, 1, 0, NOW(), NOW()),
(7, NULL, '首页', 1, '/dashboard', 'dashboard/index', NULL, 'HomeFilled', 0, 1, 0, NOW(), NOW());


-- Menu permissions
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(8, 2, '用户查询', 2, 'system:user:query', 1, 1, 0, NOW(), NOW()),
(9, 2, '用户新增', 2, 'system:user:create', 2, 1, 0, NOW(), NOW()),
(10, 2, '用户修改', 2, 'system:user:update', 3, 1, 0, NOW(), NOW()),
(11, 2, '用户删除', 2, 'system:user:delete', 4, 1, 0, NOW(), NOW()),
(12, 3, '角色查询', 2, 'system:role:query', 1, 1, 0, NOW(), NOW()),
(13, 3, '角色新增', 2, 'system:role:create', 2, 1, 0, NOW(), NOW()),
(14, 3, '角色修改', 2, 'system:role:update', 3, 1, 0, NOW(), NOW()),
(15, 3, '角色删除', 2, 'system:role:delete', 4, 1, 0, NOW(), NOW()),
(16, 4, '菜单查询', 2, 'system:menu:query', 1, 1, 0, NOW(), NOW()),
(17, 4, '菜单新增', 2, 'system:menu:create', 2, 1, 0, NOW(), NOW()),
(18, 4, '菜单修改', 2, 'system:menu:update', 3, 1, 0, NOW(), NOW()),
(19, 4, '菜单删除', 2, 'system:menu:delete', 4, 1, 0, NOW(), NOW()),
(20, 5, '机构查询', 2, 'system:org:query', 1, 1, 0, NOW(), NOW()),
(21, 5, '机构新增', 2, 'system:org:create', 2, 1, 0, NOW(), NOW()),
(22, 5, '机构修改', 2, 'system:org:update', 3, 1, 0, NOW(), NOW()),
(23, 5, '机构删除', 2, 'system:org:delete', 4, 1, 0, NOW(), NOW()),
(24, 6, '字典查询', 2, 'system:dict:query', 1, 1, 0, NOW(), NOW()),
(25, 6, '字典新增', 2, 'system:dict:create', 2, 1, 0, NOW(), NOW()),
(26, 6, '字典修改', 2, 'system:dict:update', 3, 1, 0, NOW(), NOW()),
(27, 6, '字典删除', 2, 'system:dict:delete', 4, 1, 0, NOW(), NOW());

-- ################################################################
-- 原迁移文件: V3__grant_admin_menus.sql
-- ################################################################
-- 给 ROLE_ADMIN 赋值所有菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- ################################################################
-- 原迁移文件: V7__add_process_management_menus.sql
-- ################################################################
-- ============================================================
-- 流程管理菜单：流程定义、流程中心、待办处理
-- ============================================================

-- 父菜单：流程管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(100, NULL, '流程管理', 0, '/process', NULL, NULL, 'Operation', 2, 1, 0, NOW(), NOW());

-- 子菜单
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(101, 100, '流程定义', 1, '/process/definition', 'process/ProcessListPage', 'process:definition:list', 'Document', 1, 1, 0, NOW(), NOW()),
(102, 100, '流程中心', 1, '/process/center', 'process/ProcessCenterPage', 'process:center:list', 'Files', 2, 1, 0, NOW(), NOW()),
(103, 100, '待办处理', 1, '/process/todo', 'process/ProcessTodoPage', 'process:todo:list', 'BellFilled', 3, 1, 0, NOW(), NOW());

-- 流程定义按钮权限
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(110, 101, '流程创建', 2, 'process:definition:create', 1, 1, 0, NOW(), NOW()),
(111, 101, '流程部署', 2, 'process:definition:deploy', 2, 1, 0, NOW(), NOW()),
(112, 101, '流程删除', 2, 'process:definition:delete', 3, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (100, 101, 102, 103, 110, 111, 112)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- ################################################################
-- 原迁移文件: V11__add_category_menu.sql
-- ################################################################
-- ============================================================
-- V11: 删除独立的流程分类菜单（已整合到流程定义页面）
-- ============================================================

DELETE FROM sys_role_menu WHERE menu_id = 104;
DELETE FROM sys_menu WHERE id = 104;

-- ################################################################
-- 原迁移文件: V12__create_form_tables.sql
-- ################################################################
-- ============================================================
-- 表单管理菜单
-- ============================================================

-- 父菜单：表单管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(120, NULL, '表单管理', 0, '/form', NULL, NULL, 'Tickets', 3, 1, 0, NOW(), NOW());

-- 子菜单
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(121, 120, '表单列表', 1, '/form', 'form/FormListPage', 'form:list', 'Document', 1, 1, 0, NOW(), NOW());

-- 表单列表按钮权限
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(130, 121, '表单创建', 2, 'form:create', 1, 1, 0, NOW(), NOW()),
(131, 121, '表单编辑', 2, 'form:edit', 2, 1, 0, NOW(), NOW()),
(132, 121, '表单发布', 2, 'form:publish', 3, 1, 0, NOW(), NOW()),
(133, 121, '表单删除', 2, 'form:delete', 4, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (120, 121, 130, 131, 132, 133)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- ################################################################
-- 原迁移文件: V15__add_process_category_permissions.sql
-- ################################################################
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

-- ################################################################
-- 原迁移文件: V17__clear_form_def_data.sql
-- ################################################################
-- 清空表单定义表数据（版本号语义变更，旧数据不兼容新规则）
DELETE FROM wf_form_def;

-- ################################################################
-- 原迁移文件: V20__create_wf_page_def.sql
-- ################################################################
-- 父菜单：查询界面管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(140, NULL, '查询界面管理', 0, '/page', NULL, NULL, 'Grid', 4, 1, 0, NOW(), NOW());

-- 子菜单：页面列表 + 数据源管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(141, 140, '页面列表', 1, '/page', 'page/PageListPage', 'page:list', 'Document', 1, 1, 0, NOW(), NOW()),
(142, 140, '数据源管理', 1, '/data-source/list', 'dataSource/DataSourceListPage', 'data-source:list', 'Connection', 2, 1, 0, NOW(), NOW());

-- 按钮权限
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(150, 141, '页面创建', 2, 'page:create', 1, 1, 0, NOW(), NOW()),
(151, 141, '页面编辑', 2, 'page:edit', 2, 1, 0, NOW(), NOW()),
(152, 141, '页面发布', 2, 'page:publish', 3, 1, 0, NOW(), NOW()),
(153, 141, '页面删除', 2, 'page:delete', 4, 1, 0, NOW(), NOW()),
(154, 142, '数据源管理', 2, 'data-source:manage', 1, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (140, 141, 142, 150, 151, 152, 153, 154)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- ################################################################
-- 原迁移文件: V21__merge_form_view_menus.sql
-- ################################################################
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

-- ################################################################
-- 原迁移文件: V26__add_notification_menus.sql
-- ################################################################
-- ============================================================
-- V26: 消息中心模块 - 创建菜单与权限
-- 父菜单「消息管理」下挂消息中心与各管理页面
-- ============================================================

-- 父菜单：消息管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(250, NULL, '消息管理', 0, '/messages', NULL, NULL, 'Bell', 5, 1, 0, NOW(), NOW());

-- 子菜单：消息中心 + 管理页面
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(251, 250, '消息中心', 1, '/messages', 'modules/notification/views/MessageCenter', 'notification:message:list', 'Message', 1, 1, 0, NOW(), NOW()),
(252, 250, '模板管理', 1, '/messages/templates', 'modules/notification/views/admin/TemplateList', 'notification:template:list', 'Document', 2, 1, 0, NOW(), NOW()),
(253, 250, '渠道配置', 1, '/messages/channels', 'modules/notification/views/admin/ChannelConfig', 'notification:channel:list', 'Connection', 3, 1, 0, NOW(), NOW()),
(254, 250, '订阅规则', 1, '/messages/subscriptions', 'modules/notification/views/admin/SubscriptionRules', 'notification:subscription:list', 'SetUp', 4, 1, 0, NOW(), NOW()),
(255, 250, '发送记录', 1, '/messages/deliveries', 'modules/notification/views/admin/DeliveryLog', 'notification:delivery:list', 'Tickets', 5, 1, 0, NOW(), NOW());

-- 按钮权限
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(256, 252, '模板管理', 2, 'notification:template:manage', 1, 1, 0, NOW(), NOW()),
(257, 253, '渠道配置', 2, 'notification:channel:manage', 1, 1, 0, NOW(), NOW()),
(258, 254, '订阅规则', 2, 'notification:subscription:manage', 1, 1, 0, NOW(), NOW()),
(259, 255, '发送记录重发', 2, 'notification:delivery:retry', 1, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (250, 251, 252, 253, 254, 255, 256, 257, 258, 259)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- ################################################################
-- 原迁移文件: V29__add_notification_event_definitions.sql
-- ################################################################
-- 公告管理菜单
INSERT IGNORE INTO sys_menu
    (id, parent_id, menu_name, menu_type, path, component, permission, icon,
     sort_order, status, is_deleted, created_at, updated_at)
VALUES
    (260, 250, '公告管理', 1, '/messages/announcements',
     'modules/notification/views/admin/AnnouncementList',
     'notification:announcement:list', 'Notification', 6, 1, 0, NOW(), NOW());

-- 事件管理菜单
INSERT IGNORE INTO sys_menu
    (id, parent_id, menu_name, menu_type, path, component, permission, icon,
     sort_order, status, is_deleted, created_at, updated_at)
VALUES
    (261, 250, '事件管理', 1, '/messages/events',
     'modules/notification/views/admin/EventDefinitionList',
     'notification:event:list', 'Operation', 7, 1, 0, NOW(), NOW());

-- 管理按钮权限
INSERT IGNORE INTO sys_menu
    (id, parent_id, menu_name, menu_type, permission, sort_order,
     status, is_deleted, created_at, updated_at)
VALUES
    (262, 260, '公告管理', 2, 'notification:announcement:manage', 1, 1, 0, NOW(), NOW()),
    (263, 261, '事件管理', 2, 'notification:event:manage', 1, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 授权
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (260, 261, 262, 263)
  AND NOT EXISTS (
      SELECT 1 FROM sys_role_menu rm
      WHERE rm.role_id = r.id AND rm.menu_id = m.id
  );

