-- ============================================================
-- V27: 统一通知模块租户字段类型为 VARCHAR
-- 全系统（wf_*）tenant_id 均为 VARCHAR，通知模块此前误用 BIGINT
-- ============================================================

ALTER TABLE msg_message
    MODIFY COLUMN tenant_id VARCHAR(64) NOT NULL COMMENT '租户ID';

ALTER TABLE msg_recipient
    MODIFY COLUMN tenant_id VARCHAR(64) NOT NULL COMMENT '租户ID';

ALTER TABLE msg_template
    MODIFY COLUMN tenant_id VARCHAR(64) NOT NULL COMMENT '租户ID';

ALTER TABLE msg_subscription_rule
    MODIFY COLUMN tenant_id VARCHAR(64) NOT NULL COMMENT '租户ID';

ALTER TABLE msg_user_subscription
    MODIFY COLUMN tenant_id VARCHAR(64) NOT NULL COMMENT '租户ID';

ALTER TABLE msg_delivery_retry
    MODIFY COLUMN tenant_id VARCHAR(64) NOT NULL COMMENT '租户ID';
