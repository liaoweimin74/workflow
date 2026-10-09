package com.workflow.notification.model;

import com.workflow.notification.model.Recipient;
import com.workflow.notification.model.MessageType;
import com.workflow.notification.model.ChannelType;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class RecipientTest {

    @Test
    void recipient_creation_with_all_fields() {
        Recipient recipient = new Recipient();
        recipient.setTenantId("default");
        recipient.setMessageId(100L);
        recipient.setUserId(1000L);
        recipient.setUsername("test_user");
        recipient.setNickname("测试用户");
        recipient.setEmail("test@example.com");
        recipient.setPhone("13800138000");
        recipient.setChannel(ChannelType.SMS);
        recipient.setStatus(RecipientStatus.PENDING);
        recipient.setSentAt(LocalDateTime.now());

        assertThat(recipient.getTenantId()).isEqualTo("default");
        assertThat(recipient.getMessageId()).isEqualTo(100L);
        assertThat(recipient.getUserId()).isEqualTo(1000L);
        assertThat(recipient.getUsername()).isEqualTo("test_user");
        assertThat(recipient.getChannel()).isEqualTo(ChannelType.SMS);
        assertThat(recipient.getStatus()).isEqualTo(RecipientStatus.PENDING);
    }
}