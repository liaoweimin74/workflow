package com.workflow.notification.model;

/** 订阅规则动作。 */
public enum SubscriptionRuleAction {
    /** 允许发送。 */
    ALLOW,
    /** 拒绝发送。 */
    DENY,
    /** 强制发送并覆盖用户退订。 */
    FORCE
}
