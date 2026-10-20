-- ============================================================
-- V60: 数据范围（DataScope，P0.3）
--
-- 主体 × 数据源 × 动作 的行级过滤配置。此前取数链路只有租户隔离（SQL 侧强制 tenant_id），
-- 同一租户内任意登录用户可读/写任意数据源的全部行；本表提供按主体收紧的能力。
-- 与 wf_data_source.params 分离：params 会被数据源编辑表单整包回写，
-- 权限配置混在里面会被无关保存静默抹掉。
-- 主体轴含 MEMBER_GROUP：客户/商户分组（P0.4）要用，先于其落地定好，避免二次改表。
-- 【幂等】DDL IF NOT EXISTS，可重复执行。
-- ============================================================

CREATE TABLE IF NOT EXISTS `wf_data_scope` (
    `id`             BIGINT      NOT NULL AUTO_INCREMENT,
    `tenant_id`      VARCHAR(64) NOT NULL COMMENT '租户（与 wf_data_source.tenant_id 同域）',
    `data_source_id` VARCHAR(64) NOT NULL COMMENT '数据源 id（wf_data_source.id）',
    `scope_action`   VARCHAR(10) NOT NULL COMMENT 'READ 读（列表/聚合/单条） / WRITE 写（修改/删除）',
    `subject_type`   VARCHAR(20) NOT NULL COMMENT 'ROLE 角色 / USER 用户 / ORG 组织 / MEMBER_GROUP 成员组',
    `subject_key`    VARCHAR(64) NOT NULL COMMENT '主体标识：角色 code / 用户 id / 组织 id / 成员组 id',
    `scope_type`     VARCHAR(20) NOT NULL COMMENT 'ALL 全部 / SELF 仅本人(created_by) / CUSTOM 自定义列等值',
    `scope_column`   VARCHAR(100) NULL COMMENT 'CUSTOM 的过滤列（须为数据源声明列）',
    `scope_value`    VARCHAR(200) NULL COMMENT 'CUSTOM 的值模板：{userId} / {username} / {orgId} 或字面量',
    `is_deleted`     INT         NOT NULL DEFAULT 0,
    `created_by`     VARCHAR(50) NULL,
    `created_at`     DATETIME(6) NULL,
    `updated_by`     VARCHAR(50) NULL,
    `updated_at`     DATETIME(6) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_data_scope_subject` (`tenant_id`, `data_source_id`, `scope_action`, `subject_type`, `subject_key`),
    KEY `idx_data_scope_source` (`tenant_id`, `data_source_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='数据范围配置（主体 × 数据源 × 动作）';
