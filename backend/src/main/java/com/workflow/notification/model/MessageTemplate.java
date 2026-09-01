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
    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    /** 模板代码 */
    @Column(name = "template_code", length = 64, nullable = false)
    private String templateCode;

    /** 业务事件代码；兼容旧模板时可为空 */
    @Column(name = "event_code", length = 64)
    private String eventCode;

    /** 模板名称 */
    @Column(name = "name", length = 128, nullable = false)
    private String name;

    /** 标题模板 */
    @Column(name = "title", length = 255)
    private String title;

    /** 内容模板 */
    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    /** 内容类型：TEXT=纯文本，MARKDOWN=Markdown 富文本 */
    @Enumerated(EnumType.STRING)
    @Column(name = "content_type", length = 16)
    private TemplateContentType contentType = TemplateContentType.TEXT;

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

    /** 是否启用（停用的模板发送时被拒绝） */
    @Column(name = "enabled", nullable = false)
    private Boolean enabled = true;

    /** 创建时间 */
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    // ==================== Getters / Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getTemplateCode() { return templateCode; }
    public void setTemplateCode(String templateCode) { this.templateCode = templateCode; }
    public String getEventCode() { return eventCode; }
    public void setEventCode(String eventCode) { this.eventCode = eventCode; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public TemplateContentType getContentType() { return contentType; }
    public void setContentType(TemplateContentType contentType) { this.contentType = contentType; }

    public ChannelType getChannel() { return channel; }
    public void setChannel(ChannelType channel) { this.channel = channel; }

    public MessagePriority getPriority() { return priority; }
    public void setPriority(MessagePriority priority) { this.priority = priority; }

    public MessageCategory getCategory() { return category; }
    public void setCategory(MessageCategory category) { this.category = category; }

    public Boolean getIsSystem() { return isSystem; }
    public void setIsSystem(Boolean isSystem) { this.isSystem = isSystem; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    // ==================== Business Methods ====================

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
