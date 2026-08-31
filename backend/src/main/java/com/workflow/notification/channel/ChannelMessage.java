package com.workflow.notification.channel;

import java.util.Map;

/**
 * 渠道消息 DTO
 */
public class ChannelMessage {

    private Long messageId;
    private Long tenantId;
    private String title;
    private String content;
    private Map<String, Object> templateData;
    private Map<String, Object> linkTemplate;

    public ChannelMessage() {}

    public Long getMessageId() { return messageId; }
    public void setMessageId(Long messageId) { this.messageId = messageId; }
    public Long getTenantId() { return tenantId; }
    public void setTenantId(Long tenantId) { this.tenantId = tenantId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Map<String, Object> getTemplateData() { return templateData; }
    public void setTemplateData(Map<String, Object> templateData) { this.templateData = templateData; }
    public Map<String, Object> getLinkTemplate() { return linkTemplate; }
    public void setLinkTemplate(Map<String, Object> linkTemplate) { this.linkTemplate = linkTemplate; }
}
