package com.workflow.notification.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 收件人实体
 * 
 * <p>对应 {@code msg_recipient} 表
 * 记录消息的收件人信息
 */
@Entity
@Table(name = "msg_recipient")
public class Recipient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 租户ID */
    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    /** 消息ID */
    @Column(name = "message_id", nullable = false)
    private Long messageId;

    /** 用户ID */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 用户名 */
    @Column(name = "username", length = 64, nullable = false)
    private String username;

    /** 昵称 */
    @Column(name = "nickname", length = 64)
    private String nickname;

    /** 邮箱 */
    @Column(name = "email", length = 255)
    private String email;

    /** 手机号 */
    @Column(name = "phone", length = 20)
    private String phone;

    /** 渠道类型 */
    @Enumerated(EnumType.STRING)
    @Column(name = "channel", length = 16, nullable = false)
    private ChannelType channel;

    /** 消息状态 */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    private MessageStatus status;

    /** 发送时间 */
    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    /** 创建时间 */
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    // ==================== Getters / Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public Long getMessageId() { return messageId; }
    public void setMessageId(Long messageId) { this.messageId = messageId; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getNickname() { return nickname; }
    public void setNickname(String nickname) { this.nickname = nickname; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public ChannelType getChannel() { return channel; }
    public void setChannel(ChannelType channel) { this.channel = channel; }

    public MessageStatus getStatus() { return status; }
    public void setStatus(MessageStatus status) { this.status = status; }

    public LocalDateTime getSentAt() { return sentAt; }
    public void setSentAt(LocalDateTime sentAt) { this.sentAt = sentAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    // ==================== Business Methods ====================

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}