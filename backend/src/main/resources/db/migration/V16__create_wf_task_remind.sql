-- ============================================================
-- V16: 任务催办记录表
-- 存储催办记录，配合频率限制逻辑
-- ============================================================

CREATE TABLE IF NOT EXISTS wf_task_remind (
    id                    VARCHAR(64)   NOT NULL,
    tenant_id             VARCHAR(64)   NOT NULL,
    task_id               VARCHAR(64)   NOT NULL,
    process_instance_id   VARCHAR(64)   NOT NULL,
    remind_from           VARCHAR(64)   NOT NULL,
    remind_to             VARCHAR(64)   NOT NULL,
    remind_time           DATETIME      DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_remind_task (tenant_id, task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
