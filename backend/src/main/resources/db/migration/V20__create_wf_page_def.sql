-- ============================================================
-- V20: 页面定义（视图/自定义页面）+ 全局数据源
-- 视图/自定义页面：发布不建表，绑定已发布业务表单
-- ============================================================

-- ============================================================
-- 页面定义：视图/自定义页面（发布不建表，绑定已发布业务表单）
-- ============================================================
CREATE TABLE IF NOT EXISTS wf_page_def (
    id               VARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id        VARCHAR(64)  NOT NULL,
    name             VARCHAR(255) NOT NULL COMMENT '页面名称',
    `key`            VARCHAR(255) NOT NULL COMMENT '页面标识（租户内唯一）',
    type             VARCHAR(32)  NOT NULL DEFAULT 'VIEW' COMMENT 'VIEW=视图 / PAGE=自定义页面',
    form_key         VARCHAR(255) COMMENT '绑定的业务表单 key → wf_biz_<form_key>（VIEW 用）',
    `schema`         LONGTEXT COMMENT 'VIEW=视图配置JSON / PAGE=form-create {rule,option,dataSources,actions}',
    version          INT NOT NULL DEFAULT 1,
    status           VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
    published_version INT,
    created_by       VARCHAR(50),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_page_def_tenant_key_version (tenant_id, `key`, version),
    INDEX idx_page_def_tenant_form (tenant_id, form_key),
    INDEX idx_page_def_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='页面定义（视图/自定义页面）';

-- ============================================================
-- 全局数据源：FORM（业务表单）/ SYSTEM（系统结构）/ API（第三方）
-- ============================================================
CREATE TABLE IF NOT EXISTS wf_data_source (
    id               VARCHAR(64)  NOT NULL PRIMARY KEY,
    tenant_id        VARCHAR(64)  NOT NULL,
    name             VARCHAR(255) NOT NULL COMMENT '数据源名称（租户内唯一，设计器下拉显示）',
    `type`           VARCHAR(32)  NOT NULL COMMENT 'FORM / SYSTEM / API',
    form_key         VARCHAR(255) COMMENT 'type=FORM：绑定的业务表单 key → wf_biz_<form_key>',
    source_key       VARCHAR(255) COMMENT 'type=SYSTEM/API：注册表 key（dept-tree / external-stock 等）',
    `params`         LONGTEXT COMMENT 'type=API：静态参数 JSON',
    status           VARCHAR(32)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / ENABLED / DISABLED',
    created_by       VARCHAR(50),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_ds_tenant_name (tenant_id, name),
    INDEX idx_ds_tenant_type (tenant_id, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='全局数据源（业务表单/系统结构/第三方API）';

-- 父菜单：查询界面管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(140, NULL, '查询界面管理', 0, '/page', NULL, NULL, 'Grid', 4, 1, 0, NOW(), NOW());

-- 子菜单：页面列表 + 数据源管理
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(141, 140, '页面列表', 1, '/page', 'page/PageListPage', 'page:list', 'Document', 1, 1, 0, NOW(), NOW()),
(142, 140, '数据源管理', 1, '/data-source/list', 'dataSource/DataSourceListPage', 'data-source:list', 'Connection', 2, 1, 0, NOW(), NOW());

-- 按钮权限
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at) VALUES
(150, 141, '页面创建', 2, 'page:create', 1, 1, 0, NOW(), NOW()),
(151, 141, '页面编辑', 2, 'page:edit', 2, 1, 0, NOW(), NOW()),
(152, 141, '页面发布', 2, 'page:publish', 3, 1, 0, NOW(), NOW()),
(153, 141, '页面删除', 2, 'page:delete', 4, 1, 0, NOW(), NOW()),
(154, 142, '数据源管理', 2, 'data-source:manage', 1, 1, 0, NOW(), NOW());

-- 给 ROLE_ADMIN 赋值新菜单权限
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (140, 141, 142, 150, 151, 152, 153, 154)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);