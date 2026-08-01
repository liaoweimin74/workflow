-- Workflow Platform Custom Tables (H2 compatible)

CREATE TABLE IF NOT EXISTS wf_tenant (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wf_user (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    username VARCHAR(128) NOT NULL,
    display_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(64),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_user ON wf_user(tenant_id);

CREATE TABLE IF NOT EXISTS wf_role (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    code VARCHAR(128) NOT NULL,
    description VARCHAR(512)
);

CREATE INDEX IF NOT EXISTS idx_tenant_role ON wf_role(tenant_id);
ALTER TABLE wf_role ADD CONSTRAINT uk_tenant_role_code UNIQUE(tenant_id, code);

CREATE TABLE IF NOT EXISTS wf_user_role (
    user_id VARCHAR(64) NOT NULL,
    role_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS wf_dept (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    parent_id VARCHAR(64),
    sort_order INT
);

CREATE INDEX IF NOT EXISTS idx_tenant_dept ON wf_dept(tenant_id);

CREATE TABLE IF NOT EXISTS wf_process_def (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(255),
    process_key VARCHAR(255),
    version INT DEFAULT 1,
    bpmn_xml CLOB,
    status VARCHAR(20) DEFAULT 'DRAFT',
    deploy_id VARCHAR(64),
    proc_def_id VARCHAR(64),
    description CLOB,
    created_by VARCHAR(64),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_proc ON wf_process_def(tenant_id);
ALTER TABLE wf_process_def ADD CONSTRAINT uk_tenant_key_version UNIQUE(tenant_id, process_key, version);