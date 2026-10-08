-- ============================================================
-- V35: 对齐 Java「Hibernate 自动补列」产生的 schema
-- ============================================================
--
-- 【为什么需要这个迁移】
--   Java 侧 `spring.jpa.hibernate.ddl-auto=update`，启动时会**自动补列补表**。
--   所以「迁移文件」并不等于 Java 实际运行的 schema —— 迁移只覆盖了其中的一部分，
--   剩下的是 Hibernate 按实体定义补出来的。
--
--   实测证据：把 Node 的全部迁移应用到空库后，与 Java 跑过的 workflow_v6 对比，
--   在 Node 声明使用的 31 张表 / 337 个列中，有 **1 张表 + 8 个列**是迁移没有的
--   （诊断脚本与结论见 docs/superpowers/specs 的 U21）。
--   本项目契约库 workflow_v6 是 Hibernate 形状，所以 Node 跑在上面一直是对的；
--   但**只跑迁移的全新库**会缺这些对象 —— 也就是 Node 后端无法独立部署。
--
-- 【本迁移的边界】
--   只补 Node 真正用到的对象。**刻意不含** `act_*` / `flw_*` / `event_publication`：
--   那些是 Flowable 与 Spring Modulith 的表，Node 引擎不使用也不得触碰（约束 C2）。
--   Java 自动建的业务表 `wf_biz_<formKey>` 也不在这里 —— 它们是运行期按表单定义
--   动态建的表，属于表单模块的职责（见 U23），不能固化成迁移。
--
-- 【全部带守卫，可重复执行】
--   每一条 DDL 都先查 information_schema 再决定是否执行，因此在
--   workflow_v6（Hibernate 已补过）上是**彻底的无操作**，不会报 Duplicate column。
--   命令名与 V28/V29 保持一致。
-- ============================================================


-- ---------- 1. 渠道运行时配置表（Java 侧整个表都由 Hibernate 建的） ----------
-- 唯一键名与 Hibernate 生成的随机名 `UKn88wqw1d54i7fcsdtd7wfi4l4` 不同，
-- 改用可读名：唯一键名不参与任何响应契约，语义（channel + config_key 唯一）一致。
CREATE TABLE IF NOT EXISTS msg_channel_config (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    channel         ENUM('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL COMMENT '渠道类型',
    config_key      VARCHAR(64)  NOT NULL COMMENT '配置键；__enabled 为保留键（渠道启停开关）',
    config_value    TEXT         NULL COMMENT '配置值；is_encrypted=1 时为密文',
    is_encrypted    BIT(1)       NOT NULL DEFAULT b'0' COMMENT '值是否加密存储',
    created_at      DATETIME(6)  NULL DEFAULT NULL,
    updated_at      DATETIME(6)  NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_channel_config (channel, config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='渠道运行时配置';


-- ---------- 2. 补 8 个缺失列 ----------
-- 说明：NOT NULL 列一律给默认值。Hibernate 加的这些列**没有默认值**，
--       而「NOT NULL 且无默认值」正是之前 `Field 'process_key' doesn't have a
--       default value` 那类插入失败的根源 —— 迁移里补上默认值可以根除它，
--       而且不改变任何响应取值（写入方本来就会显式赋值）。

SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE wf_process_draft ADD COLUMN process_key VARCHAR(255) NOT NULL DEFAULT '''' COMMENT ''设计器里的流程 key（实体映射列）''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_process_draft' AND COLUMN_NAME = 'process_key'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE wf_process_draft ADD COLUMN deployed_xml LONGTEXT NULL COMMENT ''最近一次部署时的 BPMN XML 快照''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_process_draft' AND COLUMN_NAME = 'deployed_xml'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE wf_node_config ADD COLUMN process_definition_id VARCHAR(64) NULL COMMENT ''非空表示该行是某部署版本的节点配置快照''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_node_config' AND COLUMN_NAME = 'process_definition_id'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE wf_task_comment ADD COLUMN target_user_id VARCHAR(64) NULL COMMENT ''加签/转办/抄送的目标用户''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_task_comment' AND COLUMN_NAME = 'target_user_id'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE wf_form_data ADD COLUMN is_snapshot BIT(1) NOT NULL DEFAULT b''0'' COMMENT ''1=审批快照（不可变），0=当前数据''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_form_data' AND COLUMN_NAME = 'is_snapshot'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 枚举成员顺序照抄 Hibernate 产出的形状（字母序 MARKDOWN, TEXT）。
-- 注意 V28 给 msg_message 加的同名列是 TEXT, MARKDOWN —— 两处顺序不同但取值集合相同，
-- 顺序只影响排序、不影响取值，故不复改已有列。
SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE msg_template ADD COLUMN content_type ENUM(''MARKDOWN'',''TEXT'') NULL COMMENT ''内容渲染类型（TEXT/MARKDOWN）''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'msg_template' AND COLUMN_NAME = 'content_type'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE msg_template ADD COLUMN enabled BIT(1) NOT NULL DEFAULT b''1'' COMMENT ''是否启用（停用后发送被拒绝）''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'msg_template' AND COLUMN_NAME = 'enabled'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
    SELECT IF(COUNT(*) = 0,
              'ALTER TABLE msg_delivery_retry ADD COLUMN message_id BIGINT NOT NULL DEFAULT 0 COMMENT ''消息ID（重试时据此重建内容）''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'msg_delivery_retry' AND COLUMN_NAME = 'message_id'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------- 3. 放宽 V6 遗留的 `key` 列的 NOT NULL ----------
-- V6 建表时用的是 `key`，而 Java/Node 两侧实体的映射列都是 `process_key`
-- （Hibernate 补出 process_key 后，`key` 就成了没有任何写入方的遗留列）。
-- 它 `NOT NULL` 且无默认值，在**只跑迁移的干净库**上会直接让草稿插入失败：
-- 这正是 `Field 'key' doesn't have a default value` 在全新库上的成因
-- （workflow_v6 上没有这个问题，只因为它的 wf_process_draft 是 Hibernate 建的、压根没有 key 列）。
--
-- **刻意不 DROP COLUMN**：删列不可逆，而 `key` 里可能存着早期数据。
-- 改成可空即可解除插入阻塞 —— 保留数据、消除隐患，且对 workflow_v6 是无操作。
SET @ddl = (
    SELECT IF(COUNT(*) > 0,
              'ALTER TABLE wf_process_draft MODIFY COLUMN `key` VARCHAR(255) NULL DEFAULT NULL COMMENT ''V6 遗留列，已被 process_key 取代；保留数据但不再写入''',
              'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wf_process_draft'
      AND COLUMN_NAME = 'key' AND IS_NULLABLE = 'NO'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
