-- ============================================================
-- V77: wf_page_def 加 target_clients——发布目标端（A5，designs 2026-10-25 §4）
--
-- 语义：
--   1. target_clients = sys_client.id 升序去重逗号分隔 CSV（如 "1,2"），
--      由 PageDefinitionService.publish(id, clientIds) 发布时写入。
--   2. NULL = 存量已发布行缺省仅 portal(1)：PageTargetClients.contains 与
--      PageAccessGuard 非 portal 端闸统一按此解读——存量数据零破坏的关键。
--   3. 逻辑外键，不建真 FK 约束（对齐 V71/V72/V73）。
-- 实体双轨：PageDefinition.targetClients（H2 测试库按实体建表，改列必须同步实体）。
-- 非幂等说明：同 V73——ADD COLUMN 无 IF NOT EXISTS，依赖 flyway 历史表保证单次执行。
-- ============================================================

ALTER TABLE `wf_page_def`
    ADD COLUMN `target_clients` VARCHAR(255) NULL COMMENT 'A5 发布目标端：sys_client.id 升序CSV（如"1,2"）；NULL=存量缺省仅portal(1)';

SELECT COUNT(*) AS legacy_null_rows_check FROM `wf_page_def` WHERE `target_clients` IS NULL;
