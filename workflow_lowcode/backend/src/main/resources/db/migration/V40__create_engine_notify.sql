-- V40: 引擎通知记录表（短信/催办等外发通知的落库占位，后续接入消息网关）
-- 触发源：节点 notify.sms=true（新待办）、发起节点 initiator.smsOnEnd=true（实例结束）、超时调度提醒

CREATE TABLE IF NOT EXISTS `wf_engine_notify` (
  `id`           VARCHAR(64)  NOT NULL COMMENT 'UUID',
  `tenant_id`    VARCHAR(64)  NOT NULL DEFAULT 'default' COMMENT '租户 ID',
  `instance_id`  VARCHAR(64)  NOT NULL COMMENT '流程实例 ID',
  `task_id`      VARCHAR(64)      NULL COMMENT '关联任务 ID（实例级通知为 NULL）',
  `notify_type`  VARCHAR(32)  NOT NULL COMMENT '通知类型：SMS_NODE/SMS_END/TIMEOUT_REMIND',
  `target_user`  VARCHAR(64)  NOT NULL COMMENT '目标用户 ID',
  `content`      VARCHAR(500) NOT NULL COMMENT '通知内容',
  `status`       VARCHAR(16)  NOT NULL DEFAULT 'PENDING' COMMENT '发送状态：PENDING/SENT/FAILED',
  `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_engine_notify_instance` (`instance_id`),
  KEY `idx_engine_notify_target` (`target_user`, `status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT ='引擎外发通知记录';
