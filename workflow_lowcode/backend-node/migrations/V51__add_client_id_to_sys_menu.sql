-- ============================================================
-- V51: sys_menu 加 client_id——菜单按客户端分树（multi-client-support Task 3）
--
-- 语义：
--   1. client_id = 该菜单归属的客户端（sys_client.id）；DEFAULT 1 = portal 平台端，
--      存量 100% 行由 DEFAULT 自动回填到默认平台客户端——现网行为零破坏的关键。
--   2. 索引 idx_menu_client(client_id, parent_id)：端内取树的主查询路径
--      （WHERE client_id = ? ORDER BY parent_id, sort_order）。
--   3. 逻辑外键 sys_client.id，不建真 FK 约束（V2 后 sys_* 惯例，对齐 V50）。
--
-- 非幂等说明：MySQL 的 ADD COLUMN 无 IF NOT EXISTS（MariaDB 方言），本迁移依赖
--   migrator 的历史表保证单次执行；重复执行会因列已存在而失败——属预期护栏。
-- 核对查询（迁移尾）：回填后 client_id IS NULL 计数必须为 0；该事实由集成测试
--   test/integration/menu-client-scope.spec.ts 断言钉死。
-- ============================================================

ALTER TABLE `sys_menu`
    ADD COLUMN `client_id` BIGINT NOT NULL DEFAULT 1 COMMENT '归属客户端 id（sys_client.id 逻辑外键），1=portal 平台端',
    ADD INDEX `idx_menu_client` (`client_id`, `parent_id`);

-- 核对：回填完整性（结果不影响迁移成败，NULL 计数应为 0；正式断言在集成测试）
SELECT COUNT(*) AS client_id_null_check FROM `sys_menu` WHERE `client_id` IS NULL;
