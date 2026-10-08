-- ============================================================
-- V43: 人员组织模型增强——岗位管理 / 成员组管理 / 组织负责人 / 用户岗位
-- 配合工作流的选人模型（对应薪福通「岗位管理」「成员组使用指引」需求）：
--   1. sys_post 岗位表 + sys_user.post_id（用户归属岗位）
--   2. sys_member_group 成员组 + 成员（手动维护）+ 自动规则（按岗位/组织匹配）
--   3. sys_organization.leader_id 组织负责人（从用户中选取；
--      引擎 buildResolutionContext.initiatorSupervisor 由此回填）
--   4. 系统管理菜单 seed（岗位管理/成员组管理 + 按钮权限）并授权 ROLE_ADMIN
-- ============================================================

-- ---------- 1. 岗位 ----------
CREATE TABLE IF NOT EXISTS `sys_post` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `post_code`   VARCHAR(64)  NOT NULL COMMENT '岗位编码',
    `post_name`   VARCHAR(64)  NOT NULL COMMENT '岗位名称',
    `description` VARCHAR(255) NULL     COMMENT '岗位说明',
    `sort_order`  INT          NULL     COMMENT '排序',
    `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 启用 0 停用',
    `is_deleted`  TINYINT      NOT NULL DEFAULT 0,
    `created_at`  DATETIME     NULL,
    `created_by`  VARCHAR(64)  NULL,
    `updated_at`  DATETIME     NULL,
    `updated_by`  VARCHAR(64)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_sys_post_code` (`post_code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '岗位';

-- 用户归属岗位（单个岗位字段；选人/成员组规则按它匹配）
ALTER TABLE `sys_user`
    ADD COLUMN `post_id` BIGINT NULL COMMENT '岗位 id（sys_post.id）' AFTER `org_id`,
    ADD KEY `idx_sys_user_post` (`post_id`);

-- ---------- 2. 成员组 ----------
CREATE TABLE IF NOT EXISTS `sys_member_group` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `group_name`  VARCHAR(64)  NOT NULL COMMENT '成员组名称',
    `description` VARCHAR(255) NULL     COMMENT '成员组说明',
    `is_deleted`  TINYINT      NOT NULL DEFAULT 0,
    `created_at`  DATETIME     NULL,
    `created_by`  VARCHAR(64)  NULL,
    `updated_at`  DATETIME     NULL,
    `updated_by`  VARCHAR(64)  NULL,
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '成员组';

-- 成员组成员（手动添加部分；规则匹配的成员不入此表，查询时动态展开）
CREATE TABLE IF NOT EXISTS `sys_member_group_member` (
    `id`         BIGINT   NOT NULL AUTO_INCREMENT,
    `group_id`   BIGINT   NOT NULL COMMENT '成员组 id',
    `user_id`    BIGINT   NOT NULL COMMENT '用户 id',
    `is_deleted` TINYINT  NOT NULL DEFAULT 0,
    `created_at` DATETIME NULL,
    `updated_at` DATETIME NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_group_user` (`group_id`, `user_id`),
    KEY `idx_mgm_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '成员组成员（手动维护）';

-- 成员组自动匹配规则（按岗位 / 按组织机构维度，符合条件者自动归属）
CREATE TABLE IF NOT EXISTS `sys_member_group_rule` (
    `id`         BIGINT      NOT NULL AUTO_INCREMENT,
    `group_id`   BIGINT      NOT NULL COMMENT '成员组 id',
    `rule_type`  VARCHAR(32) NOT NULL COMMENT '规则维度：position=按岗位 org=按组织机构',
    `rule_value` BIGINT      NOT NULL COMMENT '维度取值：post_id / org_id',
    `is_deleted` TINYINT     NOT NULL DEFAULT 0,
    `created_at` DATETIME    NULL,
    `updated_at` DATETIME    NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_group_rule` (`group_id`, `rule_type`, `rule_value`),
    KEY `idx_mgr_value` (`rule_type`, `rule_value`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '成员组自动匹配规则';

-- ---------- 3. 组织负责人 ----------
ALTER TABLE `sys_organization`
    ADD COLUMN `leader_id` BIGINT NULL COMMENT '负责人用户 id（sys_user.id）' AFTER `org_code`;

-- ---------- 4. 菜单 seed（id 300-311，V2 用 1-27 / V7,V11,V21 用 100-160 / V26 用 250-259） ----------
-- status/is_deleted 显式写（sys_menu 无默认值，见 V2 注释）
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(300, 1, '岗位管理',   1, '/system/post',         'system/post/index',         'system:post:list',          'Postcard', 6, 1, 0, NOW(), NOW()),
(305, 1, '成员组管理', 1, '/system/member-group', 'system/member-group/index', 'system:member-group:list',  'UserFilled', 7, 1, 0, NOW(), NOW());

INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(301, 300, '岗位查询', 2, 'system:post:query',          1, 1, 0, NOW(), NOW()),
(302, 300, '岗位新增', 2, 'system:post:create',         2, 1, 0, NOW(), NOW()),
(303, 300, '岗位修改', 2, 'system:post:update',         3, 1, 0, NOW(), NOW()),
(304, 300, '岗位删除', 2, 'system:post:delete',         4, 1, 0, NOW(), NOW()),
(306, 305, '成员组查询', 2, 'system:member-group:query',  1, 1, 0, NOW(), NOW()),
(307, 305, '成员组新增', 2, 'system:member-group:create', 2, 1, 0, NOW(), NOW()),
(308, 305, '成员组修改', 2, 'system:member-group:update', 3, 1, 0, NOW(), NOW()),
(309, 305, '成员组删除', 2, 'system:member-group:delete', 4, 1, 0, NOW(), NOW()),
(310, 305, '成员组维护成员', 2, 'system:member-group:member', 5, 1, 0, NOW(), NOW()),
(311, 305, '成员组维护规则', 2, 'system:member-group:rule',   6, 1, 0, NOW(), NOW());

-- 授权 ROLE_ADMIN 全部菜单（对齐 V3 写法，幂等）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);
