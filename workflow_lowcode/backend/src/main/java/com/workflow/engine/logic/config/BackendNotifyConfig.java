package com.workflow.engine.logic.config;

import java.util.List;

/**
 * 后端业务逻辑 - 消息通知（NOTIFY）节点子配置。
 *
 * <p>按模板发送消息（复用 notification 模块 MessageSender.sendByTemplate：
 * 模板加载 / 必填变量校验 / 渲染 / 事件发布投递，租户隔离内建）：
 *
 * <pre>{@code
 * {
 *   "templateCode": "ORDER_PAID_NOTICE",
 *   "recipientIds": ["{{orderOwnerId}}", "2"],
 *   "variables": [
 *     {"name":"orderNo", "value":"{{orderNo}}"},
 *     {"name":"amount", "value":"{{orderAmount}}"}
 *   ],
 *   "messageType": "PRIVATE",
 *   "channels": ["IN_APP"]
 * }
 * }</pre>
 *
 * <ul>
 *   <li>templateCode：租户内消息模板代码（须存在，缺失发送失败走 errorAction）；</li>
 *   <li>recipientIds：接收用户 ID 列表，元素支持 {@code {{var}}}（解析结果须可转数值）；</li>
 *   <li>variables：模板变量名值对，name 须 \w+；</li>
 *   <li>messageType：PRIVATE（默认）| PUBLIC | SYSTEM；</li>
 *   <li>channels：投递渠道 IN_APP（默认）| SMS（模板须有对应渠道配置）。</li>
 * </ul>
 *
 * <p>输出：{@code { sent: true, templateCode, recipients: N, channels: [...] }}，
 * 未声明 results 时按隐式约定写入 {@code <节点id>}。
 */
public class BackendNotifyConfig {

    /** 消息类型（与 notification 模块 MessageType 对齐）。 */
    public static final String TYPE_PRIVATE = "PRIVATE";
    public static final String TYPE_PUBLIC = "PUBLIC";
    public static final String TYPE_SYSTEM = "SYSTEM";

    /** 投递渠道（与 notification 模块 ChannelType 对齐）。 */
    public static final String CHANNEL_IN_APP = "IN_APP";
    public static final String CHANNEL_SMS = "SMS";

    /** 接收人数量上限（防误配群发失控）。 */
    public static final int MAX_RECIPIENTS = 20;

    private String templateCode;
    private List<String> recipientIds;
    private List<VarPair> variables;
    private String messageType;
    private List<String> channels;

    public String getTemplateCode() { return templateCode; }
    public void setTemplateCode(String templateCode) { this.templateCode = templateCode; }

    public List<String> getRecipientIds() { return recipientIds; }
    public void setRecipientIds(List<String> recipientIds) { this.recipientIds = recipientIds; }

    public List<VarPair> getVariables() { return variables; }
    public void setVariables(List<VarPair> variables) { this.variables = variables; }

    public String getMessageType() { return messageType; }
    public void setMessageType(String messageType) { this.messageType = messageType; }

    public List<String> getChannels() { return channels; }
    public void setChannels(List<String> channels) { this.channels = channels; }

    /** 模板变量名值对。 */
    public static class VarPair {
        private String name;
        private String value;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
    }
}
