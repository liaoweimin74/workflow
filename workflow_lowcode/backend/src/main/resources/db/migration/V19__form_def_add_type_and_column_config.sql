-- 幂等加列：兼容首次执行（列不存在）与部分执行（列已存在，Flyway 记录失败）的场景
SET @type_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_form_def' AND COLUMN_NAME = 'type');
SET @ddl1 = IF(@type_exists = 0,
    'ALTER TABLE wf_form_def ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT ''WORKFLOW''',
    'SELECT 1');
PREPARE stmt1 FROM @ddl1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @cc_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_form_def' AND COLUMN_NAME = 'column_config');
SET @ddl2 = IF(@cc_exists = 0,
    'ALTER TABLE wf_form_def ADD COLUMN column_config JSON NULL',
    'SELECT 1');
PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
