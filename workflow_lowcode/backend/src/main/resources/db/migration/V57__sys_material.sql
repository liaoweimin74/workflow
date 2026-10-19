-- ============================================================
-- V57: 远程物料（change: remote-materials 一期）
--
-- 手写 Vue 页面/组件打包为 ESM 物料上传平台，运行时动态加载、跨项目复用。
-- sys_material 存元数据 + manifest 原文，bundle 文件落 workflow.material.storage-path。
-- 【幂等】DDL IF NOT EXISTS / INSERT NOT EXISTS，可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_material` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT,
    `material_key`   VARCHAR(100) NOT NULL COMMENT '物料标识（bundle 内 manifest.key，全局唯一）',
    `name`           VARCHAR(200) NOT NULL COMMENT '物料名称（manifest.name）',
    `type`           VARCHAR(20)  NOT NULL COMMENT 'PAGE 页面型 / WIDGET 组件型',
    `version`        INT          NOT NULL DEFAULT 1 COMMENT '平台侧版本，同 key 重新上传 +1',
    `sdk_version`    VARCHAR(20)  NOT NULL COMMENT '物料要求的 SDK 主版本',
    `manifest_json`  JSON         NOT NULL COMMENT 'manifest 原文（含 meta/菜单建议）',
    `stored_name`    VARCHAR(128) NOT NULL COMMENT 'bundle 存储文件名（uuid.ext，服务端生成）',
    `storage_path`   VARCHAR(500) NOT NULL COMMENT '相对 storage-path 子路径（yyyy/MM/uuid.ext）',
    `file_size`      BIGINT       NOT NULL DEFAULT 0 COMMENT 'bundle 字节数',
    `status`         INT          NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用（停用后运行时拒绝加载）',
    `is_deleted`     INT          NOT NULL DEFAULT 0,
    `created_by`     VARCHAR(50)  NULL,
    `created_at`     DATETIME(6)  NULL,
    `updated_by`     VARCHAR(50)  NULL,
    `updated_at`     DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_sys_material_key` (`material_key`),
    KEY `idx_sys_material_type` (`type`),
    KEY `idx_sys_material_created_at` (`created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='远程物料注册（remote-materials）';

-- 物料管理菜单（系统管理 1 下）：path /material，权限 material:manage
INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 321, NOW(3), NOW(3), 0, 'material/MaterialListPage', 'Files', '物料管理', 1, 1, '/material', 'material:manage', 10, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 321);

-- ROLE_ADMIN 授权
INSERT INTO sys_role_menu (`role_id`, `menu_id`)
SELECT 1, m.menu_id FROM (SELECT 321 AS menu_id) m
WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu r WHERE r.role_id = 1 AND r.menu_id = m.menu_id);
