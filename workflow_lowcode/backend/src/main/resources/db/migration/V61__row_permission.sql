-- ============================================================
-- V61: 行权限对象（DataScope v2 第一步：归一化）
--
-- v1 把「主体 × 数据源 × 动作」压在一张规则表里，一条规则只能挂一个数据源、
-- 一个主体、一条等值条件；多主体命中时只能挑「最宽」的一条，而 CUSTOM 与 SELF
-- 谁更宽本来就不可比。v2 拆成三层：
--   权限对象（一组 AND 条件）— 关联 1..N 个数据源 — 授予 1..N 个主体（分读写轴）
-- 查询时取该用户命中的全部对象之并集：对象间 OR，对象内 AND。
--
-- v1 的 ALL 在并集语义下等于「不配规则」，不迁移；CUSTOM/SELF 天然对应一条单条件对象。
-- v1 表仅在本地开发期存在且无数据，随本迁移删除。
-- 【幂等】DDL IF NOT EXISTS。
-- ============================================================

CREATE TABLE IF NOT EXISTS `wf_row_permission` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`       VARCHAR(64)  NOT NULL COMMENT '租户（与 wf_data_source.tenant_id 同域）',
    `name`            VARCHAR(100) NOT NULL COMMENT '权限名称（管理页展示；允许重名）',
    `remark`          VARCHAR(255) NULL,
    `conditions_json` TEXT         NOT NULL COMMENT '条件数组 [{column,op,value},...]，组内 AND；存空数组无意义，保存时拒绝',
    `is_deleted`      INT          NOT NULL DEFAULT 0,
    `created_by`      VARCHAR(50)  NULL,
    `created_at`      DATETIME(6)  NULL,
    `updated_by`      VARCHAR(50)  NULL,
    `updated_at`      DATETIME(6)  NULL,
    PRIMARY KEY (`id`),
    KEY `idx_row_permission_tenant` (`tenant_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='行权限对象（条件组，组内 AND）';

CREATE TABLE IF NOT EXISTS `wf_row_permission_source` (
    `id`             BIGINT      NOT NULL AUTO_INCREMENT,
    `tenant_id`      VARCHAR(64) NOT NULL,
    `permission_id`  BIGINT      NOT NULL COMMENT 'wf_row_permission.id',
    `data_source_id` VARCHAR(64) NOT NULL COMMENT 'wf_data_source.id',
    `is_deleted`     INT         NOT NULL DEFAULT 0,
    `created_by`     VARCHAR(50) NULL,
    `created_at`     DATETIME(6) NULL,
    `updated_by`     VARCHAR(50) NULL,
    `updated_at`     DATETIME(6) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_row_permission_source` (`permission_id`, `data_source_id`),
    KEY `idx_row_permission_source_ds` (`tenant_id`, `data_source_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='行权限对象 × 数据源';

CREATE TABLE IF NOT EXISTS `wf_row_permission_grant` (
    `id`            BIGINT      NOT NULL AUTO_INCREMENT,
    `tenant_id`     VARCHAR(64) NOT NULL,
    `permission_id` BIGINT      NOT NULL COMMENT 'wf_row_permission.id',
    `subject_type`  VARCHAR(20) NOT NULL COMMENT 'ROLE 角色 / USER 用户 / ORG 组织 / MEMBER_GROUP 成员组',
    `subject_key`   VARCHAR(64) NOT NULL COMMENT '角色 code / 用户 id / 组织 id / 成员组 id',
    `scope_action`  VARCHAR(10) NOT NULL COMMENT 'READ 读（列表/聚合/单条） / WRITE 写（修改/删除）',
    `is_deleted`    INT         NOT NULL DEFAULT 0,
    `created_by`    VARCHAR(50) NULL,
    `created_at`    DATETIME(6) NULL,
    `updated_by`    VARCHAR(50) NULL,
    `updated_at`    DATETIME(6) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_row_permission_grant` (`permission_id`, `subject_type`, `subject_key`, `scope_action`),
    KEY `idx_row_permission_grant_subject` (`tenant_id`, `subject_type`, `subject_key`, `scope_action`),
    KEY `idx_row_permission_grant_perm` (`tenant_id`, `permission_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='行权限对象授予主体（分读写轴）';

DROP TABLE IF EXISTS `wf_data_scope`;
