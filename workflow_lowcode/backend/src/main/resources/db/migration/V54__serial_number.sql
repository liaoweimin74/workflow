-- ============================================================
-- V54: 自动编号·流水号计数表（Task 3-d）
--
-- 业务表单「AutoNumber」组件提交时由后端生成流水号
-- （prefix + 日期段 + 补零序号），计数落本表，按
-- (tenant_id, serial_key, period) 唯一隔离：
--   - serial_key：序列标识 = formKey + '.' + fieldKey，
--     防跨表单同名字段重号；跨发布版本复用同一 key 保持连续
--   - period：重置周期键，由组件 resetPolicy 推导
--     （day=yyyyMMdd / month=yyyyMM / year=yyyy / never=ALL）
--
-- 并发安全：取号走 INSERT ... ON DUPLICATE KEY UPDATE seq=seq+1，
-- 依赖同事务内唯一键行锁持有至提交，保证并发取号严格递增不重号。
--
-- 【Flyway 与 ddl-auto 共存约定】本表无 JPA 实体（纯 JdbcTemplate 访问），
-- ddl-auto=update 不会创建/校验它，Flyway 是其唯一 DDL 来源
-- （参考 V2 头注释：实体管理的表仍由 ddl-auto 负责）。
--
-- 【幂等】CREATE TABLE IF NOT EXISTS，可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS `wf_serial_number` (
    `id`         BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`  VARCHAR(64)  NOT NULL COMMENT '租户 id',
    `serial_key` VARCHAR(128) NOT NULL COMMENT '序列标识（formKey.fieldKey，防跨表单重号）',
    `period`     VARCHAR(16)  NOT NULL COMMENT '重置周期键（day=yyyyMMdd/month=yyyyMM/year=yyyy/never=ALL）',
    `seq`        BIGINT       NOT NULL DEFAULT 0 COMMENT '当前流水号（upsert 自增）',
    `updated_at` DATETIME     NULL COMMENT '最近取号时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_serial` (`tenant_id`, `serial_key`, `period`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='自动编号流水号计数（Task 3-d）';
