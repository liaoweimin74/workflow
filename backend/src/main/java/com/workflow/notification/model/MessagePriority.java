package com.workflow.notification.model;

/**
 * 消息优先级枚举
 */
public enum MessagePriority {
    /** 紧急 - 最高优先级 */
    URGENT,
    /** 重要 - 高优先级 */
    HIGH,
    /** 普通 - 中优先级 */
    NORMAL,
    /** 低优先级 - 最低优先级 */
    LOW
}