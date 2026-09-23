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
