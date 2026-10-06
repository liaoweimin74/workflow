-- ============================================================
-- V50: 成员组管理去业务表单化，回归专用数据表（Task 142）
--
-- 【背景】V49 曾把成员组管理挂到业务表单 member_group（BizDataListPage +
--         wf_biz_member_group 懒建表，字段为「成员姓名逗号分隔」文本）。
--         用户决策：成员组管理不再用业务表单实现，直接创建专用数据表；
--         成员组自动规则机制不再需要（backend-node V49 已删规则表）。
--
-- 本迁移：
--   1. 建专用表 sys_member_group / sys_member_group_member（列结构对齐
--      SysMemberGroup / SysMemberGroupMember 实体，JPA ddl-auto 先建则空转）；
--   2. 预置两个示例成员组（含成员关系，业务表单从未物化数据、无存量可搬）；
--   3. 菜单 305 组件改回专用页 system/member-group/MemberGroupPage，
--      补齐按钮权限（312-316，对齐字典管理 24-27 的按钮三件套模式）；
--   4. 业务表单种子退役（删除 wf_form_def key=member_group 及其表单数据）。
--
-- 【幂等】DDL 全 IF NOT EXISTS；数据全 NOT EXISTS 防御，可重复执行。
-- ============================================================

-- ---------- 1. 专用表 ----------
CREATE TABLE IF NOT EXISTS `sys_member_group` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `group_name`  VARCHAR(64)  NOT NULL COMMENT '成员组名称',
    `description` VARCHAR(255) NULL COMMENT '说明',
    `status`      INT          NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用',
    `is_deleted`  INT          NOT NULL DEFAULT 0,
    `created_by`  VARCHAR(50)  NULL,
    `created_at`  DATETIME(6)  NULL,
    `updated_by`  VARCHAR(50)  NULL,
    `updated_at`  DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_sys_member_group_name` (`group_name`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='成员组主数据';

CREATE TABLE IF NOT EXISTS `sys_member_group_member` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `group_id`    BIGINT       NOT NULL COMMENT '成员组 id',
    `user_id`     BIGINT       NOT NULL COMMENT '用户 id',
    `is_deleted`  INT          NOT NULL DEFAULT 0,
    `created_by`  VARCHAR(50)  NULL,
    `created_at`  DATETIME(6)  NULL,
    `updated_at`  DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_member_group_user` (`group_id`, `user_id`),
    KEY `idx_member_group_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='成员组成员关系（手动添加，规则机制已移除）';

-- ---------- 2. 示例数据（业务表单从未物化数据，无存量搬迁） ----------
INSERT INTO sys_member_group (`group_name`, `description`, `status`, `is_deleted`, `created_by`, `created_at`, `updated_at`)
SELECT '项目管理组', '项目立项、评审、验收相关流程的审批协同组', 1, 0, 'system', NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_member_group WHERE group_name = '项目管理组' AND is_deleted = 0);

INSERT INTO sys_member_group (`group_name`, `description`, `status`, `is_deleted`, `created_by`, `created_at`, `updated_at`)
SELECT '运维值班组', '系统值班与告警处理通知组', 1, 0, 'system', NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_member_group WHERE group_name = '运维值班组' AND is_deleted = 0);

INSERT INTO sys_member_group_member (`group_id`, `user_id`, `is_deleted`, `created_by`, `created_at`, `updated_at`)
SELECT g.id, u.id, 0, 'system', NOW(3), NOW(3)
FROM sys_member_group g, sys_user u
WHERE g.group_name = '项目管理组' AND g.is_deleted = 0
  AND u.username IN ('admin', 'test') AND u.is_deleted = 0
  AND NOT EXISTS (SELECT 1 FROM sys_member_group_member m
                  WHERE m.group_id = g.id AND m.user_id = u.id);

-- ---------- 3. 菜单：305 组件改回专用页 + 按钮权限补齐 ----------
UPDATE sys_menu SET component = 'system/member-group/MemberGroupPage', updated_at = NOW(3)
WHERE id = 305 AND component <> 'system/member-group/MemberGroupPage';

-- 按钮权限（menu_type 2，对齐字典管理 24-27 模式；312-316 空闲已核）
INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 312, NOW(3), NOW(3), 0, NULL, NULL, '成员组查询', 2, 305, NULL, 'system:member-group:query', 1, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 312);

INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 313, NOW(3), NOW(3), 0, NULL, NULL, '成员组新增', 2, 305, NULL, 'system:member-group:create', 2, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 313);

INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 314, NOW(3), NOW(3), 0, NULL, NULL, '成员组修改', 2, 305, NULL, 'system:member-group:update', 3, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 314);

INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 315, NOW(3), NOW(3), 0, NULL, NULL, '成员组删除', 2, 305, NULL, 'system:member-group:delete', 4, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 315);

INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 316, NOW(3), NOW(3), 0, NULL, NULL, '成员维护', 2, 305, NULL, 'system:member-group:member', 5, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 316);

-- ROLE_ADMIN 授权按钮
INSERT INTO sys_role_menu (`role_id`, `menu_id`)
SELECT 1, m.menu_id FROM (SELECT 312 AS menu_id UNION SELECT 313 UNION SELECT 314 UNION SELECT 315 UNION SELECT 316) m
WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu r WHERE r.role_id = 1 AND r.menu_id = m.menu_id);

-- ---------- 4. 业务表单种子退役 ----------
DELETE FROM wf_form_data WHERE form_def_id = '5e1a7b0c9d2e4f3a8b6c1d0e2f3a4b5c';
DELETE FROM wf_form_def WHERE id = '5e1a7b0c9d2e4f3a8b6c1d0e2f3a4b5c' AND `key` = 'member_group';
