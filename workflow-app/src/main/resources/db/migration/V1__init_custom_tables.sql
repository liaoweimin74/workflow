-- Workflow Platform Custom Tables

CREATE TABLE IF NOT EXISTS wf_tenant (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at DATETIME
);

CREATE TABLE IF NOT EXISTS wf_user (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    username VARCHAR(128) NOT NULL,
    display_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(64),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at DATETIME,
    INDEX idx_tenant_user (tenant_id)
);

CREATE TABLE IF NOT EXISTS wf_role (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    code VARCHAR(128) NOT NULL,
    description VARCHAR(512),
    INDEX idx_tenant_role (tenant_id),
    UNIQUE KEY uk_tenant_role_code (tenant_id, code)
);

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
    sort_order INT,
    INDEX idx_tenant_dept (tenant_id)
);

CREATE TABLE IF NOT EXISTS wf_process_def (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(255),
    process_key VARCHAR(255),
    version INT DEFAULT 1,
    bpmn_xml LONGTEXT,
    status VARCHAR(20) DEFAULT 'DRAFT',
    deploy_id VARCHAR(64),
    proc_def_id VARCHAR(64),
    description TEXT,
    created_by VARCHAR(64),
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_tenant_proc (tenant_id),
    UNIQUE KEY uk_tenant_key_version (tenant_id, process_key, version)
);