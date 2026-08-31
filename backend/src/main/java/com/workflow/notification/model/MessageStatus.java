package com.workflow.notification.model;

/**
 * 消息状态枚举
 */
public enum MessageStatus {
    /** 待发送 - 已创建但未发送 */
    PENDING,
    /** 已发送 - 成功发送 */
    SENT,
    /** 已读 - 接收方已阅读 */
    READ,
    /** 已删除 - 已被逻辑删除 */
    DELETED,
    /** 发送失败 - 发送失败待重试 */
    FAILED
}