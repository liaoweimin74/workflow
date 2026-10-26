-- ============================================================
-- V75: 端身份泛化（multi-client-support J3，对应 plan Task 12 锚点的 Node 侧 V54）
--
-- spec client-login-identity「端身份绑定泛化」：
--   1. sys_user_openid 关联客户端维度——同一 openid 在不同客户端为不同身份记录；
--      uk 由 (app_id, openid)/(app_id, user_id) 泛化为 (client_id, openid)/(client_id, user_id)。
--      app_id 保留但放宽为 NULL：泛化后它是**审计列**（记录绑定来源小程序 appid），
--      不再是身份键；身份键 = client_id + openid（一个端一个微信一条记录）。
--   2. client_id NOT NULL DEFAULT 1 = portal——存量 V64 绑定行由 DEFAULT 自动归默认端，
--      与 V72/V73 零破坏同口径（现网小程序绑定链行为不变）。
--   3. sys_user_device：推送设备绑定（plan 锚点表；A4 端身份 Tab 的吊销面，J5 接线业务）。
--   4. sys_bind_code：绑定码一次性载体（ledger D1 裁定：工程无 redis 配置、logout No-op
--      已钉 Redis disabled → 表方案，expires_at 列 TTL + used 列一次性，H2 行为测试可验）。
--
-- 非幂等说明：MySQL 5.7 的 DROP INDEX/MODIFY 无 IF EXISTS 全套写法，
-- 依赖 flyway 历史表保证单次执行（对齐 V72 口径）。
-- ============================================================

ALTER TABLE `sys_user_openid`
    ADD COLUMN `client_id` BIGINT NOT NULL DEFAULT 1 COMMENT '归属客户端 id（sys_client.id 逻辑外键），1=portal 平台端' AFTER `user_id`,
    DROP INDEX `uk_user_openid_app_openid`,
    ADD UNIQUE KEY `uk_user_openid_client_openid` (`client_id`, `openid`),
    DROP INDEX `uk_user_openid_app_user`,
    ADD UNIQUE KEY `uk_user_openid_client_user` (`client_id`, `user_id`),
    MODIFY COLUMN `app_id` VARCHAR(64) NULL COMMENT '来源小程序 appid（审计列，仅 MP 绑定有值；身份键已泛化为 client_id+openid）';

-- ---------- 推送设备绑定（plan 锚点形状：user_id,client_id,device_token,platform,last_login_at,revoked） ----------
CREATE TABLE IF NOT EXISTS `sys_user_device` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT,
    `user_id`       BIGINT       NOT NULL COMMENT '平台账号 sys_user.id',
    `client_id`     BIGINT       NOT NULL DEFAULT 1 COMMENT '归属客户端 id（逻辑外键），1=portal',
    `device_token`  VARCHAR(255) NOT NULL COMMENT '推送设备 token（APNs/FCM/uniPush 等）',
    `platform`      VARCHAR(32)  NULL     COMMENT '设备平台：ios / android / harmony 等',
    `last_login_at` DATETIME(6)  NULL     COMMENT '最近一次登录时间',
    `revoked`       INT          NOT NULL DEFAULT 0 COMMENT '吊销标记：1 已吊销（A4 端身份 Tab 操作）',
    `is_deleted`    INT          NOT NULL DEFAULT 0,
    `created_by`    VARCHAR(50)  NULL,
    `created_at`    DATETIME(6)  NULL,
    `updated_by`    VARCHAR(50)  NULL,
    `updated_at`    DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_device_token` (`device_token`),
    KEY `idx_user_device` (`user_id`, `client_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='用户推送设备绑定（端身份泛化 J3）';

-- ---------- 绑定码（管理端生成 → 端内首绑输入 → 账号↔身份绑定） ----------
CREATE TABLE IF NOT EXISTS `sys_bind_code` (
    `id`          BIGINT      NOT NULL AUTO_INCREMENT,
    `code`        VARCHAR(32) NOT NULL COMMENT '一次性绑定码（SecureRandom 生成，防枚举）',
    `user_id`     BIGINT      NOT NULL COMMENT '目标平台账号 sys_user.id（管理员代办指定）',
    `client_id`   BIGINT      NOT NULL COMMENT '目标客户端 id（绑定只在该端生效）',
    `used`        INT         NOT NULL DEFAULT 0 COMMENT '已消费标记：1 已用（一次性）',
    `expires_at`  DATETIME(6) NOT NULL COMMENT '过期时间（TTL 列，替代 Redis 过期语义）',
    `is_deleted`  INT         NOT NULL DEFAULT 0,
    `created_by`  VARCHAR(50) NULL,
    `created_at`  DATETIME(6) NULL,
    `updated_by`  VARCHAR(50) NULL,
    `updated_at`  DATETIME(6) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_bind_code` (`code`),
    KEY `idx_bind_code_user` (`user_id`, `client_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='端内首绑绑定码（一次性 + TTL，ledger D1 表方案裁定）';
