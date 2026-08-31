-- V25: 优化重试表索引
CREATE INDEX idx_retry_status_next ON msg_delivery_retry (status, next_retry_at);
