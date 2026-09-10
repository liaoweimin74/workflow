package com.workflow.notification.channel;

/**
 * 渠道投递结果
 */
public class ChannelDeliveryResult {

    private boolean success;
    private String messageId;
    private String error;

    public ChannelDeliveryResult() {}

    public static ChannelDeliveryResult success(String messageId) {
        ChannelDeliveryResult result = new ChannelDeliveryResult();
        result.success = true;
        result.messageId = messageId;
        return result;
    }

    public static ChannelDeliveryResult failure(String error) {
        ChannelDeliveryResult result = new ChannelDeliveryResult();
        result.success = false;
        result.error = error;
        return result;
    }

    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public String getMessageId() { return messageId; }
    public void setMessageId(String messageId) { this.messageId = messageId; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
}
