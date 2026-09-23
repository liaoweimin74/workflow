-- ============================================================
-- V18: 流程草稿表新增部署配置 hash 列
-- deployed_config_hash: 上次部署时的配置指纹（改写后 XML + 节点配置整体 SHA-256）
-- 用于部署变化检测：配置任一变化即可部署，真正无变化才拦截
--
-- 注意：JPA ddl-auto=update 可能已先行添加该列，此处用条件 DDL 保证幂等
-- ============================================================

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wf_process_draft'
      AND COLUMN_NAME = 'deployed_config_hash'
);

SET @ddl := IF(@col_exists = 0,
    'ALTER TABLE wf_process_draft ADD COLUMN deployed_config_hash VARCHAR(64) NULL COMMENT ''上次部署时的配置hash（XML+节点配置整体指纹）''',
    'SELECT 1');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
