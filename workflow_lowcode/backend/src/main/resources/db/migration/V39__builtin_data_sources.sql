-- V39: 系统内建数据源预置 —— 8 条 SYSTEM 数据源落库（初始化从启动播种代码迁入迁移脚本）。
--
-- 【预置范围】系统管理（系统菜单 / 系统用户 / 组织机构 / 系统角色 / 系统字典）
-- 与流程管理（流程定义 / 流程实例 / 待办任务），全部 type=SYSTEM、tenant_id='system'
-- （保留域；跨租户可见由既有列表 SQL 的 `OR type='SYSTEM'` 条件保证）。
--
-- 【幂等语义】本文件被 NestJS migrator（workflow_v6 库）与 Java Flyway（workflow 库）
-- 各自执行一次；两侧 SQL 逐字节一致（checksum 相同，共用 flyway_schema_history 语义）。
--   1. 先清理 tenant_id='system' 保留域内**非规范**旧行 —— 历史 Java
--      SystemDataSourceInitializer 播种过 id=随机UUID 的 dept-tree/user-tree
--      （名称为「部门树数据源/用户树数据源」），与固定 id `ds-builtin-<sourceKey>`
--      语义重复（且 uk_ds_tenant_source_key 唯一索引下互斥），统一收敛；
--   2. 再按固定 id `ds-builtin-<sourceKey>` 缺则插入（NOT EXISTS 防御：
--      任何一侧已预置过 / 历史遗留行均跳过，不覆盖既有数据）。
--
-- 【params 契约】与 data-source-write.service.ts `generateParams('SYSTEM',...)` 产出
-- 逐字节一致：紧凑 JSON、键序 list→action→method（Java ObjectNode.toString() 同构）。
-- 名称与 system-source-catalog.ts（BUILT_IN_SYSTEM_SOURCES）/ Java BuiltInSystemSources
-- 常量一致，两端共享本文件作为预置数据的唯一事实源。

DELETE FROM wf_data_source
WHERE tenant_id = 'system'
  AND source_key IN ('dept-tree','user-tree','sys-menus','sys-roles','sys-dicts',
                     'process-definitions','process-instances','todo-tasks')
  AND id <> CONCAT('ds-builtin-', source_key);

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-dept-tree', 'system', '组织机构', 'SYSTEM', NULL, 'dept-tree', NULL,
       '{"list":{"action":"/api/v1/internal/system/dept-tree","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-dept-tree');

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-user-tree', 'system', '系统用户', 'SYSTEM', NULL, 'user-tree', NULL,
       '{"list":{"action":"/api/v1/internal/system/users","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-user-tree');

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-sys-menus', 'system', '系统菜单', 'SYSTEM', NULL, 'sys-menus', NULL,
       '{"list":{"action":"/api/v1/internal/system/menus","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-sys-menus');

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-sys-roles', 'system', '系统角色', 'SYSTEM', NULL, 'sys-roles', NULL,
       '{"list":{"action":"/api/v1/internal/system/roles","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-sys-roles');

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-sys-dicts', 'system', '系统字典', 'SYSTEM', NULL, 'sys-dicts', NULL,
       '{"list":{"action":"/api/v1/internal/system/dicts","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-sys-dicts');

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-process-definitions', 'system', '流程定义', 'SYSTEM', NULL, 'process-definitions', NULL,
       '{"list":{"action":"/api/v1/internal/system/process/definitions","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-process-definitions');

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-process-instances', 'system', '流程实例', 'SYSTEM', NULL, 'process-instances', NULL,
       '{"list":{"action":"/api/v1/internal/system/process/instances","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-process-instances');

INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-todo-tasks', 'system', '待办任务', 'SYSTEM', NULL, 'todo-tasks', NULL,
       '{"list":{"action":"/api/v1/internal/system/process/todo-tasks","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-todo-tasks');
