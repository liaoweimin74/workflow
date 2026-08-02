-- ============================================================
-- V8: 流程草稿增加 last_deployed_at 字段
-- 记录上次部署时间，前端通过 updatedAt > lastDeployedAt 判断是否有未部署的修改
-- 注意：JPA ddl-auto=update 可能已自动添加此列，需幂等处理
-- ============================================================

-- MySQL: 仅当列不存在时才添加
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wf_process_draft'
      AND COLUMN_NAME = 'last_deployed_at');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE wf_process_draft ADD COLUMN last_deployed_at DATETIME DEFAULT NULL AFTER deploy_id',
    'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
