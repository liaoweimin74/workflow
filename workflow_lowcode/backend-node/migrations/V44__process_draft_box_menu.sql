-- ============================================================
-- 流程管理菜单：新增「草稿箱」（发起流程保存的草稿统一管理入口）
--
-- 对应能力：wf_form_data 中 process_instance_id IS NULL 且 is_snapshot=0
-- 的发起页草稿，按登录用户隔离展示（GET /api/v1/form-data/drafts）。
-- ============================================================

-- 子菜单：草稿箱（流程管理下第 3 项，待办处理顺延为第 4 项）
-- ⚠️ status/is_deleted 必须显式写（对齐 V7）：status 为 NOT NULL 无默认值，缺省落 0（=禁用），
--    getCurrentUserMenus 只返回 status==1 的菜单，漏写会导致菜单不可见。
INSERT IGNORE INTO sys_menu (id, parent_id, menu_name, menu_type, path, component, permission, icon, sort_order, status, is_deleted, created_at, updated_at) VALUES
(104, 100, '草稿箱', 1, '/process/drafts', 'process/ProcessDraftBoxPage', 'process:draft:list', 'Collection', 3, 1, 0, NOW(), NOW());

-- 待办处理从第 3 位顺延到第 4 位（幂等：仅当仍是 3 时更新）
UPDATE sys_menu SET sort_order = 4, updated_at = NOW()
WHERE id = 103 AND sort_order = 3;

-- 给 ROLE_ADMIN 赋值新菜单权限（管理员走免过滤分支，此处保持与其他菜单一致的授权记录）
INSERT INTO sys_role_menu (role_id, menu_id)
SELECT r.id, m.id FROM sys_role r, sys_menu m
WHERE r.role_code = 'ROLE_ADMIN'
  AND m.id IN (104)
  AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);
