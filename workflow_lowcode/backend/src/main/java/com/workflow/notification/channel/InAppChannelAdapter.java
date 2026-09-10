package com.workflow.notification.channel;

import com.workflow.notification.model.ChannelType;
import org.springframework.stereotype.Component;

/**
 * 站内信渠道适配器
 * 
 * <p>站内信通过数据库写入即可完成投递，无需外部调用
 */
@Component
public class InAppChannelAdapter implements ChannelAdapter {

    @Override
    public ChannelType getChannelType() {
        return ChannelType.IN_APP;
    }

    @Override
    public ChannelDeliveryResult send(ChannelMessage message) {
        // 站内信投递即数据库写入，由 MessageService 已完成
        return ChannelDeliveryResult.success(String.valueOf(message.getMessageId()));
    }

    @Override
    public boolean isAvailable() {
        return true;
    }
}
