-- ============================================================
-- V53: 逻辑编排（LogicFlow）菜单
--
-- 「逻辑编排」目录（menuType 0）+ 「逻辑流」菜单（menuType 1,
-- permission logicflow:list, path /logic-flow）。
-- 排序：目录 sort_order=4，紧随 流程管理(100, sort 2) / 表单视图管理(160, sort 3)
-- 之后、消息管理(250, sort 5) 之前。
-- 组件路径 logicflow/LogicFlowListPage 与前端 /logic-flow 路由对应（Task 2-b 落地）。
--
-- 【幂等】全部 NOT EXISTS 防御，可重复执行。
-- 【注意】status 显式 1（启用）、is_deleted 0，勿依赖列默认值。
-- ============================================================

-- 1) 顶级目录：逻辑编排
INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 170, NOW(3), NOW(3), 0, NULL, 'Share', '逻辑编排', 0, NULL, '/logic', NULL, 4, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 170);

-- 2) 子菜单：逻辑流（列表页）
INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 171, NOW(3), NOW(3), 0, 'logicflow/LogicFlowListPage', 'Cpu', '逻辑流', 1, 170, '/logic-flow', 'logicflow:list', 1, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 171);

-- 3) ROLE_ADMIN 授权
INSERT INTO sys_role_menu (`role_id`, `menu_id`)
SELECT 1, m.menu_id FROM (SELECT 170 AS menu_id UNION SELECT 171) m
WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu r WHERE r.role_id = 1 AND r.menu_id = m.menu_id);
