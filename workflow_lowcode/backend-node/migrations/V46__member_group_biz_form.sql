-- V46: 成员组管理重构为业务表单（成员/自动规则 = 数据引用字段）
--
-- 背景：成员组管理原为专用页面（sys_member_group + /api/member-groups）。
-- 用户决策：成员组管理对应一个业务表单，其中「组成员」「自动规则」用数据引用
-- （dataPicker）字段录入，复用业务表单全套能力（列表/新增/编辑/删除/搜索）。
--
-- 本迁移：
--   1. 预置 BUSINESS 表单定义 member_group（PUBLISHED，schema + column_config）；
--   2. 建物理表 wf_biz_member_group（列结构与 DdlBuilder.buildCreateTable 输出一致：
--      dataPicker 列为 TEXT（值 = JSON id 数组字符串）+ 隐藏冗余文本列 <key>_text）；
--   3. 存量成员组数据搬迁（V43 的 3 个组；成员/规则明细当时为空，组数据平移）；
--   4. 菜单：成员组管理 component 元数据对齐业务数据列表页；专用页按钮权限
--      （system:member-group:*，V43 id 306-311）随专用页面退场删除。
--
-- 语义映射（供引擎后续按组展开成员）：
--   members    = 用户 id JSON 数组（等价旧 sys_member_group_member）
--   post_rules = 岗位 id JSON 数组（等价旧 sys_member_group_rule.rule_type='position'）
--   org_rules  = 组织 id JSON 数组（等价旧 sys_member_group_rule.rule_type='org'）
--
-- 注意：schema 里 dataPicker 的 props.dataSourceId 同时是 schema.dataSources 的绑定 id
-- （id=refId），DataPicker 通过 activeDsBindings 解析 refId 取数；column_config 的
-- pickerConfig.dataSourceId 供后端 resolvePickerText 解析显示文本。

-- ---------- 1. 预置业务表单定义 ----------
INSERT INTO wf_form_def (id, tenant_id, name, `key`, `schema`, version, status, published_version, type, column_config, process_key, created_by, created_at, updated_at)
SELECT 'seed_member_group_form', 'default', '成员组', 'member_group',
       '{"rule":[{"type":"input","field":"group_name","title":"成员组名称","value":"","info":"","effect":{"fetch":""},"$required":true,"validate":[{"required":true,"message":"请输入成员组名称","trigger":"blur"}],"_fc_drag_tag":"input","display":true,"hidden":false},{"type":"input","field":"description","title":"成员组说明","value":"","props":{"type":"textarea","rows":2,"maxlength":255,"placeholder":"请输入成员组说明"},"_fc_drag_tag":"input","display":true,"hidden":false},{"type":"dataPicker","field":"members","title":"组成员","value":"","info":"从系统用户中引用，弹窗多选","props":{"dataSourceId":"ds-builtin-user-tree","displayField":"nickname","columns":["username","nickname","orgName"],"searchColumns":["username","nickname"],"placeholder":"点击选择组成员（可多选）"},"_fc_drag_tag":"dataPicker","display":true,"hidden":false},{"type":"dataPicker","field":"post_rules","title":"自动规则·按岗位","value":"","info":"命中岗位的用户自动归属本组","props":{"dataSourceId":"ds-builtin-sys-posts","displayField":"postName","columns":["postName","postCode","description"],"searchColumns":["postName","postCode"],"placeholder":"点击选择岗位（可多选）"},"_fc_drag_tag":"dataPicker","display":true,"hidden":false},{"type":"dataPicker","field":"org_rules","title":"自动规则·按组织","value":"","info":"命中组织机构的用户自动归属本组","props":{"dataSourceId":"ds-builtin-dept-tree","displayField":"label","columns":["label","code"],"searchColumns":["label","code"],"placeholder":"点击选择组织机构（可多选）"},"_fc_drag_tag":"dataPicker","display":true,"hidden":false}],"option":{"form":{"inline":false,"labelPosition":"right","labelWidth":"120px","size":"default"}},"dataSources":[{"id":"ds-builtin-user-tree","refId":"ds-builtin-user-tree","name":"系统用户"},{"id":"ds-builtin-sys-posts","refId":"ds-builtin-sys-posts","name":"系统岗位"},{"id":"ds-builtin-dept-tree","refId":"ds-builtin-dept-tree","name":"组织机构"}]}',
       1, 'PUBLISHED', 1, 'BUSINESS',
       '[{"key":"group_name","label":"成员组名称","columnType":"VARCHAR","length":255,"scale":null,"required":true,"unique":false,"indexed":false,"componentType":"input"},{"key":"description","label":"成员组说明","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"componentType":"textarea"},{"key":"members","label":"组成员","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"componentType":"dataPicker","pickerConfig":"{\\\"dataSourceId\\\":\\\"ds-builtin-user-tree\\\",\\\"displayField\\\":\\\"nickname\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}"},{"key":"members_text","label":"组成员（显示）","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"hidden":true,"componentType":"dataPickerText"},{"key":"post_rules","label":"自动规则·按岗位","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"componentType":"dataPicker","pickerConfig":"{\\\"dataSourceId\\\":\\\"ds-builtin-sys-posts\\\",\\\"displayField\\\":\\\"postName\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}"},{"key":"post_rules_text","label":"自动规则·按岗位（显示）","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"hidden":true,"componentType":"dataPickerText"},{"key":"org_rules","label":"自动规则·按组织","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"componentType":"dataPicker","pickerConfig":"{\\\"dataSourceId\\\":\\\"ds-builtin-dept-tree\\\",\\\"displayField\\\":\\\"label\\\",\\\"pickerType\\\":\\\"dataPicker\\\"}"},{"key":"org_rules_text","label":"自动规则·按组织（显示）","columnType":"TEXT","length":null,"scale":null,"required":false,"unique":false,"indexed":false,"hidden":true,"componentType":"dataPickerText"}]',
       NULL, 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_form_def WHERE tenant_id = 'default' AND `key` = 'member_group');

-- ---------- 2. 物理表（列结构 = DdlBuilder.buildCreateTable('member_group', columns) 输出） ----------
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
    created_at DATETIME,
    updated_at DATETIME,
    PRIMARY KEY (id)
);

-- ---------- 3. 存量成员组数据搬迁（V43 专用表 → 业务表单；幂等） ----------
INSERT INTO wf_biz_member_group (id, tenant_id, group_name, description, version, created_by, created_at, updated_at)
SELECT CONCAT('legacy_', g.id), 'default', g.group_name, g.description, 1,
       COALESCE(g.created_by, 'system'), COALESCE(g.created_at, NOW()), NOW()
FROM sys_member_group g
WHERE g.is_deleted = 0
  AND NOT EXISTS (SELECT 1 FROM wf_biz_member_group b WHERE b.id = CONCAT('legacy_', g.id));

-- ---------- 4. 菜单：成员组管理对齐业务数据列表页；专用页按钮权限退场 ----------
-- 菜单 path 不变（/system/member-group，前端路由已复用 BizDataListPage + meta.formKey）
UPDATE sys_menu SET component = 'form/biz-data/index', updated_at = NOW()
WHERE id = 305;

-- V43 的按钮权限（system:member-group:query/create/update/delete/member/rule）不再被页面引用
DELETE FROM sys_role_menu WHERE menu_id IN (306, 307, 308, 309, 310, 311);
DELETE FROM sys_menu WHERE id IN (306, 307, 308, 309, 310, 311);
