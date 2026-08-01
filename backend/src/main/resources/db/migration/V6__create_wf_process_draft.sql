-- ============================================================
-- V6: 流程定义草稿表
-- 存储设计器中未部署的 BPMN XML 草稿
-- 部署后关联 Flowable 的 process_definition_id
-- ============================================================

CREATE TABLE IF NOT EXISTS wf_process_draft (
    id                      VARCHAR(64)   NOT NULL,
    tenant_id               VARCHAR(64)   NOT NULL,
    name                    VARCHAR(255)  NOT NULL,
    `key`                   VARCHAR(255)  NOT NULL,
    category_id             VARCHAR(64)   DEFAULT NULL,
    bpmn_xml                LONGTEXT      NOT NULL,
    status                  VARCHAR(32)   NOT NULL DEFAULT 'DRAFT',
    process_definition_id   VARCHAR(64)   DEFAULT NULL,
    deploy_id               VARCHAR(64)   DEFAULT NULL,
    version                 INT           NOT NULL DEFAULT 1,
    created_by              VARCHAR(50)   DEFAULT NULL,
    created_at              DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_wf_draft_key (tenant_id, `key`),
    KEY idx_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
