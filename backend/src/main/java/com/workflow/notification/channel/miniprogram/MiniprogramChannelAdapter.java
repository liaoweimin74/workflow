package com.workflow.notification.channel.miniprogram;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.model.ChannelType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 微信小程序渠道适配器
 */
@Component
public class MiniprogramChannelAdapter implements ChannelAdapter {

    private static final Logger log = LoggerFactory.getLogger(MiniprogramChannelAdapter.class);

    @Value("${notification.miniprogram.app-id:}")
    private String appId;

    @Value("${notification.miniprogram.app-secret:}")
    private String appSecret;

    @Override
    public ChannelType getChannelType() {
        return ChannelType.WECHAT_MINIPROGRAM;
    }

    @Override
    public ChannelDeliveryResult send(ChannelMessage message) {
        try {
            // TODO: 调用微信订阅消息 API
            log.info("发送小程序订阅消息: messageId={}, title={}", message.getMessageId(), message.getTitle());
            return ChannelDeliveryResult.success("miniprogram_" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("小程序消息发送失败: {}", e.getMessage());
            return ChannelDeliveryResult.failure(e.getMessage());
        }
    }

    @Override
    public boolean isAvailable() {
        return appId != null && !appId.isEmpty();
    }
}
