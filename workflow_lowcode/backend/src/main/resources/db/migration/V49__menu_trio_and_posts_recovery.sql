-- ============================================================
-- V49: 菜单三件套 + 岗位 + 成员组 业务面恢复（对位丢失的 V47/V48，Task 130f 重演）
--
-- 【背景】第 12 次沙箱重置卷走 workflow 库与未提交的 V47/V48 迁移文件；
-- 本迁移在 09-20 基线（workflow.sql）之上补齐 Task 130f/130g 交付的业务面：
--   1. sys_post 岗位表 + 种子（PostController /api/posts + PostPage.vue 契约）
--   2. 菜单三件套：104 草稿箱 / 300 岗位管理 / 305 成员组管理 + ROLE_ADMIN 授权
--   3. ds-builtin-sys-posts 内建数据源行（取数端点 /api/v1/internal/system/posts）
--   4. member_group 业务表单种子（BizDataListPage formKey=member_group；
--      业务表 wf_biz_member_group 由发布链路 ensureTable 创建）
--
-- 【幂等】全部 NOT EXISTS 防御，可重复执行。
-- 【V48 对位】uk_node_version 唯一键由实体 @Table 声明 + JPA ddl-auto 落地，
--            不在本文件重复（实体为唯一事实源，避免双处漂移）。
-- ============================================================

-- 1) 岗位表（列型与 SysPost 实体一致；若 JPA 先建则本句空转）
CREATE TABLE IF NOT EXISTS `sys_post` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `post_code`   VARCHAR(64)  NOT NULL COMMENT '岗位编码（唯一）',
    `post_name`   VARCHAR(128) NOT NULL COMMENT '岗位名称',
    `description` VARCHAR(255) NULL COMMENT '描述',
    `sort_order`  INT          NULL COMMENT '排序',
    `status`      INT          NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用',
    `is_deleted`  INT          NOT NULL DEFAULT 0,
    `created_by`  VARCHAR(50)  NULL,
    `created_at`  DATETIME(6)  NULL,
    `updated_by`  VARCHAR(50)  NULL,
    `updated_at`  DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_post_code` (`post_code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='岗位主数据';

INSERT INTO sys_post (`post_code`, `post_name`, `description`, `sort_order`, `status`, `is_deleted`, `created_at`, `updated_at`)
SELECT 'GM', '总经理', '公司总经理岗位', 1, 1, 0, NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_post WHERE post_code = 'GM' AND is_deleted = 0);

INSERT INTO sys_post (`post_code`, `post_name`, `description`, `sort_order`, `status`, `is_deleted`, `created_at`, `updated_at`)
SELECT 'HR_MGR', '人事经理', '人事部经理岗位', 2, 1, 0, NOW(3), NOW(3) FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_post WHERE post_code = 'HR_MGR' AND is_deleted = 0);

-- 2) 菜单三件套（menu_type 1=菜单；path 与前端静态路由一一对应）
INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 104, NOW(3), NOW(3), 0, 'process/ProcessDraftBoxPage', 'Files', '草稿箱', 1, 100, '/process/drafts', 'process:drafts:list', 4, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 104);

INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 300, NOW(3), NOW(3), 0, 'system/post/PostPage', 'User', '岗位管理', 1, 1, '/system/post', 'system:post:list', 6, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 300);

INSERT INTO sys_menu (`id`, `created_at`, `updated_at`, `is_deleted`, `component`, `icon`, `menu_name`, `menu_type`, `parent_id`, `path`, `permission`, `sort_order`, `status`)
SELECT 305, NOW(3), NOW(3), 0, 'form/BizDataListPage', 'Connection', '成员组管理', 1, 1, '/system/member-group', 'system:member-group:list', 7, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE id = 305);

-- 3) ROLE_ADMIN 授权三菜单
INSERT INTO sys_role_menu (`role_id`, `menu_id`)
SELECT 1, 104 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu WHERE role_id = 1 AND menu_id = 104);
INSERT INTO sys_role_menu (`role_id`, `menu_id`)
SELECT 1, 300 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu WHERE role_id = 1 AND menu_id = 300);
INSERT INTO sys_role_menu (`role_id`, `menu_id`)
SELECT 1, 305 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM sys_role_menu WHERE role_id = 1 AND menu_id = 305);

-- 4) sys-posts 内建数据源（与 V39 家族同构：tenant_id='system' 保留域）
INSERT INTO wf_data_source (id, tenant_id, name, type, form_key, source_key, form_id, params, status, created_by, created_at, updated_at)
SELECT 'ds-builtin-sys-posts', 'system', '系统岗位', 'SYSTEM', NULL, 'sys-posts', NULL,
       '{"list":{"action":"/api/v1/internal/system/posts","method":"GET"}}',
       'ENABLED', 'system', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_data_source WHERE id = 'ds-builtin-sys-posts');

-- 5) member_group 业务表单种子（PUBLISHED；业务表由发布链路 ensureTable 创建）
INSERT INTO wf_form_def (id, tenant_id, name, `key`, `schema`, version, status, published_version, type, created_at, updated_at)
SELECT '5e1a7b0c9d2e4f3a8b6c1d0e2f3a4b5c', 'default', '成员组业务表单', 'member_group',
       '{"rule":[{"type":"input","field":"group_name","title":"成员组名称","info":"","$required":true,"_fc_drag_tag":"input","display":true},{"type":"input","field":"group_code","title":"组编码","info":"","$required":true,"_fc_drag_tag":"input","display":true},{"type":"textarea","field":"description","title":"描述","info":"","_fc_drag_tag":"textarea","display":true},{"type":"input","field":"member_names","title":"成员（姓名，逗号分隔）","info":"","_fc_drag_tag":"input","display":true}],"option":{"form":{"labelWidth":"120px"}}}',
       1, 'PUBLISHED', 1, 'BUSINESS', NOW(3), NOW(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM wf_form_def WHERE `key` = 'member_group');
