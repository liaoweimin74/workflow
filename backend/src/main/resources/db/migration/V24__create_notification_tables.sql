-- ============================================================
-- V24: 消息中心模块 - 创建消息通知表
-- 创建消息、收件人、模板、订阅规则等表结构
-- ============================================================

-- 消息表
CREATE TABLE IF NOT EXISTS msg_message (
    id                      BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT        NOT NULL COMMENT '租户ID',
    template_code           VARCHAR(64)   NOT NULL COMMENT '模板代码',
    sender_id               BIGINT        NOT NULL COMMENT '发送者ID',
    sender_type             VARCHAR(32)   NOT NULL COMMENT '发送者类型 (SYSTEM, USER)',
    title                   VARCHAR(255)  NOT NULL COMMENT '消息标题',
    content                 JSON          NULL COMMENT '消息内容 (JSON)',
    link_json               JSON          NULL COMMENT '链接信息 (JSON)',
    priority                VARCHAR(16)   NOT NULL COMMENT '消息优先级',
    category                VARCHAR(16)   NOT NULL COMMENT '消息类别',
    message_type            VARCHAR(16)   NOT NULL COMMENT '消息类型',
    status                  VARCHAR(16)   NOT NULL COMMENT '消息状态',
    created_at              DATETIME      DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_template (template_code),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息表';

-- 收件人表
CREATE TABLE IF NOT EXISTS msg_recipient (
    id                      BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT        NOT NULL COMMENT '租户ID',
    message_id              BIGINT        NOT NULL COMMENT '消息ID',
    user_id                 BIGINT        NOT NULL COMMENT '用户ID',
    username                VARCHAR(64)   NOT NULL COMMENT '用户名',
    nickname                VARCHAR(64)   NULL COMMENT '昵称',
    email                   VARCHAR(255)  NULL COMMENT '邮箱',
    phone                   VARCHAR(20)   NULL COMMENT '手机号',
    channel                 VARCHAR(16)   NOT NULL COMMENT '渠道类型',
    status                  VARCHAR(16)   NOT NULL COMMENT '消息状态',
    sent_at                 DATETIME      NULL COMMENT '发送时间',
    created_at              DATETIME      DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_message (message_id),
    KEY idx_user (user_id),
    KEY idx_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收件人表';

-- 消息模板表
CREATE TABLE IF NOT EXISTS msg_template (
    id                      BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT        NOT NULL COMMENT '租户ID',
    template_code           VARCHAR(64)   NOT NULL COMMENT '模板代码',
    name                    VARCHAR(128)  NOT NULL COMMENT '模板名称',
    title                   VARCHAR(255)  NULL COMMENT '标题模板',
    content                 TEXT          NULL COMMENT '内容模板',
    channel                 VARCHAR(16)   NULL COMMENT '渠道类型',
    priority                  VARCHAR(16)   NULL COMMENT '默认优先级',
    category                  VARCHAR(16)   NULL COMMENT '默认类别',
    is_system               BOOLEAN       NOT NULL DEFAULT FALSE COMMENT '是否为系统模板',
    created_at              DATETIME      DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_template (tenant_id, template_code),
    KEY idx_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息模板表';

-- 订阅规则表
CREATE TABLE IF NOT EXISTS msg_subscription_rule (
    id                      BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT        NOT NULL COMMENT '租户ID',
    event_code              VARCHAR(64)   NOT NULL COMMENT '事件代码',
    channel                 VARCHAR(16)   NOT NULL COMMENT '渠道类型',
    priority                VARCHAR(16)   NULL COMMENT '优先级',
    `enable`                BOOLEAN       NOT NULL DEFAULT TRUE COMMENT '是否启用',
    `condition`             TEXT          NULL COMMENT '条件表达式',
    created_by              VARCHAR(64)   NULL COMMENT '创建人',
    created_at              DATETIME      DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_event_channel (event_code, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅规则表';

-- 用户订阅表
CREATE TABLE IF NOT EXISTS msg_user_subscription (
    id                      BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT        NOT NULL COMMENT '租户ID',
    user_id                 BIGINT        NOT NULL COMMENT '用户ID',
    username                VARCHAR(64)   NOT NULL COMMENT '用户名',
    channel                 VARCHAR(16)   NOT NULL COMMENT '渠道类型',
    subscribed              BOOLEAN       NOT NULL DEFAULT TRUE COMMENT '是否订阅',
    created_at              DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_user_channel (tenant_id, user_id, channel),
    KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户订阅表';

-- 路由失败重试记录表
CREATE TABLE IF NOT EXISTS msg_delivery_retry (
    id                      BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id               BIGINT        NOT NULL COMMENT '租户ID',
    recipient_id            BIGINT        NOT NULL COMMENT '收件人ID',
    channel                 VARCHAR(16)   NOT NULL COMMENT '渠道类型',
    retry_count             INT           NOT NULL DEFAULT 0 COMMENT '重试次数',
    max_retry               INT           NOT NULL DEFAULT 3 COMMENT '最大重试次数',
    last_error              TEXT          NULL COMMENT '最后一次错误',
    next_retry_at           DATETIME      NULL COMMENT '下次重试时间',
    status                  VARCHAR(16)   NOT NULL COMMENT '状态',
    created_at              DATETIME      DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_recipient (recipient_id),
    KEY idx_next_retry (next_retry_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息路由失败重试记录表';