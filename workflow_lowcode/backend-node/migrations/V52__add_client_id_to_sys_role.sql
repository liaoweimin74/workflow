-- ============================================================
-- V52: sys_role 加 client_id——角色挂单一客户端（multi-client-support Task 5）
--
-- 语义：
--   1. client_id = 该角色归属的客户端（sys_client.id 逻辑外键）；每条角色恰好属于一端，
--      不存在跨端通用角色（spec client-scoped-role「角色挂单一客户端」）。
--   2. DEFAULT 1 = portal：存量角色（ROLE_ADMIN/ROLE_USER 等 V2 seed）由 DEFAULT 自动
--      回填到默认平台客户端——存量登录/授权行为零破坏的关键。
--   3. 索引 idx_role_client(client_id)：认证链按端过滤角色（sys_user_role → sys_role
--      join 后 WHERE client_id）与角色列表筛选的主查询路径。
--   4. 逻辑外键，不建真 FK 约束（V2 后 sys_* 惯例，对齐 V50/V51）。
--
-- 非幂等说明：同 V51——ADD COLUMN 无 IF NOT EXISTS，依赖 migrator 历史表保证单次执行。
-- 核对查询（迁移尾）：回填后 client_id IS NULL 计数必须为 0；事实由集成测试
--   test/integration/cross-client.spec.ts（行为面）与单测（逻辑面）共同钉住。
-- ============================================================

ALTER TABLE `sys_role`
    ADD COLUMN `client_id` BIGINT NOT NULL DEFAULT 1 COMMENT '归属客户端 id（sys_client.id 逻辑外键），1=portal 平台端',
    ADD INDEX `idx_role_client` (`client_id`);

-- 核对：回填完整性（结果不影响迁移成败，NULL 计数应为 0）
SELECT COUNT(*) AS client_id_null_check FROM `sys_role` WHERE `client_id` IS NULL;
