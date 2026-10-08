-- ============================================================
-- V51: 系统组件·附件（Task 146）
--
-- 低代码表单/页面设计器「系统组件」分组新增附件组件，文件元数据
-- 落专用表 sys_attachment，文件内容存本地磁盘（storage-path 配置）。
--
-- 值语义（组件 modelValue）：
--   - 单文件模式：附件 id（数字）
--   - 多文件模式：附件 id 数组（业务表单列映射 JSON）
--
-- 【幂等】DDL IF NOT EXISTS，可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_attachment` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT,
    `file_name`    VARCHAR(500) NOT NULL COMMENT '原始文件名（展示用）',
    `stored_name`  VARCHAR(128) NOT NULL COMMENT '存储文件名（uuid.ext，服务端生成）',
    `content_type` VARCHAR(255) NULL COMMENT 'MIME 类型',
    `file_size`    BIGINT       NOT NULL DEFAULT 0 COMMENT '文件字节数',
    `storage_path` VARCHAR(500) NOT NULL COMMENT '相对 storage-path 的子路径（yyyy/MM/uuid.ext）',
    `biz_type`     VARCHAR(50)  NULL COMMENT '业务归类（预留：form/page/...）',
    `biz_ref`      VARCHAR(64)  NULL COMMENT '业务引用标识（预留）',
    `is_deleted`   INT          NOT NULL DEFAULT 0,
    `created_by`   VARCHAR(50)  NULL,
    `created_at`   DATETIME(6)  NULL,
    `updated_by`   VARCHAR(50)  NULL,
    `updated_at`   DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_sys_attachment_stored_name` (`stored_name`),
    KEY `idx_sys_attachment_created_at` (`created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='系统组件·附件元数据（Task 146）';
