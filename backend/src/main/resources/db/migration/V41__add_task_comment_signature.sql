-- ============================================================
-- V41: 审批意见表增加手写签名列
-- 配合节点 signature.enabled / useLast / allowUpload 配置：
--   - completeTask 提交时把 body.signature（dataURL）随 approve 意见落库
--   - useLast=true 的节点，getTaskDetail 查该用户最近一条签名回填
--
-- 注意：JPA ddl-auto=update 可能已按实体字段先行添加该列
-- （Hibernate-first 时序），条件 DDL 保证幂等（对齐 V18/V25/V31 模式）
-- ============================================================

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'wf_task_comment'
      AND COLUMN_NAME = 'signature'
);

SET @ddl := IF(@col_exists = 0,
    'ALTER TABLE wf_task_comment ADD COLUMN signature LONGTEXT NULL COMMENT ''手写签名 dataURL（signature.enabled 节点提交时存储，action=approve）'' AFTER comment',
    'SELECT 1');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
