-- ============================================================
-- V13: 任务审批意见表
-- 存储审批节点的意见记录，用于审计追踪
-- ============================================================

CREATE TABLE IF NOT EXISTS wf_task_comment (
    id                    VARCHAR(64)   NOT NULL,
    tenant_id             VARCHAR(64)   NOT NULL,
    task_id               VARCHAR(64)   NOT NULL,
    process_instance_id   VARCHAR(64)   NOT NULL,
    user_id               VARCHAR(64)   NOT NULL,
    comment               TEXT          NULL,
    action                VARCHAR(32)   NOT NULL,
    created_at            DATETIME      DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_comment_task (tenant_id, task_id),
    KEY idx_comment_instance (tenant_id, process_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
