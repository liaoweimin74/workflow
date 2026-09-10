package com.workflow.notification.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 订阅规则实体
 * 
 * <p>对应 {@code msg_subscription_rule} 表
 * 存储事件订阅规则配置
 */
@Entity
@Table(name = "msg_subscription_rule")
public class SubscriptionRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 租户ID */
    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    /** 事件代码 */
    @Column(name = "event_code", length = 64, nullable = false)
    private String eventCode;

    /** 渠道类型 */
    @Enumerated(EnumType.STRING)
    @Column(name = "channel", length = 16, nullable = false)
    private ChannelType channel;

    /** 优先级 */
    @Enumerated(EnumType.STRING)
    @Column(name = "priority", length = 16)
    private MessagePriority priority;

    /** 是否启用 */
    @Column(name = "enable", nullable = false)
    private Boolean enable;

    /** 规则动作：ALLOW/DENY/FORCE。 */
    @Enumerated(EnumType.STRING)
    @Column(name = "action", length = 16, nullable = false)
    private SubscriptionRuleAction action = SubscriptionRuleAction.ALLOW;

    /** 条件表达式 */
    @Column(name = "condition_expr", columnDefinition = "TEXT")
    private String conditionExpr;

    /** 创建人 */
    @Column(name = "created_by", length = 64)
    private String createdBy;

    /** 创建时间 */
    @Column(name = "created_at")
    private LocalDateTime createdAt;

    // ==================== Getters / Setters ====================

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getEventCode() { return eventCode; }
    public void setEventCode(String eventCode) { this.eventCode = eventCode; }

    public ChannelType getChannel() { return channel; }
    public void setChannel(ChannelType channel) { this.channel = channel; }

    public MessagePriority getPriority() { return priority; }
    public void setPriority(MessagePriority priority) { this.priority = priority; }

    public Boolean getEnable() { return enable; }
    public void setEnable(Boolean enable) { this.enable = enable; }
    public SubscriptionRuleAction getAction() { return action; }
    public void setAction(SubscriptionRuleAction action) { this.action = action; }

    public String getConditionExpr() { return conditionExpr; }
    public void setConditionExpr(String conditionExpr) { this.conditionExpr = conditionExpr; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    // ==================== Business Methods ====================

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
