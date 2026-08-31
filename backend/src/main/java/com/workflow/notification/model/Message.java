package com.workflow.notification.model;

import com.workflow.notification.model.MessageCategory;
import com.workflow.notification.model.MessagePriority;
import com.workflow.notification.model.MessageStatus;
import com.workflow.notification.model.MessageType;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * 消息实体
 * 
 * <p>对应 {@code msg_message} 表
 * 存储消息的基本信息及消息内容
 */
@Entity
@Table(name = "msg_message")
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 租户ID */
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    /** 模板代码 */
    @Column(name = "template_code", length = 64, nullable = false)
    private String templateCode;

    /** 发送者ID */
    @Column(name = "sender_id", nullable = false)
    private Long senderId;

    /** 发送者类型 (SYSTEM, USER) */
    @Column(name = "sender_type", length = 32, nullable = false)
    private String senderType;

    /** 消息标题 */
    @Column(length = 255, nullable = false)
    private String title;

    /** 消息内容 (JSON) */
    @Column(name = "content", columnDefinition = "JSON")
    private Map<String, Object> content;

    /** 链接信息 (JSON) */
    @Column(name = "link_json", columnDefinition = "JSON")
    private Map<String, Object> linkJson;

    /** 消息优先级 */
    @Enumerated(EnumType.STRING)
    @Column(name = "priority", length = 16)
    private MessagePriority priority;

    /** 消息类别 */
    @Enumerated(EnumType.STRING)
    @Column(name = "category", length = 16)
    private MessageCategory category;

    /** 消息类型 */
    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", length = 16)
    private MessageType messageType;

    /** 消息状态 */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16)
    private MessageStatus status;

    /** 创建时间 */
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    // ==================== Constructors ====================

    public Message() {}

    public Message(Long id, Long tenantId, String templateCode, Long senderId,
                   String senderType, String title, Map<String, Object> content,
                   Map<String, Object> linkJson, MessagePriority priority,
                   MessageCategory category, MessageType messageType,
                   MessageStatus status, LocalDateTime createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.templateCode = templateCode;
        this.senderId = senderId;
        this.senderType = senderType;
        this.title = title;
        this.content = content;
        this.linkJson = linkJson;
        this.priority = priority;
        this.category = category;
        this.messageType = messageType;
        this.status = status;
        this.createdAt = createdAt;
    }

    // ==================== Getters / Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public String getTemplateCode() { return templateCode; }
    public void setTemplateCode(String templateCode) { this.templateCode = templateCode; }

    public Long getSenderId() { return senderId; }
    public void setSenderId(Long senderId) { this.senderId = senderId; }

    public String getSenderType() { return senderType; }
    public void setSenderType(String senderType) { this.senderType = senderType; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public Map<String, Object> getContent() { return content; }
    public void setContent(Map<String, Object> content) { this.content = content; }

    public Map<String, Object> getLinkJson() { return linkJson; }
    public void setLinkJson(Map<String, Object> linkJson) { this.linkJson = linkJson; }

    public MessagePriority getPriority() { return priority; }
    public void setPriority(MessagePriority priority) { this.priority = priority; }

    public MessageCategory getCategory() { return category; }
    public void setCategory(MessageCategory category) { this.category = category; }

    public MessageType getMessageType() { return messageType; }
    public void setMessageType(MessageType messageType) { this.messageType = messageType; }

    public MessageStatus getStatus() { return status; }
    public void setStatus(MessageStatus status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    // ==================== Business Methods ====================

    /**
     * pre-persist 钩子
     */
    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}