-- ============================================================
-- V64: 小程序客户端主体（P0.4）
--
-- 客户不是新登录体系：仍建在 sys_user，用「客户」角色限制菜单/页面，
-- 用「客户」成员组标记来源（同时可作为数据范围主体 MEMBER_GROUP 的键）。
-- 本迁移只补身份绑定与两个建模种子，不自动创建客户账号、不自动分配角色，
-- 避免任意微信用户扫码即获得平台身份（没挂数据范围的数据源默认放行）。
--
-- 绑定流程：管理员在用户管理创建客户账号并分配 ROLE_CUSTOMER、加入「客户」组；
-- 客户首次在小程序用账号密码调用 /api/auth/miniprogram/bind 完成 openid 绑定，
-- 之后 /api/auth/miniprogram/login 用 code 静默登录。
--
-- 【幂等】DDL IF NOT EXISTS；种子按唯一键 NOT EXISTS 防御，可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_user_openid` (
    `id`         BIGINT      NOT NULL AUTO_INCREMENT,
    `user_id`    BIGINT      NOT NULL COMMENT '平台账号 sys_user.id',
    `app_id`     VARCHAR(64) NOT NULL COMMENT '小程序 appid（一个 appid 下一 openid 只绑一个账号）',
    `openid`     VARCHAR(64) NOT NULL COMMENT '微信 openid',
    `unionid`    VARCHAR(64) NULL COMMENT '微信 unionid（开放平台绑定后返回）',
    `is_deleted` INT         NOT NULL DEFAULT 0,
    `created_by` VARCHAR(50) NULL,
    `created_at` DATETIME(6) NULL,
    `updated_by` VARCHAR(50) NULL,
    `updated_at` DATETIME(6) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_openid_app_openid` (`app_id`, `openid`),
    UNIQUE KEY `uk_user_openid_app_user` (`app_id`, `user_id`),
    KEY `idx_user_openid_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='平台账号与小程序 openid 绑定';

-- 客户角色：无菜单权限，客户端可见页面与数据由页面配置 + 数据范围决定
INSERT INTO sys_role (`role_name`, `role_code`, `description`, `status`, `is_deleted`, `created_at`, `updated_at`)
SELECT '客户', 'ROLE_CUSTOMER', '小程序客户端用户；数据可见范围用数据范围按成员组/本人收紧', 1, 0, NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE `role_code` = 'ROLE_CUSTOMER');

-- 「客户」成员组：客户端主体来源标记，可在数据范围里直接当 MEMBER_GROUP 主体使用
INSERT INTO sys_member_group (`group_name`, `description`, `status`, `is_deleted`, `created_by`, `created_at`, `updated_at`)
SELECT '客户', '小程序客户端用户来源标记（P0.4）', 1, 0, 'system', NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_member_group WHERE `group_name` = '客户');
