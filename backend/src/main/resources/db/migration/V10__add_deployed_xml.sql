-- ============================================================
-- V10: 新增 deployed_xml 字段
-- 注意：key -> process_key 的列重命名由 ddl-auto=update 自动处理
--       （entity @Column(name="process_key") 已改，Hibernate 会自动加列）
--       本脚本仅处理 ddl-auto 无法完成的 deployed_xml 列
-- ============================================================

-- 仅当 deployed_xml 列不存在时添加（ddl-auto 不会处理 @Lob 列类型）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_process_draft' AND COLUMN_NAME = 'deployed_xml');

SET @sql = IF(@col_exists > 0,
  'SELECT 1',
  'alter table `wf_process_draft` add column `deployed_xml` LONGTEXT');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
