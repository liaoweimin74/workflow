-- ============================================================
-- V4: 流程节点配置表
-- 存储 BPMN 节点的自定义业务属性（审批人、表单权限、时限等）
-- ============================================================

CREATE TABLE IF NOT EXISTS wf_node_config (
    id              VARCHAR(64)   NOT NULL,
    tenant_id       VARCHAR(64)   NOT NULL,
    process_def_id  VARCHAR(64)   NOT NULL,
    node_id         VARCHAR(255)  NOT NULL,
    node_type       VARCHAR(64)   NOT NULL,
    config_json     JSON          NOT NULL,
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_node (tenant_id, process_def_id, node_id),
    KEY idx_def (tenant_id, process_def_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
