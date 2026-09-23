-- 幂等加列：绑定表单的流程定义 key（非空时该业务表单启用流程状态守卫）
SET @pk_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_form_def' AND COLUMN_NAME = 'process_key');
SET @ddl = IF(@pk_exists = 0,
    'ALTER TABLE wf_form_def ADD COLUMN process_key VARCHAR(64) NULL',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;