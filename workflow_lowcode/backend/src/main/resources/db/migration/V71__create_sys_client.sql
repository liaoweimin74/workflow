-- ============================================================
-- V71: 多端客户端建模——sys_client（客户端定义）/ sys_client_channel（客户端渠道开通）
-- 对应 multi-client-support Java 重建 J1（数据底座，不含业务代码）。
-- 形状逐列对齐 backend-node V50（同一 spec client-data-model），差异仅两处（Java 库惯例）：
--   1. BaseEntity 审计列齐全（is_deleted/created_by/updated_by）——node V50 无这三列，
--      Java 实体 extends BaseEntity 必须有（ddl-auto=update 双轨对齐）。
--   2. 时间戳 datetime(6)（对齐 sys_menu/sys_role 现网列型，Hibernate LocalDateTime 缺省）。
-- 编号说明：workflow 库 flyway 历史被并行实验分支（wf_app，已废弃）用到 V70，
-- 本变更 Java 侧迁移自 V71 起编避让。
-- 幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE（seed 显式 id=1，新表无主键冲突面）。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_client` (
    `id`                      BIGINT       NOT NULL AUTO_INCREMENT,
    `code`                    VARCHAR(64)  NOT NULL COMMENT '客户端编码：portal=平台端，全局唯一',
    `name`                    VARCHAR(64)  NOT NULL COMMENT '客户端名称',
    `icon`                    VARCHAR(128) NULL     COMMENT '客户端图标（URL 或图标名）',
    `status`                  INT          NOT NULL DEFAULT 1 COMMENT '状态：1 启用 0 停用',
    `default_role_id`         BIGINT       NULL     COMMENT '默认角色 id（sys_role.id，登录未显式授权时回退用）',
    `default_member_group_id` BIGINT       NULL     COMMENT '默认成员组 id（sys_member_group.id）',
    `is_deleted`              INT          NOT NULL DEFAULT 0,
    `created_by`              VARCHAR(50)  NULL,
    `created_at`              DATETIME(6)  NULL,
    `updated_by`              VARCHAR(50)  NULL,
    `updated_at`              DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_client_code` (`code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='客户端定义（多端支持）';

CREATE TABLE IF NOT EXISTS `sys_client_channel` (
    `id`           BIGINT      NOT NULL AUTO_INCREMENT,
    `client_id`    BIGINT      NOT NULL COMMENT '客户端 id（sys_client.id，逻辑外键）',
    `channel_type` VARCHAR(8)  NOT NULL COMMENT '渠道类型：WEB / H5 / APP / MP',
    `enabled`      INT         NOT NULL DEFAULT 0 COMMENT '是否开通：1 开通 0 未开通',
    `config_json`  TEXT        NULL     COMMENT '渠道配置 JSON（loginMethods/appid/secret/minVersion/forceUpdate/downloadUrl；secret 密文）',
    `is_deleted`   INT         NOT NULL DEFAULT 0,
    `created_by`   VARCHAR(50) NULL,
    `created_at`   DATETIME(6) NULL,
    `updated_by`   VARCHAR(50) NULL,
    `updated_at`   DATETIME(6) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_client_channel` (`client_id`, `channel_type`),
    KEY `idx_channel_client` (`client_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='客户端渠道开通矩阵';

-- ---------- seed：平台端 portal + 默认开通 WEB（存量零破坏） ----------
INSERT IGNORE INTO sys_client (id, code, name, status, created_at, updated_at)
VALUES (1, 'portal', '平台端', 1, NOW(6), NOW(6));

INSERT IGNORE INTO sys_client_channel (client_id, channel_type, enabled, created_at, updated_at)
VALUES (1, 'WEB', 1, NOW(6), NOW(6));
