package com.workflow.notification.channel;

import java.util.Map;

/**
 * 渠道消息 DTO
 *
 * <p><b>appId</b>（Task 9.4）：可选的小程序 AppID，声明该消息应使用哪个小程序
 * 客户端的凭证投递（spec: app-release-pipeline「小程序凭证多实例」）。通知模型
 * （Message/MessageTemplate/ChannelConfig）暂无 client 维度，故 Client 上下文由
 * 消息内容透传（见 {@link #appIdFrom(Map)}：content 顶层 {@code appId} 或
 * {@code variables.appId}）。为空时渠道适配器回落渠道静态配置（后向兼容）。
 */
public class ChannelMessage {

    private Long messageId;
    private String tenantId;
    private Long recipientUserId;
    private String title;
    private String content;
    private Map<String, Object> templateData;
    private Map<String, Object> linkTemplate;
    /** 目标小程序 AppID（按 Client 凭证投递时使用；可空 = 渠道静态配置） */
    private String appId;

    public ChannelMessage() {}

    public Long getMessageId() { return messageId; }
    public void setMessageId(Long messageId) { this.messageId = messageId; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public Long getRecipientUserId() { return recipientUserId; }
    public void setRecipientUserId(Long recipientUserId) { this.recipientUserId = recipientUserId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Map<String, Object> getTemplateData() { return templateData; }
    public void setTemplateData(Map<String, Object> templateData) { this.templateData = templateData; }
    public Map<String, Object> getLinkTemplate() { return linkTemplate; }
    public void setLinkTemplate(Map<String, Object> linkTemplate) { this.linkTemplate = linkTemplate; }
    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }

    /**
     * 从消息内容提取目标小程序 AppID：优先 content 顶层 {@code appId}，
     * 其次 {@code variables} 子映射内的 {@code appId}。缺失/空白 → null。
     */
    public static String appIdFrom(Map<String, Object> content) {
        if (content == null) {
            return null;
        }
        Object direct = content.get("appId");
        if (direct == null && content.get("variables") instanceof Map<?, ?> variables) {
            direct = variables.get("appId");
        }
        if (direct == null) {
            return null;
        }
        String value = String.valueOf(direct);
        return value.isBlank() ? null : value;
    }
}