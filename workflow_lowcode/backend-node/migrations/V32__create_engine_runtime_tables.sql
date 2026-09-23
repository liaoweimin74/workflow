-- V32 引擎运行时表（绿地，替代 Flowable 的 ACT_* 表）
--
-- 依据：docs/superpowers/specs/2026-09-16-nodejs-backend-migration-design.md §4.4
--
-- 迁移决策 C2：自研引擎使用自定义表，不读不写任何 ACT_* / flw_* 表；
-- 存量运行中实例与历史不迁移。已核实开发库中 act_re_procdef 与 act_hi_procinst
-- 均为 0 行，因此该决策无数据损失。
--
-- 与 Flowable 的关键设计差异：
--   1) 任务不拆运行时/历史两张表，用 status 区分
--      （替代 ACT_RU_TASK + ACT_HI_TASKINST 的两级回退查询）。
--   2) 活动实例同样统一一张表（替代 ACT_HI_ACTINST），运行中的记录 status='ACTIVE'。
--   3) 编译产物 model_json 直接存 JSON 列，不拆节点表 —— 运行时总是整图加载，
--      不存在按节点查询的需求，拆表只会增加 join 与写入复杂度。
--
-- 全表使用 CREATE TABLE IF NOT EXISTS，保证幂等。

CREATE TABLE IF NOT EXISTS `wfe_process_def` (
  `id`                   VARCHAR(64)  NOT NULL COMMENT '部署版本 ID，格式 key:version:uuid（沿用 Flowable 格式）',
  `tenant_id`            VARCHAR(64)  NOT NULL,
  `process_key`          VARCHAR(255) NOT NULL,
  `version`              INT          NOT NULL,
  `name`                 VARCHAR(255) DEFAULT NULL,
  `category_id`          VARCHAR(64)  DEFAULT NULL,
  `bpmn_xml`             LONGTEXT     NOT NULL COMMENT '设计器产出的 BPMN XML 原文（真源，C3）',
  `model_json`           LONGTEXT     NOT NULL COMMENT '部署期编译产物 ProcessModel',
  `deployed_config_hash` VARCHAR(64)  DEFAULT NULL COMMENT 'BPMN XML + NodeConfig 的 SHA-256，未变化则跳过部署',
  `status`               VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / SUSPENDED',
  `draft_id`             VARCHAR(64)  DEFAULT NULL COMMENT '来源草稿 wf_process_draft.id',
  `deployed_at`          DATETIME     NOT NULL,
  `created_at`           DATETIME     NOT NULL,
  `updated_at`           DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_key_version` (`tenant_id`, `process_key`, `version`),
  KEY `idx_tenant_key` (`tenant_id`, `process_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义部署版本（替代 ACT_RE_PROCDEF + ACT_RE_DEPLOYMENT）';

CREATE TABLE IF NOT EXISTS `wfe_process_instance` (
  `id`                 VARCHAR(64)  NOT NULL,
  `tenant_id`          VARCHAR(64)  NOT NULL,
  `process_def_id`     VARCHAR(64)  NOT NULL,
  `process_key`        VARCHAR(255) NOT NULL,
  `process_name`       VARCHAR(255) DEFAULT NULL,
  `business_key`       VARCHAR(255) DEFAULT NULL,
  `status`             VARCHAR(20)  NOT NULL COMMENT 'RUNNING / SUSPENDED / COMPLETED / TERMINATED',
  `initiator`          VARCHAR(64)  DEFAULT NULL COMMENT '发起人用户 ID',
  `parent_instance_id` VARCHAR(64)  DEFAULT NULL COMMENT 'callActivity 父实例 ID',
  `parent_node_id`     VARCHAR(255) DEFAULT NULL COMMENT '父实例中的 callActivity 节点 ID',
  `start_time`         DATETIME     NOT NULL,
  `end_time`           DATETIME     DEFAULT NULL,
  `delete_reason`      VARCHAR(512) DEFAULT NULL,
  `created_at`         DATETIME     NOT NULL,
  `updated_at`         DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_status` (`tenant_id`, `status`),
  KEY `idx_tenant_initiator` (`tenant_id`, `initiator`),
  KEY `idx_parent` (`parent_instance_id`),
  KEY `idx_def` (`process_def_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程实例（替代 ACT_RU_EXECUTION 根 + ACT_HI_PROCINST）';

CREATE TABLE IF NOT EXISTS `wfe_execution` (
  `id`                 VARCHAR(64)  NOT NULL COMMENT 'token ID',
  `instance_id`        VARCHAR(64)  NOT NULL,
  `parent_id`          VARCHAR(64)  DEFAULT NULL,
  `node_id`            VARCHAR(255) NOT NULL COMMENT '当前 BPMN 元素 ID',
  `container_id`       VARCHAR(255) DEFAULT NULL COMMENT '所属内嵌子流程节点 ID',
  `scope_id`           VARCHAR(64)  DEFAULT NULL COMMENT '作用域 execution ID',
  `status`             VARCHAR(20)  NOT NULL COMMENT 'ACTIVE / WAITING / COMPLETED',
  `is_active`          TINYINT(1)   NOT NULL DEFAULT 1,
  `is_concurrent`      TINYINT(1)   NOT NULL DEFAULT 0,
  `is_scope`           TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否为作用域节点（子流程 / MI 根）',
  `mi_root_id`         VARCHAR(64)  DEFAULT NULL COMMENT '多实例根 execution ID',
  `mi_index`           INT          DEFAULT NULL COMMENT '多实例序号，从 0 开始',
  `called_instance_id` VARCHAR(64)  DEFAULT NULL COMMENT 'callActivity 启动的子实例 ID',
  `created_at`         DATETIME     NOT NULL,
  `updated_at`         DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_instance` (`instance_id`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_mi_root` (`mi_root_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='执行令牌（替代 ACT_RU_EXECUTION）';

CREATE TABLE IF NOT EXISTS `wfe_activity` (
  `id`           VARCHAR(64)  NOT NULL,
  `instance_id`  VARCHAR(64)  NOT NULL,
  `execution_id` VARCHAR(64)  DEFAULT NULL,
  `node_id`      VARCHAR(255) NOT NULL,
  `node_type`    VARCHAR(64)  NOT NULL,
  `node_name`    VARCHAR(255) DEFAULT NULL,
  `status`       VARCHAR(20)  NOT NULL COMMENT 'ACTIVE / COMPLETED / CANCELLED',
  `start_time`   DATETIME     NOT NULL,
  `end_time`     DATETIME     DEFAULT NULL,
  `duration_ms`  BIGINT       DEFAULT NULL,
  `mi_root_id`   VARCHAR(64)  DEFAULT NULL,
  `mi_index`     INT          DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL,
  `updated_at`   DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_instance_status` (`instance_id`, `status`),
  KEY `idx_instance_node` (`instance_id`, `node_id`),
  KEY `idx_mi_root` (`mi_root_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='活动实例（运行+历史统一，替代 ACT_HI_ACTINST）';

CREATE TABLE IF NOT EXISTS `wfe_task` (
  `id`                   VARCHAR(64)  NOT NULL,
  `tenant_id`            VARCHAR(64)  NOT NULL,
  `instance_id`          VARCHAR(64)  NOT NULL,
  `execution_id`         VARCHAR(64)  DEFAULT NULL,
  `node_id`              VARCHAR(255) NOT NULL COMMENT 'BPMN 元素 ID，等价 taskDefinitionKey',
  `activity_instance_id` VARCHAR(64)  DEFAULT NULL COMMENT 'FK → wfe_activity.id',
  `name`                 VARCHAR(255) DEFAULT NULL,
  `assignee`             VARCHAR(64)  DEFAULT NULL,
  `status`               VARCHAR(20)  NOT NULL COMMENT 'CREATED / CLAIMED / COMPLETED / CANCELLED',
  `create_time`          DATETIME     NOT NULL,
  `claim_time`           DATETIME     DEFAULT NULL,
  `end_time`             DATETIME     DEFAULT NULL,
  `due_date`             DATETIME     DEFAULT NULL,
  `mi_index`             INT          DEFAULT NULL,
  `created_at`           DATETIME     NOT NULL,
  `updated_at`           DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_assignee_status` (`tenant_id`, `assignee`, `status`),
  KEY `idx_instance_status` (`instance_id`, `status`),
  KEY `idx_instance_node` (`instance_id`, `node_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务（待办+已办统一，替代 ACT_RU_TASK + ACT_HI_TASKINST）';

CREATE TABLE IF NOT EXISTS `wfe_task_candidate` (
  `id`         VARCHAR(64) NOT NULL,
  `task_id`    VARCHAR(64) NOT NULL,
  `user_id`    VARCHAR(64) NOT NULL,
  `created_at` DATETIME    NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_user` (`task_id`, `user_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务候选人（替代 ACT_RU_IDENTITYLINK）';

-- 注意：uk_instance_scope_name 含可空的 scope_id，而 MySQL 唯一索引把多个 NULL
-- 视为互不相同。实例级变量统一用**空字符串**而非 NULL 存 scope_id，由应用层保证。
CREATE TABLE IF NOT EXISTS `wfe_variable` (
  `id`          VARCHAR(64)  NOT NULL,
  `instance_id` VARCHAR(64)  NOT NULL,
  `execution_id` VARCHAR(64) DEFAULT NULL,
  `scope_id`    VARCHAR(64)  DEFAULT NULL COMMENT '实例级变量存空字符串，不可为 NULL',
  `name`        VARCHAR(255) NOT NULL,
  `type`        VARCHAR(32)  NOT NULL COMMENT 'string / number / boolean / json / date',
  `value_json`  LONGTEXT     DEFAULT NULL,
  `create_time` DATETIME     NOT NULL,
  `update_time` DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_instance_scope_name` (`instance_id`, `scope_id`, `name`),
  KEY `idx_instance_name` (`instance_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程变量（替代 ACT_RU_VARIABLE + ACT_HI_VARINST）';
