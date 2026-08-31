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

    /**
     * 测试渠道连通性
     *
     * <p>默认实现基于 {@link #isAvailable()} 判断配置是否就绪；
     * 需要真实连通性探测的渠道可覆写此方法（如获取 token、心跳检测）。
     *
     * @return 测试结果，success=true 表示渠道可用
     */
    default ChannelDeliveryResult test() {
        return isAvailable()
                ? ChannelDeliveryResult.success("渠道配置就绪")
                : ChannelDeliveryResult.failure("渠道未配置或配置不完整");
    }
}
