-- ============================================================
-- V50: 多端客户端建模——sys_client（客户端定义）/ sys_client_channel（客户端渠道开通）
-- 对应 multi-client-support 变更 Task 1（数据底座，不含业务代码）。
--   1. sys_client：一个客户端一行（portal=现有平台端，后续 app/h5/小程序等），
--      default_role_id / default_member_group_id 预留给注册/首登的默认归属。
--   2. sys_client_channel：客户端 × 渠道（WEB|H5|APP|MP）开通矩阵；
--      config_json 形状 {loginMethods: string[], appid?, secret?, minVersion?, forceUpdate?, downloadUrl?}
--      （secret 存密文，加解密在 Task 2 实现）。
--   3. seed：id=1 的 portal「平台端」，并默认开通 WEB 渠道——存量平台端行为零破坏的关键，
--      故 enabled 列的 DEFAULT 0 只约束未来新增渠道，seed 行显式写 1。
-- 风格对齐 V43 sys_post / sys_member_group_member（手写迁移的 sys_* 惯例：
--   BIGINT AI 主键 / DATETIME NULL 时间戳 / uk_* 唯一键命名 / 逻辑外键+注释，不建真实 FK 约束）。
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE（与 V43 菜单 seed 写法一致）。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_client` (
    `id`                      BIGINT       NOT NULL AUTO_INCREMENT,
    `code`                    VARCHAR(64)  NOT NULL COMMENT '客户端编码：portal=平台端，全局唯一',
    `name`                    VARCHAR(64)  NOT NULL COMMENT '客户端名称',
    `icon`                    VARCHAR(128) NULL     COMMENT '客户端图标（URL 或图标名）',
    `status`                  TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 启用 0 停用',
    `default_role_id`         BIGINT       NULL     COMMENT '默认角色 id（sys_role.id，登录未显式授权时回退用）',
    `default_member_group_id` BIGINT       NULL     COMMENT '默认成员组 id（sys_member_group.id）',
    `created_at`              DATETIME     NULL,
    `updated_at`              DATETIME     NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_client_code` (`code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '客户端定义（多端支持）';

CREATE TABLE IF NOT EXISTS `sys_client_channel` (
    `id`           BIGINT     NOT NULL AUTO_INCREMENT,
    `client_id`    BIGINT     NOT NULL COMMENT '客户端 id（sys_client.id，逻辑外键）',
    `channel_type` VARCHAR(8) NOT NULL COMMENT '渠道类型：WEB / H5 / APP / MP',
    `enabled`      TINYINT    NOT NULL DEFAULT 0 COMMENT '是否开通：1 开通 0 未开通',
    `config_json`  TEXT       NULL     COMMENT '渠道配置 JSON（loginMethods/appid/secret/minVersion/forceUpdate/downloadUrl；secret 密文）',
    `created_at`   DATETIME   NULL,
    `updated_at`   DATETIME   NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_client_channel` (`client_id`, `channel_type`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '客户端渠道开通矩阵';

-- ---------- seed：平台端 portal + 默认开通 WEB（存量零破坏） ----------
INSERT IGNORE INTO sys_client (id, code, name, status, created_at, updated_at)
VALUES (1, 'portal', '平台端', 1, NOW(), NOW());

INSERT IGNORE INTO sys_client_channel (client_id, channel_type, enabled, config_json, created_at, updated_at)
VALUES (1, 'WEB', 1, NULL, NOW(), NOW());
