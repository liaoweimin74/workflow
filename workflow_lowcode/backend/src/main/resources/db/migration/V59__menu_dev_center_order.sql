-- ============================================================
-- V59: 「开发管理」内部排序微调——菜单管理挪到第一项
--
-- V58 把菜单管理放在末位（sort_order=7）。但改完表单/页面配置后通常紧接着就要去菜单管理挂入口，
-- 放在首位更顺手，其余入口依次顺延。
-- 只动 sort_order：parent_id、path、层级关系维持 V58 的结果（path 不能动，前端路由是静态注册的）。
-- 【幂等】UPDATE 按 id 定点写死目标值，可重复执行。
-- ============================================================

UPDATE sys_menu SET sort_order = 1, updated_at = NOW(3) WHERE id = 4;     -- 菜单管理      /system/menu
UPDATE sys_menu SET sort_order = 2, updated_at = NOW(3) WHERE id = 121;   -- 表单列表      /form
UPDATE sys_menu SET sort_order = 3, updated_at = NOW(3) WHERE id = 141;   -- 页面列表      /page
UPDATE sys_menu SET sort_order = 4, updated_at = NOW(3) WHERE id = 142;   -- 数据源管理    /data-source/list
UPDATE sys_menu SET sort_order = 5, updated_at = NOW(3) WHERE id = 171;   -- 逻辑流        /logic-flow
UPDATE sys_menu SET sort_order = 6, updated_at = NOW(3) WHERE id = 172;   -- 模块管理      /module
UPDATE sys_menu SET sort_order = 7, updated_at = NOW(3) WHERE id = 321;   -- 物料管理      /material
