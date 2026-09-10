-- ============================================================
-- V29: 消息事件定义、公告管理和事件管理菜单
-- ============================================================

CREATE TABLE IF NOT EXISTS msg_event_definition (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id       VARCHAR(64)   NOT NULL COMMENT '租户ID',
    event_code      VARCHAR(64)   NOT NULL COMMENT '业务事件代码',
    event_name      VARCHAR(128)  NOT NULL COMMENT '事件名称',
    description     VARCHAR(500)  NULL COMMENT '事件说明',
    business_domain VARCHAR(64)   NULL COMMENT '业务领域',
    enabled         TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用',
    created_by      VARCHAR(64)   NOT NULL COMMENT '创建人',
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by      VARCHAR(64)   NULL COMMENT '更新人',
    updated_at      DATETIME      NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_event_tenant_code (tenant_id, event_code),
    KEY idx_event_tenant_enabled (tenant_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息业务事件定义';

SET @add_message_event_code = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE msg_message ADD COLUMN event_code VARCHAR(64) NULL COMMENT ''业务事件代码''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'msg_message' AND COLUMN_NAME = 'event_code'
);
PREPARE stmt FROM @add_message_event_code;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_template_event_code = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE msg_template ADD COLUMN event_code VARCHAR(64) NULL COMMENT ''业务事件代码''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'msg_template' AND COLUMN_NAME = 'event_code'
);
PREPARE stmt FROM @add_template_event_code;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_rule_action = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE msg_subscription_rule ADD COLUMN action VARCHAR(16) NOT NULL DEFAULT ''ALLOW'' COMMENT ''规则动作''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'msg_subscription_rule' AND COLUMN_NAME = 'action'
);
PREPARE stmt FROM @add_rule_action;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
