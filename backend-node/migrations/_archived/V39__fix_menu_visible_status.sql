-- ============================================================
-- V39: 修复菜单可见状态（系统管理/流程管理子树不可见）
--
-- 根因：V2__init_data.sql（菜单 ids 1-27）与 V7__add_process_management_menus.sql
-- （ids 100-112）插入 sys_menu 时未显式指定 status / is_deleted 列。
-- sys_menu.status 为 NOT NULL 且无默认值，非严格 SQL 模式下被隐式置 0；
-- 而菜单树接口按「is_deleted == 0 且 status == 1」逐级过滤（auth.service.filterAllowed，
-- 对齐 Java 侧 getCurrentUserMenus），status=0 即整棵子树在导航中不可见。
--
-- 修复口径：与 Java 基准库 backend/src/main/resources/db/migration/workflow.sql 对齐，
-- 全部非删除菜单 status=1（正常可见）。已删除菜单（120 表单管理 / 140 查询界面管理，
-- is_deleted=1）不在本修复范围。
-- ============================================================

UPDATE sys_menu
SET status = 1, updated_at = NOW()
WHERE is_deleted = 0
  AND status <> 1
  AND id IN (
    1, 2, 3, 4, 5, 6, 7,                                    -- 系统管理目录 + 5 子菜单 + 首页
    8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,           -- 用户/角色按钮权限
    20, 21, 22, 23, 24, 25, 26, 27,                         -- 机构/字典按钮权限
    100, 101, 102, 103, 110, 111, 112                       -- 流程管理子树 + 按钮权限
  );
