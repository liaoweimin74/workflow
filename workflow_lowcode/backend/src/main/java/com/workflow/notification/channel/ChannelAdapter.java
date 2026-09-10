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
     * <p>默认实现：先校验配置（{@link #isAvailable()}），
     * 再构造测试消息真实调用 {@link #send(ChannelMessage)} 走完整发送链路，
     * 以真实投递结果判定渠道是否可用。需要定制测试消息内容的渠道可覆写此方法。
     *
     * @return 测试结果，success=true 表示渠道测试消息发送成功
     */
    default ChannelDeliveryResult test() {
        if (!isAvailable()) {
            return ChannelDeliveryResult.failure("渠道未配置或配置不完整");
        }
        ChannelMessage testMessage = new ChannelMessage();
        testMessage.setMessageId(-1L);
        testMessage.setTenantId("default");
        testMessage.setTitle("【渠道测试】这是一条连通性测试消息");
        testMessage.setContent("渠道连通性测试，收到请忽略");
        return send(testMessage);
    }
}
