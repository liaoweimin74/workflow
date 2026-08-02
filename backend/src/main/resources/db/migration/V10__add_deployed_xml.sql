-- ============================================================
-- V10: 新增 deployed_xml 字段 + 重命名 key 列为 process_key
-- key 是 MySQL 保留字，改用 process_key 避免引号问题
-- ============================================================

alter table `wf_process_draft` change column `key` `process_key` VARCHAR(255) NOT NULL;
alter table `wf_process_draft` add column `deployed_xml` LONGTEXT;
