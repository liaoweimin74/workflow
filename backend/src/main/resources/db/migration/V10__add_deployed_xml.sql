-- ============================================================
-- V10: 新增 deployed_xml 字段 + 重命名 key 列为 process_key
-- key 是 MySQL 保留字，改用 process_key 避免引号问题
-- 注意：ddl-auto=update 可能已自动创建 process_key 列，需条件处理
-- ============================================================

-- 仅当 key 列存在时重命名（ddl-auto 可能已创建 process_key）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_process_draft' AND COLUMN_NAME = 'key');

SET @sql = IF(@col_exists > 0,
  'alter table `wf_process_draft` change column `key` `process_key` VARCHAR(255) NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 仅当 deployed_xml 列不存在时添加
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_process_draft' AND COLUMN_NAME = 'deployed_xml');

SET @sql = IF(@col_exists > 0,
  'SELECT 1',
  'alter table `wf_process_draft` add column `deployed_xml` LONGTEXT');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
