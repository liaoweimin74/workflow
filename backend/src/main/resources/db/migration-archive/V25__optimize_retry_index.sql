-- ============================================================
-- V25: 优化重试表索引
-- idx_retry_status_next: (status, next_retry_at) 复合索引，加速到期重试扫描
--
-- 注意：JPA ddl-auto=update 可能已按实体 @Index 先行创建同名索引
-- （Hibernate-first 时序），此处用条件 DDL 保证幂等（对齐 V18 模式）
-- ============================================================

SET @idx_exists := (
    SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'msg_delivery_retry'
      AND INDEX_NAME = 'idx_retry_status_next'
);

SET @ddl := IF(@idx_exists = 0,
    'CREATE INDEX idx_retry_status_next ON msg_delivery_retry (status, next_retry_at)',
    'SELECT 1');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
