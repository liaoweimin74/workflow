package com.workflow.notification.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 消息模板实体
 * 
 * <p>对应 {@code msg_template} 表
 * 存储消息模板配置
 */
@Entity
@Table(name = "msg_template")
public class MessageTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 租户ID */
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    /** 模板代码 */
    @Column(name = "template_code", length = 64, nullable = false)
    private String templateCode;

    /** 模板名称 */
    @Column(name = "name", length = 128, nullable = false)
    private String name;

    /** 标题模板 */
    @Column(name = "title", length = 255)
    private String title;

    /** 内容模板 */
    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    /** 渠道类型 */
    @Enumerated(EnumType.STRING)
    @Column(name = "channel", length = 16)
    private ChannelType channel;

    /** 默认优先级 */
    @Enumerated(EnumType.STRING)
    @Column(name = "priority", length = 16)
    private MessagePriority priority;

    /** 默认类别 */
    @Enumerated(EnumType.STRING)
    @Column(name = "category", length = 16)
    private MessageCategory category;

    /** 是否为系统模板 */
    @Column(name = "is_system", nullable = false)
    private Boolean isSystem;

    /** 创建时间 */
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    // ==================== Getters / Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }

    public String getTemplateCode() { return templateCode; }
    public void setTemplateCode(String templateCode) { this.templateCode = templateCode; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public ChannelType getChannel() { return channel; }
    public void setChannel(ChannelType channel) { this.channel = channel; }

    public MessagePriority getPriority() { return priority; }
    public void setPriority(MessagePriority priority) { this.priority = priority; }

    public MessageCategory getCategory() { return category; }
    public void setCategory(MessageCategory category) { this.category = category; }

    public Boolean getIsSystem() { return isSystem; }
    public void setIsSystem(Boolean isSystem) { this.isSystem = isSystem; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    // ==================== Business Methods ====================

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}