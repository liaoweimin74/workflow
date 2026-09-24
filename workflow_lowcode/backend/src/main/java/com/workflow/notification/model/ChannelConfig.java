package com.workflow.notification.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 渠道配置实体
 *
 * <p>对应 {@code msg_channel_config} 表
 * 存储渠道运行时配置（键值对），敏感字段（api-key/secret 等）加密后落库。
 * 键值语义由各渠道适配器约定：如 SMS 的 url/api-key/api-secret/sign-name，
 * 企业微信的 corp-id/corp-secret/agent-id，小程序的 app-id/app-secret/template-id。
 */
@Entity
@Table(name = "msg_channel_config",
       uniqueConstraints = {@UniqueConstraint(columnNames = {"channel", "config_key"})})
public class ChannelConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 渠道类型 */
    @Enumerated(EnumType.STRING)
    @Column(name = "channel", length = 16, nullable = false)
    private ChannelType channel;

    /** 配置键 */
    @Column(name = "config_key", length = 64, nullable = false)
    private String configKey;

    /** 配置值（敏感字段加密存储） */
    @Column(name = "config_value", columnDefinition = "TEXT")
    private String configValue;

    /** 是否加密存储 */
    @Column(name = "is_encrypted", nullable = false)
    private Boolean encrypted;

    /** 创建时间 */
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    /** 更新时间 */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ==================== Getters / Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ChannelType getChannel() { return channel; }
    public void setChannel(ChannelType channel) { this.channel = channel; }
    public String getConfigKey() { return configKey; }
    public void setConfigKey(String configKey) { this.configKey = configKey; }
    public String getConfigValue() { return configValue; }
    public void setConfigValue(String configValue) { this.configValue = configValue; }
    public Boolean getEncrypted() { return encrypted; }
    public void setEncrypted(Boolean encrypted) { this.encrypted = encrypted; }
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
