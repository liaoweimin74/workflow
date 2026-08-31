package com.workflow.notification.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 用户订阅实体
 * 
 * <p>对应 {@code msg_user_subscription} 表
 * 存储用户的订阅偏好
 */
@Entity
@Table(name = "msg_user_subscription", 
       uniqueConstraints = {@UniqueConstraint(columnNames = {"tenant_id", "user_id", "channel"})})
public class UserSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 租户ID */
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    /** 用户ID */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 用户名 */
    @Column(name = "username", length = 64, nullable = false)
    private String username;

    /** 渠道类型 */
    @Enumerated(EnumType.STRING)
    @Column(name = "channel", length = 16, nullable = false)
    private ChannelType channel;

    /** 是否订阅 */
    @Column(name = "subscribed", nullable = false)
    private Boolean subscribed;

    /** 创建时间 */
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    /** 更新时间 */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ==================== Getters / Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public ChannelType getChannel() { return channel; }
    public void setChannel(ChannelType channel) { this.channel = channel; }

    public Boolean getSubscribed() { return subscribed; }
    public void setSubscribed(Boolean subscribed) { this.subscribed = subscribed; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    // ==================== Business Methods ====================

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}