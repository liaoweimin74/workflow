package com.workflow.notification.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 消息投递重试记录实体
 * 
 * <p>对应 {@code msg_delivery_retry} 表
 */
@Entity
@Table(name = "msg_delivery_retry")
public class DeliveryRetry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 租户ID */
    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    /** 收件人ID */
    @Column(name = "recipient_id", nullable = false)
    private Long recipientId;

    /** 渠道类型 */
    @Enumerated(EnumType.STRING)
    @Column(name = "channel", length = 16, nullable = false)
    private ChannelType channel;

    /** 重试次数 */
    @Column(name = "retry_count", nullable = false)
    private Integer retryCount;

    /** 最大重试次数 */
    @Column(name = "max_retry", nullable = false)
    private Integer maxRetry;

    /** 最后一次错误 */
    @Column(name = "last_error", columnDefinition = "TEXT")
    private String lastError;

    /** 下次重试时间 */
    @Column(name = "next_retry_at")
    private LocalDateTime nextRetryAt;

    /** 状态 */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    private MessageStatus status;

    /** 创建时间 */
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    /** 更新时间 */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ==================== Getters / Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public Long getRecipientId() { return recipientId; }
    public void setRecipientId(Long recipientId) { this.recipientId = recipientId; }
    public ChannelType getChannel() { return channel; }
    public void setChannel(ChannelType channel) { this.channel = channel; }
    public Integer getRetryCount() { return retryCount; }
    public void setRetryCount(Integer retryCount) { this.retryCount = retryCount; }
    public Integer getMaxRetry() { return maxRetry; }
    public void setMaxRetry(Integer maxRetry) { this.maxRetry = maxRetry; }
    public String getLastError() { return lastError; }
    public void setLastError(String lastError) { this.lastError = lastError; }
    public LocalDateTime getNextRetryAt() { return nextRetryAt; }
    public void setNextRetryAt(LocalDateTime nextRetryAt) { this.nextRetryAt = nextRetryAt; }
    public MessageStatus getStatus() { return status; }
    public void setStatus(MessageStatus status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
