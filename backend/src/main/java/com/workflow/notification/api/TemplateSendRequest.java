package com.workflow.notification.api;

import com.workflow.notification.model.MessageType;

import java.util.Map;

/**
 * 模板发送请求体（内部 API {@code /send-by-template} 用）。
 *
 * <p>携带模板代码与变量，由 {@code MessageSender.sendByTemplate} 内部加载模板、
 * 校验必填变量并渲染，业务模块无需关心模板细节。
 */
public class TemplateSendRequest {

    /** 发送者ID（系统模板通常为系统用户ID） */
    private Long senderId;

    /** 模板代码 */
    private String templateCode;

    /** 模板变量，发送前校验必填并用于渲染标题与内容 */
    private Map<String, Object> variables;

    /** 消息类型（PRIVATE/PUBLIC/SYSTEM），缺省为 PRIVATE */
    private MessageType messageType;

    /** 业务事件代码，可选；推荐业务发送使用 send-by-event */
    private String eventCode;

    public Long getSenderId() { return senderId; }
    public void setSenderId(Long senderId) { this.senderId = senderId; }

    public String getTemplateCode() { return templateCode; }
    public void setTemplateCode(String templateCode) { this.templateCode = templateCode; }

    public Map<String, Object> getVariables() { return variables; }
    public void setVariables(Map<String, Object> variables) { this.variables = variables; }

    public MessageType getMessageType() { return messageType; }
    public void setMessageType(MessageType messageType) { this.messageType = messageType; }

    public String getEventCode() { return eventCode; }
    public void setEventCode(String eventCode) { this.eventCode = eventCode; }
}
