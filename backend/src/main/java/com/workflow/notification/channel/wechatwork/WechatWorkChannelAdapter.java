package com.workflow.notification.channel.wechatwork;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.model.ChannelType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 企业微信渠道适配器
 */
@Component
public class WechatWorkChannelAdapter implements ChannelAdapter {

    private static final Logger log = LoggerFactory.getLogger(WechatWorkChannelAdapter.class);

    @Value("${notification.wechat-work.corp-id:}")
    private String corpId;

    @Value("${notification.wechat-work.corp-secret:}")
    private String corpSecret;

    @Value("${notification.wechat-work.agent-id:}")
    private String agentId;

    @Override
    public ChannelType getChannelType() {
        return ChannelType.WECHAT_WORK;
    }

    @Override
    public ChannelDeliveryResult send(ChannelMessage message) {
        try {
            // TODO: 调用企业微信应用消息 API
            log.info("发送企业微信消息: messageId={}, title={}", message.getMessageId(), message.getTitle());
            return ChannelDeliveryResult.success("wxwork_" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("企业微信发送失败: {}", e.getMessage());
            return ChannelDeliveryResult.failure(e.getMessage());
        }
    }

    @Override
    public boolean isAvailable() {
        return corpId != null && !corpId.isEmpty();
    }
}
