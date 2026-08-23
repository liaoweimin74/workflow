-- ============================================================
-- V22: 页面定义增加 data_source_id 字段
-- 视图绑定数据源新协议：dataSourceId 指向 wf_data_source.id；
-- formKey 为遗留字段仅保留兼容。
-- 注意：JPA ddl-auto=update 可能已自动添加此列，需幂等处理
-- ============================================================

-- MySQL: 仅当列不存在时才添加
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wf_page_def'
      AND COLUMN_NAME = 'data_source_id');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE wf_page_def ADD COLUMN data_source_id VARCHAR(64) DEFAULT NULL COMMENT ''视图绑定数据源ID'' AFTER form_key',
    'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
