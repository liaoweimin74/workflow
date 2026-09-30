-- V22: 添加 form_id 字段到 wf_data_source 表
-- 用于关联业务表单数据源

-- 检查列是否已存在，不存在才添加
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wf_data_source'
      AND COLUMN_NAME = 'form_id'
);

-- 动态添加列（仅当列不存在时）
SET @sql = IF(@column_exists = 0,
    'ALTER TABLE wf_data_source ADD COLUMN form_id VARCHAR(64) COMMENT ''关联的业务表单ID''',
    'SELECT ''form_id column already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 为 form_id 字段添加索引（检查是否已存在）
SET @index_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wf_data_source'
      AND INDEX_NAME = 'idx_wf_data_source_form_id'
);

SET @sql2 = IF(@index_exists = 0,
    'CREATE INDEX idx_wf_data_source_form_id ON wf_data_source(form_id)',
    'SELECT ''index already exists'''
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;