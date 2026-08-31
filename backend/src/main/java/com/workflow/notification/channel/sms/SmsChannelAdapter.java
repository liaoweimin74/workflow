package com.workflow.notification.channel.sms;

import com.workflow.notification.channel.ChannelAdapter;
import com.workflow.notification.channel.ChannelDeliveryResult;
import com.workflow.notification.channel.ChannelMessage;
import com.workflow.notification.model.ChannelType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 短信渠道适配器
 */
@Component
public class SmsChannelAdapter implements ChannelAdapter {

    private static final Logger log = LoggerFactory.getLogger(SmsChannelAdapter.class);

    @Value("${notification.sms.api-key:}")
    private String apiKey;

    @Value("${notification.sms.api-secret:}")
    private String apiSecret;

    @Value("${notification.sms.sign-name:}")
    private String signName;

    @Override
    public ChannelType getChannelType() {
        return ChannelType.SMS;
    }

    @Override
    public ChannelDeliveryResult send(ChannelMessage message) {
        try {
            // TODO: 调用短信服务商 API
            log.info("发送短信: messageId={}, title={}", message.getMessageId(), message.getTitle());
            // 模拟发送成功
            return ChannelDeliveryResult.success("sms_" + System.currentTimeMillis());
        } catch (Exception e) {
            log.error("短信发送失败: {}", e.getMessage());
            return ChannelDeliveryResult.failure(e.getMessage());
        }
    }

    @Override
    public boolean isAvailable() {
        return apiKey != null && !apiKey.isEmpty();
    }
}
