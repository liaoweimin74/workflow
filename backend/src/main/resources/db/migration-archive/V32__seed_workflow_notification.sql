-- ============================================================
-- V32: 工作流通知桥接种子数据
-- 打通工作流引擎 → 通知中心链路：
--   1) 种子化工作流业务事件定义（事件管理页可见/可停用）
--   2) 种子化站内信模板（模板管理页可见/可改文案）
-- 引擎侧 WorkflowNotificationListener 通过 MessageSender.sendByTemplate
-- 按以下模板发送：TPL_WF_TASK_ASSIGNED / TPL_WF_PROCESS_FINISHED / TPL_WF_TASK_REMINDED
--
-- 兼容性说明（与 V28/V29 同款守卫模式）：
-- msg_template 的 enabled / content_type / event_code 列由 Hibernate
-- ddl-auto=update 在启动期补建（Flyway 之后执行），全新库首次迁移时该列
-- 尚不存在，故此处用 information_schema 动态判断补列，保证幂等。
-- ============================================================

-- ---------- msg_template.enabled（若缺失） ----------
SET @tpl_enabled_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'msg_template'
      AND column_name = 'enabled'
);
SET @ddl := IF(@tpl_enabled_exists = 0,
    'ALTER TABLE msg_template ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''是否启用''',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- msg_template.content_type（若缺失） ----------
SET @tpl_ct_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'msg_template'
      AND column_name = 'content_type'
);
SET @ddl := IF(@tpl_ct_exists = 0,
    'ALTER TABLE msg_template ADD COLUMN content_type VARCHAR(16) NULL COMMENT ''内容渲染类型 (TEXT/MARKDOWN)''',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- msg_template.event_code（若缺失） ----------
SET @tpl_ec_exists := (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'msg_template'
      AND column_name = 'event_code'
);
SET @ddl := IF(@tpl_ec_exists = 0,
    'ALTER TABLE msg_template ADD COLUMN event_code VARCHAR(64) NULL COMMENT ''业务事件代码''',
    'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------- 工作流业务事件定义 ----------
-- 注意：created_at 需显式赋值——沙箱 H2 上表由 Hibernate ddl-auto 先建（V29 的
-- CREATE TABLE IF NOT EXISTS 因表已存在而跳过），其 created_at 无默认值。
-- 幂等性：用 WHERE NOT EXISTS 而非 INSERT IGNORE——沙箱 H2 的表同样由 Hibernate 建，
-- 不含 V29/V24 定义的唯一键，IGNORE 无法去重；且 H2_REPLAY 会在每次启动时重放本脚本。
INSERT INTO msg_event_definition
    (tenant_id, event_code, event_name, description, business_domain, enabled, created_by, created_at, updated_at)
SELECT 'default', 'WF_TASK_ASSIGNED', '工作流任务待办', '用户任务分配给办理人时推送待办通知', 'WORKFLOW', 1, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM msg_event_definition WHERE tenant_id='default' AND event_code='WF_TASK_ASSIGNED');

INSERT INTO msg_event_definition
    (tenant_id, event_code, event_name, description, business_domain, enabled, created_by, created_at, updated_at)
SELECT 'default', 'WF_PROCESS_FINISHED', '工作流办结通知', '流程实例全部审批完成时通知发起人', 'WORKFLOW', 1, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM msg_event_definition WHERE tenant_id='default' AND event_code='WF_PROCESS_FINISHED');

INSERT INTO msg_event_definition
    (tenant_id, event_code, event_name, description, business_domain, enabled, created_by, created_at, updated_at)
SELECT 'default', 'WF_TASK_REMINDED', '工作流催办通知', '发起人对待办任务发起催办时通知办理人', 'WORKFLOW', 1, 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM msg_event_definition WHERE tenant_id='default' AND event_code='WF_TASK_REMINDED');

-- ---------- 工作流站内信模板 ----------
-- 同上：WHERE NOT EXISTS 幂等（H2 无唯一键、每次启动重放）
INSERT INTO msg_template
    (tenant_id, template_code, name, title, content, channel, priority, category, enabled, content_type, is_system, created_at)
SELECT 'default', 'TPL_WF_TASK_ASSIGNED', '工作流-任务待办通知',
       '您有新的待办任务：${taskName}',
       '流程「${processName}」已流转至节点「${taskName}」，发起人：${initiatorName}，请及时处理。',
       'IN_APP', 'NORMAL', 'WORKFLOW', 1, 'TEXT', TRUE, CURRENT_TIMESTAMP
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM msg_template WHERE tenant_id='default' AND template_code='TPL_WF_TASK_ASSIGNED');

INSERT INTO msg_template
    (tenant_id, template_code, name, title, content, channel, priority, category, enabled, content_type, is_system, created_at)
SELECT 'default', 'TPL_WF_PROCESS_FINISHED', '工作流-办结通知',
       '您的流程「${processName}」已办结',
       '您发起的流程「${processName}」（单号：${businessKey}）已全部审批完成。',
       'IN_APP', 'NORMAL', 'WORKFLOW', 1, 'TEXT', TRUE, CURRENT_TIMESTAMP
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM msg_template WHERE tenant_id='default' AND template_code='TPL_WF_PROCESS_FINISHED');

INSERT INTO msg_template
    (tenant_id, template_code, name, title, content, channel, priority, category, enabled, content_type, is_system, created_at)
SELECT 'default', 'TPL_WF_TASK_REMINDED', '工作流-催办通知',
       '催办提醒：${taskName}',
       '${senderName} 催促您尽快处理流程「${processName}」中的任务「${taskName}」。',
       'IN_APP', 'NORMAL', 'WORKFLOW', 1, 'TEXT', TRUE, CURRENT_TIMESTAMP
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM msg_template WHERE tenant_id='default' AND template_code='TPL_WF_TASK_REMINDED');
