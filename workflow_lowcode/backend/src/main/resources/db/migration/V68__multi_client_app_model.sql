-- ============================================================
-- V68: 多端应用数据模型（App → Client → 页面启用清单 / 发布快照）
--
-- 两层模型：wf_app = 受众产品（商户端/买家端…），wf_app_client = 交付实例
-- （端类型 WEB/MP_WEIXIN/H5/APP，同一端类型允许多个 Client）。页面启用清单
-- wf_app_client_page 决定 Client 的交付内容；wf_app_release 按 Client 存
-- 发布快照（不可原地变更）。数据边界仍在租户层，应用/客户端不构成隔离。
--
-- wf_page_def 增加 app_id（页面归属应用），页面 key 唯一性从
-- (tenant_id, `key`, version) 换为 (tenant_id, app_id, `key`, version)——
-- 同租户不同应用允许同 key 页面共存。存量数据回填：每租户生成
-- code=default 的「默认应用」并把旧页全部归入，升级零感知。
--
-- 【幂等】4 表 DDL IF NOT EXISTS；回填 INSERT...SELECT...WHERE NOT EXISTS
-- （V32 口径）；旧页 UPDATE 带 app_id IS NULL 守卫。
-- 【兼容】MySQL / H2(MODE=MySQL) 双兼容（backtick/COMMENT/UNIQUE KEY/
--   INDEX/ENGINE 表选项/ALTER DROP INDEX/关联 UPDATE/derived-table
--   NOT EXISTS 均经探针实证可执行）。例外：第 5 步加列为普通 ALTER，
--   Flyway 单次执行；重放报 duplicate column 属预期（V23 的
--   information_schema+PREPARE 动态 SQL 为 MySQL 专用，H2 不可执行）。
-- ============================================================

-- ---------- 1. 应用表 ----------
CREATE TABLE IF NOT EXISTS `wf_app` (
    `id`         VARCHAR(80)  NOT NULL COMMENT '应用 ID（存量默认应用固定 default-app-<tenant_id>）',
    `tenant_id`  VARCHAR(64)  NOT NULL COMMENT '租户 ID',
    `code`       VARCHAR(64)  NOT NULL COMMENT '应用编码（租户内唯一，存量回填固定 default）',
    `name`       VARCHAR(255) NOT NULL COMMENT '应用名称（受众产品，如 商户端/买家端）',
    `theme_json` LONGTEXT     NULL COMMENT '主题配置 JSON（设计令牌覆盖）',
    `status`     VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / DISABLED',
    `created_by` VARCHAR(50)  NULL COMMENT '创建人',
    `created_at` DATETIME(6)  NOT NULL COMMENT '创建时间',
    `updated_at` DATETIME(6)  NOT NULL COMMENT '最后修改时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_tenant_code` (`tenant_id`, `code`),
    INDEX `idx_app_tenant_status` (`tenant_id`, `status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='多端应用（受众产品）';

-- ---------- 2. 客户端实例表 ----------
CREATE TABLE IF NOT EXISTS `wf_app_client` (
    `id`                VARCHAR(64)  NOT NULL COMMENT '客户端实例 ID',
    `tenant_id`         VARCHAR(64)  NOT NULL COMMENT '租户 ID',
    `app_id`            VARCHAR(80)  NOT NULL COMMENT '所属应用 ID（wf_app.id）',
    `client_type`       VARCHAR(32)  NOT NULL COMMENT '端类型：WEB / MP_WEIXIN / H5 / APP',
    `name`              VARCHAR(255) NOT NULL COMMENT '客户端实例名称（同 App 同端类型可多个）',
    `render_mode`       VARCHAR(16)  NOT NULL DEFAULT 'CODEGEN' COMMENT '渲染模式：RUNTIME / CODEGEN',
    `build_config_json` LONGTEXT     NULL COMMENT '构建配置 JSON（小程序 appid / H5 域名 / APP 包名等）',
    `navigation_json`   LONGTEXT     NULL COMMENT '导航配置 JSON（tabBar 样式等）',
    `status`            VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / DISABLED',
    `created_by`        VARCHAR(50)  NULL COMMENT '创建人',
    `created_at`        DATETIME(6)  NOT NULL COMMENT '创建时间',
    `updated_at`        DATETIME(6)  NOT NULL COMMENT '最后修改时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_client` (`tenant_id`, `app_id`, `client_type`, `name`),
    INDEX `idx_client_tenant_app` (`tenant_id`, `app_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='应用客户端实例（交付渠道）';

-- ---------- 3. 客户端页面启用清单 ----------
CREATE TABLE IF NOT EXISTS `wf_app_client_page` (
    `id`              VARCHAR(64) NOT NULL COMMENT '分配记录 ID',
    `tenant_id`       VARCHAR(64) NOT NULL COMMENT '租户 ID',
    `client_id`       VARCHAR(64) NOT NULL COMMENT '客户端实例 ID（wf_app_client.id）',
    `page_id`         VARCHAR(64) NOT NULL COMMENT '页面 ID（wf_page_def.id，须属同 App）',
    `sort`            INT         NOT NULL DEFAULT 0 COMMENT '导航顺序',
    `nav_config_json` LONGTEXT    NULL COMMENT '页面级导航配置 JSON',
    `created_at`      DATETIME(6) NOT NULL COMMENT '创建时间',
    `updated_at`      DATETIME(6) NOT NULL COMMENT '最后修改时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_client_page` (`client_id`, `page_id`),
    INDEX `idx_client_page_tenant` (`tenant_id`, `client_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='客户端页面启用清单';

-- ---------- 4. 客户端发布快照 ----------
CREATE TABLE IF NOT EXISTS `wf_app_release` (
    `id`            VARCHAR(64)   NOT NULL COMMENT '发布 ID',
    `tenant_id`     VARCHAR(64)   NOT NULL COMMENT '租户 ID',
    `client_id`     VARCHAR(64)   NOT NULL COMMENT '客户端实例 ID（wf_app_client.id）',
    `version`       INT           NOT NULL COMMENT '发布版本号（Client 内递增）',
    `snapshot_json` LONGTEXT      NULL COMMENT '发布快照 JSON（启用页面+导航+构建配置，发布后不可变更）',
    `artifact_url`  VARCHAR(512)  NULL COMMENT '构建产物地址',
    `status`        VARCHAR(32)   NOT NULL DEFAULT 'CREATED' COMMENT 'CREATED / BUILDING / BUILT / UPLOADED / FAILED',
    `created_by`    VARCHAR(50)   NULL COMMENT '创建人',
    `created_at`    DATETIME(6)   NOT NULL COMMENT '创建时间',
    `updated_at`    DATETIME(6)   NOT NULL COMMENT '最后修改时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_release` (`client_id`, `version`),
    INDEX `idx_release_tenant` (`tenant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='客户端发布快照';

-- ---------- 5. wf_page_def 增加应用归属列 ----------
ALTER TABLE wf_page_def ADD COLUMN app_id VARCHAR(80) NULL COMMENT '归属应用 ID（wf_app.id）';

-- ---------- 6. 默认应用回填（每租户一个，WHERE NOT EXISTS 防重跑重复插入） ----------
INSERT INTO `wf_app` (`id`, `tenant_id`, `code`, `name`, `status`, `created_by`, `created_at`, `updated_at`)
SELECT CONCAT('default-app-', d.tenant_id), d.tenant_id, 'default', '默认应用', 'ACTIVE', 'system',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT tenant_id FROM wf_page_def) d
WHERE NOT EXISTS (
    SELECT 1 FROM `wf_app` a WHERE a.tenant_id = d.tenant_id AND a.code = 'default'
);

-- ---------- 7. 旧页归入默认应用（幂等：仅补 NULL） ----------
UPDATE wf_page_def p
SET p.app_id = (SELECT a.id FROM `wf_app` a WHERE a.tenant_id = p.tenant_id AND a.code = 'default')
WHERE p.app_id IS NULL;

-- ---------- 8. 页面 key 唯一性换到应用维度 ----------
ALTER TABLE wf_page_def DROP INDEX uk_page_def_tenant_key_version;
ALTER TABLE wf_page_def ADD UNIQUE INDEX uk_page_def_tenant_app_key_version (tenant_id, app_id, `key`, version);
