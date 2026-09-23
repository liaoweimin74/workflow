-- ============================================================
-- V5: 流程分类表
-- 支持流程定义的分类管理，树形结构
-- ============================================================

CREATE TABLE IF NOT EXISTS wf_category (
    id          VARCHAR(64)   NOT NULL,
    tenant_id   VARCHAR(64)   NOT NULL,
    name        VARCHAR(255)  NOT NULL,
    parent_id   VARCHAR(64)   DEFAULT NULL,
    sort_order  INT           DEFAULT 0,
    created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
