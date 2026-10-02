-- ============================================================
-- V47: 岗位管理 / 成员组管理 / 草稿箱 三菜单落地（对位 Nest V42-V46）
--
-- 背景：V42-V46 的功能（岗位/成员组/草稿箱/岗位数据源/成员组业务表单）在
-- Nest 时代开发后随 MariaDB 卷回退从 workflow_v6 与 workflow 双库整体消失
-- （v6 Flyway 水位停在 V41），且从未进入 v6→workflow 迁移链路。本迁移在
-- Java 引擎侧对位落地，菜单三件套恢复可见：
--   1. sys_post 岗位表（V43 对位；sys_user.post_id 由 Hibernate ddl-auto
--      按实体字段自动补列，不在此处理）
--   2. wf_biz_member_group 物理表（V46 对位；成员组重构为业务表单后的
--      数据载体，列结构 = DdlBuilder.buildCreateTable 输出。PUBLISHED 种子
--      表单不会触发 Java 侧 ensureTable，必须在此显式建表——Task 130d 教训）
--   3. 菜单 seed（V43/V44 对位，V46 语义）：104 草稿箱 / 300 岗位管理 /
--      305 成员组管理（业务数据列表页形态）+ 301-304 岗位按钮权限 +
--      ROLE_ADMIN 授权；103 待办处理顺延（幂等）
--   4. 数据源 ds-builtin-sys-posts（V45 对位，tenant_id='system' 保留域）
--   5. wf_form_def 种子 member_group（V46 对位，BUSINESS/PUBLISHED，
--      成员/规则字段用 dataPicker 引用内置源）
--
-- 不含：V42 的 wf_process_draft.description（由 Hibernate 实体字段自动建列）；
--       V43 的 sys_member_group 三张专用表（V46 重构后已退场，不重建）；
--       sys_organization.leader_id（Java 选人策略未引用，延后）。
-- 幂等：全部 CREATE IF NOT EXISTS / INSERT ... NOT EXISTS，可安全重跑。
-- ============================================================

-- ---------- 1. 岗位表（V43 对位） ----------
CREATE TABLE IF NOT EXISTS `sys_post` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `post_code`   VARCHAR(64)  NOT NULL COMMENT '岗位编码',
    `post_name`   VARCHAR(64)  NOT NULL COMMENT '岗位名称',
    `description` VARCHAR(255) NULL     COMMENT '岗位说明',
    `sort_order`  INT          NULL     COMMENT '排序',
    `status`      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 启用 0 停用',
    `is_deleted`  TINYINT      NOT NULL DEFAULT 0,
    `created_at`  DATETIME(6)  NULL,
    `created_by`  VARCHAR(64)  NULL,
    `updated_at`  DATETIME(6)  NULL,
    `updated_by`  VARCHAR(64)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_sys_post_code` (`post_code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '岗位';

-- ---------- 2. 成员组业务表单物理表（V46 对位） ----------
CREATE TABLE IF NOT EXISTS wf_biz_member_group (
    id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    group_name VARCHAR(255) NOT NULL,
    description TEXT,
    members TEXT,
    members_text TEXT,
    post_rules TEXT,
    post_rules_text TEXT,
    org_rules TEXT,
    org_rules_text TEXT,
    version INT NOT NULL DEFAULT 1,
    created_by VARCHAR(50),
    created_at DATETIME(6),
    updated_at DATETIME(6),
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '成员组（业务表单 member_group 数据）';

-- ---------- 3. 菜单 seed（status/is_deleted 显式写：NOT NULL 无默认） ----------
-- 草稿箱（V44 对位：流程管理下第 3 项；GET /api/v1/form-data/drafts 数据面）
INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT 104, 100, '草稿箱', 1, '/process/drafts', 'process/ProcessDraftBoxPage', 'process:draft:list', 'Collection', 3, 1, 0, NOW(6), NOW(6)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 104);

-- 待办处理从第 3 位顺延到第 4 位（幂等：仅当仍是 3 时更新）
UPDATE sys_menu SET sort_order = 4, updated_at = NOW(6)
WHERE id = 103 AND sort_order = 3;

-- 岗位管理 + 按钮权限（V43 对位）
INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT 300, 1, '岗位管理', 1, '/system/post', 'system/post/index', 'system:post:list', 'Postcard', 6, 1, 0, NOW(6), NOW(6)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 300);

INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, permission, sort_order, status, is_deleted, created_at, updated_at)
SELECT t.id, t.pid, t.nm, 2, t.perm, t.so, 1, 0, NOW(6), NOW(6)
FROM (
    SELECT 301 AS id, 300 AS pid, '岗位查询' AS nm, 'system:post:query'   AS perm, 1 AS so UNION ALL
    SELECT 302, 300, '岗位新增', 'system:post:create', 2 UNION ALL
    SELECT 303, 300, '岗位修改', 'system:post:update', 3 UNION ALL
    SELECT 304, 300, '岗位删除', 'system:post:delete', 4
) t
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = t.id);

-- 成员组管理（V46 语义：业务数据列表页形态，path 不变）
INSERT INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at)
SELECT 305, 1, '成员组管理', 1, '/system/member-group', 'form/biz-data/index', 'system:member-group:list', 'UserFilled', 7, 1, 0, NOW(6), NOW(6)
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 305);

-- 授权 ROLE_ADMIN（幂等，对齐 V3/V43 写法）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (104, 300, 301, 302, 303, 304, 305)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- ---------- 4. 岗位内置数据源（V45 对位；tenant 'system' 保留域） ----------
INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-sys-posts', 'system', '系统岗位', 'SYSTEM', NULL, 'sys-posts', NULL,
       '{"list":{"action":"/api/v1/internal/system/posts","method":"GET"}}',
       'ENABLED', 'system', NOW(6), NOW(6)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-sys-posts');

-- ---------- 5. 成员组业务表单种子（V46 对位） ----------
INSERT INTO wf_form_def (id, tenant_id, name, `key`, `schema`, version, status, published_version, type, column_config, process_key, created_by, created_at, updated_at)
SELECT 'seed_member_group_form', 'default', '成员组', 'member_group',
       '{"rule":[{"type":"input","field":"group_name","title":"成员组名称","value":"","info":"","effect":{"fetch":""},"$required":true,"validate":[{"required":true,"message":"请输入成员组名称","trigger":"blur"}],"_fc_drag_tag":"input","display":true,"hidden":false},{"type":"input","field":"description","title":"成员组说明","value":"","props":{"type":"textarea","rows":2,"maxlength":255,"placeholder":"请输入成员组说明"},"_fc_drag_tag":"input","display":true,"hidden":false},{"type":"dataPicker","field":"members","title":"组成员","value":"","info":"从系统用户中引用，弹窗多选","props":{"dataSourceId":"ds-builtin-user-tree","displayField":"nickname","columns":["username","nickname","orgName"],"searchColumns":["username","nickname"],"placeholder":"点击选择组成员（可多选）"},"_fc_drag_tag":"dataPicker","display":true,"hidden":false},{"type":"dataPicker","field":"post_rules","title":"自动规则·按岗位","value":"","info":"命中岗位的用户自动归属本组","props":{"dataSourceId":"ds-builtin-sys-posts","displayField":"postName","columns":["postName","postCode","description"],"searchColumns":["postName","postCode"],"placeholder":"点击选择岗位（可多选）"},"_fc_drag_tag":"dataPicker","display":true,"hidden":false},{"type":"dataPicker","field":"org_rules","title":"自动规则·按组织","value":"","info":"命中组织机构的用户自动归属本组","props":{"dataSourceId":"ds-builtin-dept-tree","displayField":"label","columns":["label","code"],"searchColumns":["label","code"],"placeholder":"点击选择组织机构（可多选）"},"_fc_drag_tag":"dataPicker","display":true,"hidden":false}],"option":{"form":{"inline":false,"labelPosition":"right","labelWidth":"120px","size":"default"}},"dataSources":[{"id":"ds-builtin-user-tree","refId":"ds-builtin-user-tree","name":"系统用户"},{"id":"ds-builtin-sys-posts","refId":"ds-builtin-sys-posts","name":"系统岗位"},{"id":"ds-builtin-dept-tree","refId":"ds-builtin-dept-tree","name":"组织机构"}]}',
       1, 'PUBLISHED', 1, 'BUSINESS',
       '[{"key":"group_name","label":"成员组名称","columnType":"VARCHAR","length":255,"scale":null,"required":true,"unique":false,"indexed":false,"componentType":"input"},{"key":"description","label":"成员组说明","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"componentType":"textarea"},{"key":"members","label":"组成员","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"componentType":"dataPicker","pickerConfig":"{\\\"dataSourceId\\\":\\\"ds-builtin-user-tree\\\",\\\"displayField\\\":\\\"nickname\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}"},{"key":"members_text","label":"组成员（显示）","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"hidden":true,"componentType":"dataPickerText"},{"key":"post_rules","label":"自动规则·按岗位","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"componentType":"dataPicker","pickerConfig":"{\\\"dataSourceId\\\":\\\"ds-builtin-sys-posts\\\",\\\"displayField\\\":\\\"postName\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}"},{"key":"post_rules_text","label":"自动规则·按岗位（显示）","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"hidden":true,"componentType":"dataPickerText"},{"key":"org_rules","label":"自动规则·按组织","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"componentType":"dataPicker","pickerConfig":"{\\\"dataSourceId\\\":\\\"ds-builtin-dept-tree\\\",\\\"displayField\\\":\\\"label\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}"},{"key":"org_rules_text","label":"自动规则·按组织（显示）","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"hidden":true,"componentType":"dataPickerText"}]',
       NULL, 'system', NOW(6), NOW(6)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_form_def WHERE tenant_id = 'default' AND `key` = 'member_group');
