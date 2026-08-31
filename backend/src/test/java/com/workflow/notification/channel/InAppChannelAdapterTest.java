package com.workflow.notification.channel;

import com.workflow.notification.model.ChannelType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class InAppChannelAdapterTest {

    private final InAppChannelAdapter adapter = new InAppChannelAdapter();

    @Test
    void getChannelType_returns_IN_APP() {
        assertThat(adapter.getChannelType()).isEqualTo(ChannelType.IN_APP);
    }

    @Test
    void isAvailable_returns_true() {
        assertThat(adapter.isAvailable()).isTrue();
    }

    @Test
    void send_returns_success() {
        ChannelMessage message = new ChannelMessage();
        message.setMessageId(1L);
        message.setTitle("测试消息");

        ChannelDeliveryResult result = adapter.send(message);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getMessageId()).isEqualTo("1");
    }
}
