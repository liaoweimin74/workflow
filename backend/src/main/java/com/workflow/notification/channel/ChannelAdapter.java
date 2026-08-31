package com.workflow.notification.channel;

import com.workflow.notification.model.ChannelType;

/**
 * 渠道适配器 SPI 接口
 * 
 * <p>每个渠道实现此接口，由 Spring 自动发现注册
 */
public interface ChannelAdapter {

    /**
     * 获取渠道类型
     */
    ChannelType getChannelType();

    /**
     * 发送消息
     *
     * @param message 渠道消息
     * @return 投递结果
     */
    ChannelDeliveryResult send(ChannelMessage message);

    /**
     * 渠道是否可用
     */
    boolean isAvailable();
}
