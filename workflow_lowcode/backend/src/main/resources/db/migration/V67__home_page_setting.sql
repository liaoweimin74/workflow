-- ============================================================
-- V67: 系统首页可配置（页面列表「设为首页」）
--
-- 侧栏首页固定路由 /dashboard，由 DashboardRouterPage 按 page_key 加载已发布页面。
-- 本表按租户记录所选页面；未配置或目标失效时回退 page_key=dashboard。
-- 【幂等】DDL IF NOT EXISTS，可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS `sys_home_page_setting` (
    `tenant_id`  VARCHAR(64)  NOT NULL COMMENT '租户 ID',
    `page_key`   VARCHAR(255) NOT NULL COMMENT '首页页面 key（wf_page_def.key，须为已发布 PAGE）',
    `updated_at` DATETIME(6)  NOT NULL COMMENT '最后修改时间',
    PRIMARY KEY (`tenant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='系统首页页面配置（租户级）';
