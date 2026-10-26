-- ============================================================
-- V72: sys_menu 加 client_id——菜单按客户端分树（J1，移植 backend-node V51）
--
-- 语义：
--   1. client_id = 该菜单归属的客户端（sys_client.id 逻辑外键）；DEFAULT 1 = portal 平台端，
--      存量 100% 行由 DEFAULT 自动回填到默认平台客户端——现网行为零破坏的关键。
--   2. 索引 idx_menu_client(client_id, parent_id)：端内取树主查询路径。
--   3. 逻辑外键，不建真 FK 约束（V2 后 sys_* 惯例，对齐 V71）。
-- 非幂等说明：MySQL ADD COLUMN 无 IF NOT EXISTS，依赖 flyway 历史表保证单次执行。
-- ============================================================

ALTER TABLE `sys_menu`
    ADD COLUMN `client_id` BIGINT NOT NULL DEFAULT 1 COMMENT '归属客户端 id（sys_client.id 逻辑外键），1=portal 平台端',
    ADD INDEX `idx_menu_client` (`client_id`, `parent_id`);

SELECT COUNT(*) AS client_id_null_check FROM `sys_menu` WHERE `client_id` IS NULL;
