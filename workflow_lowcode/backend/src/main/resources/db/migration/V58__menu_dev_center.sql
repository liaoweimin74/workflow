-- ============================================================
-- V58: 菜单归位——新增一级目录「开发管理」「样例页面」
--
-- 开发类入口此前散在三个地方（表单视图管理 / 逻辑编排 / 系统管理），找一次要翻三个目录；
-- 测试与样例页面又平铺在一级菜单里挤占入口。这里收拢成两块：
--   1) 开发管理：表单列表、页面列表、数据源管理、逻辑流、模块管理、物料管理、菜单管理（按此顺序）；
--   2) 样例页面：组件演示·数据详情与步骤条、卡片列表显示、卡片列表测试页面、
--      示例物料看板、临时-组件物料验证（「主页仪表盘」是正式首页看板，留在原处）；
--   3) 系统管理剩下纯管理项，重排为连续序号，「成员组管理」落在「岗位管理」之后；
--   4) 掏空的「表单视图管理」(160)、「逻辑编排」(170) 软删，并清理其角色授权残留。
--
-- 菜单的 path 一律不动（前端路由是静态注册的，改 path 会把历史页签/收藏打断），
-- 只改 parent_id 与 sort_order。
-- 【幂等】INSERT 用 NOT EXISTS，UPDATE 按 id 定点写死目标值，可重复执行。
-- ============================================================

-- ---------- 1. 两个一级目录 ----------
INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 180, NOW(3), NOW(3), 0, NULL, 'Tools', '开发管理', 0, NULL, '/dev', NULL, 1, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 180);

INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 190, NOW(3), NOW(3), 0, NULL, 'Notebook', '样例页面', 0, NULL, '/samples', NULL, 2, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 190);

-- ---------- 2. 开发类入口归位（顺序按需求原文）----------
UPDATE sys_menu SET parent_id = 180, sort_order = 1, updated_at = NOW(3) WHERE id = 121;  -- 表单列表      /form
UPDATE sys_menu SET parent_id = 180, sort_order = 2, updated_at = NOW(3) WHERE id = 141;  -- 页面列表      /page
UPDATE sys_menu SET parent_id = 180, sort_order = 3, updated_at = NOW(3) WHERE id = 142;  -- 数据源管理    /data-source/list
UPDATE sys_menu SET parent_id = 180, sort_order = 4, updated_at = NOW(3) WHERE id = 171;  -- 逻辑流        /logic-flow
UPDATE sys_menu SET parent_id = 180, sort_order = 5, updated_at = NOW(3) WHERE id = 172;  -- 模块管理      /module
UPDATE sys_menu SET parent_id = 180, sort_order = 6, updated_at = NOW(3) WHERE id = 321;  -- 物料管理      /material
UPDATE sys_menu SET parent_id = 180, sort_order = 7, updated_at = NOW(3) WHERE id = 4;    -- 菜单管理      /system/menu

-- ---------- 3. 测试与样例页面归位 ----------
UPDATE sys_menu SET parent_id = 190, sort_order = 1, updated_at = NOW(3) WHERE id = 9319;  -- 组件演示·数据详情与步骤条
UPDATE sys_menu SET parent_id = 190, sort_order = 2, updated_at = NOW(3) WHERE id = 9321;  -- 卡片列表显示
UPDATE sys_menu SET parent_id = 190, sort_order = 3, updated_at = NOW(3) WHERE id = 9320;  -- 卡片列表测试页面
UPDATE sys_menu SET parent_id = 190, sort_order = 4, updated_at = NOW(3) WHERE id = 9322;  -- 示例物料看板（物料 PAGE 示例）
UPDATE sys_menu SET parent_id = 190, sort_order = 5, updated_at = NOW(3) WHERE id = 9323;  -- 临时-组件物料验证

-- ---------- 4. 系统管理重排为连续序号（菜单管理已移出），成员组管理落在岗位管理之后 ----------
UPDATE sys_menu SET sort_order = 1, updated_at = NOW(3) WHERE id = 2;     -- 用户管理
UPDATE sys_menu SET sort_order = 2, updated_at = NOW(3) WHERE id = 3;     -- 角色管理
UPDATE sys_menu SET sort_order = 3, updated_at = NOW(3) WHERE id = 5;     -- 组织机构
UPDATE sys_menu SET sort_order = 4, updated_at = NOW(3) WHERE id = 6;     -- 字典管理
UPDATE sys_menu SET sort_order = 5, updated_at = NOW(3) WHERE id = 300;   -- 岗位管理
UPDATE sys_menu SET sort_order = 6, updated_at = NOW(3) WHERE id = 305;   -- 成员组管理
UPDATE sys_menu SET sort_order = 7, updated_at = NOW(3) WHERE id = 320;   -- 模型配置

-- ---------- 5. 一级目录排序（首页之后依次是开发管理、样例页面）----------
UPDATE sys_menu SET sort_order = 1, updated_at = NOW(3) WHERE id = 180;
UPDATE sys_menu SET sort_order = 2, updated_at = NOW(3) WHERE id = 190;
UPDATE sys_menu SET sort_order = 3, updated_at = NOW(3) WHERE id = 1;     -- 系统管理
UPDATE sys_menu SET sort_order = 4, updated_at = NOW(3) WHERE id = 100;   -- 流程管理
UPDATE sys_menu SET sort_order = 5, updated_at = NOW(3) WHERE id = 250;   -- 消息管理

-- ---------- 6. 掏空的两个旧目录软删 + 清理角色授权残留 ----------
UPDATE sys_menu SET is_deleted = 1, updated_at = NOW(3) WHERE id IN (160, 170) AND is_deleted = 0;
DELETE FROM sys_role_menu WHERE menu_id IN (160, 170);

-- ---------- 7. ROLE_ADMIN 授权新目录（非管理员的祖先目录由后端自动回溯补上）----------
INSERT INTO sys_role_menu (`role_id`, `menu_id`)
SELECT 1, m.menu_id FROM (SELECT 180 AS menu_id UNION SELECT 190) m
WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu r WHERE r.role_id = 1 AND r.menu_id = m.menu_id);
