-- source_key 泛化为全类型唯一标识（租户内唯一）：
-- 1. 存量 FORM/WORKFLOW 回填 source_key = form_key（其表单 key 本就租户内唯一）
-- 2. 建立租户内唯一索引兜底（SQL/API 等未填 source_key 的行保持 NULL，唯一索引对 NULL 不互斥）
--
-- 注意：JPA ddl-auto=update 可能已按实体 @UniqueConstraint 先行建同名唯一索引
-- （Hibernate-first 时序），条件 DDL 保证幂等（对齐 V18/V25 模式）
UPDATE wf_data_source
SET source_key = form_key
WHERE type IN ('FORM', 'WORKFLOW')
  AND (source_key IS NULL OR source_key = '');

SET @idx_exists := (
    SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wf_data_source'
      AND INDEX_NAME = 'uk_ds_tenant_source_key'
);

SET @ddl := IF(@idx_exists = 0,
    'CREATE UNIQUE INDEX uk_ds_tenant_source_key ON wf_data_source (tenant_id, source_key)',
    'SELECT 1');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
