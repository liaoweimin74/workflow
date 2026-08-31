package com.workflow.notification.channel;

import com.workflow.notification.model.ChannelType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ChannelDeliveryResultTest {

    @Test
    void success_creates_successful_result() {
        ChannelDeliveryResult result = ChannelDeliveryResult.success("msg_123");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getMessageId()).isEqualTo("msg_123");
        assertThat(result.getError()).isNull();
    }

    @Test
    void failure_creates_failed_result() {
        ChannelDeliveryResult result = ChannelDeliveryResult.failure("超时");

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getMessageId()).isNull();
        assertThat(result.getError()).isEqualTo("超时");
    }
}
