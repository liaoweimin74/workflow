-- ============================================================
-- 表单设计器：表单定义 + 表单实例数据
-- ============================================================

-- 表单定义表
CREATE TABLE IF NOT EXISTS wf_form_def (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `schema` LONGTEXT,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    published_version INT,
    created_by VARCHAR(50),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_form_def_tenant_key_version (tenant_id, `key`, version),
    INDEX idx_form_def_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单定义';

-- 表单实例数据表
CREATE TABLE IF NOT EXISTS wf_form_data (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL,
    form_def_id VARCHAR(64) NOT NULL,
    form_version INT NOT NULL,
    process_instance_id VARCHAR(64),
    task_id VARCHAR(64),
    data_json LONGTEXT,
    created_by VARCHAR(50),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_form_data_def_proc (form_def_id, process_instance_id),
    INDEX idx_form_data_tenant_proc (tenant_id, process_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单实例数据';

-- ============================================================
-- 表单管理菜单
-- ============================================================

-- 父菜单：表单管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(120, NULL, '表单管理', 0, '/form', NULL, NULL, 'Tickets', 3, 1, 0, NOW(), NOW());

-- 子菜单
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(121, 120, '表单列表', 1, '/form', 'form/FormListPage', 'form:list', 'Document', 1, 1, 0, NOW(), NOW());

-- 表单列表按钮权限
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(130, 121, '表单创建', 2, 'form:create', 1, 1, 0, NOW(), NOW()),
(131, 121, '表单编辑', 2, 'form:edit', 2, 1, 0, NOW(), NOW()),
(132, 121, '表单发布', 2, 'form:publish', 3, 1, 0, NOW(), NOW()),
(133, 121, '表单删除', 2, 'form:delete', 4, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (120, 121, 130, 131, 132, 133)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);
