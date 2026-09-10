-- ============================================================
-- V14: 任务转办审计表
-- 记录所有转办操作（区别于 delegate 委派）
-- ============================================================

CREATE TABLE IF NOT EXISTS wf_task_transfer (
    id                    VARCHAR(64)   NOT NULL,
    tenant_id             VARCHAR(64)   NOT NULL,
    task_id               VARCHAR(64)   NOT NULL,
    process_instance_id   VARCHAR(64)   NOT NULL,
    from_user             VARCHAR(64)   NOT NULL,
    to_user               VARCHAR(64)   NOT NULL,
    reason                VARCHAR(500)  NULL,
    created_at            DATETIME      DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_transfer_task (tenant_id, task_id),
    KEY idx_transfer_instance (tenant_id, process_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
