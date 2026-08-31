package com.workflow.notification.model;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class UserSubscriptionTest {

    @Test
    void user_subscription_creation_with_all_fields() {
        UserSubscription subscription = new UserSubscription();
        subscription.setTenantId(1L);
        subscription.setUserId(1000L);
        subscription.setUsername("test_user");
        subscription.setChannel(ChannelType.SMS);
        subscription.setSubscribed(true);
        subscription.setCreatedAt(LocalDateTime.now());

        assertThat(subscription.getTenantId()).isEqualTo(1L);
        assertThat(subscription.getUserId()).isEqualTo(1000L);
        assertThat(subscription.getUsername()).isEqualTo("test_user");
        assertThat(subscription.getChannel()).isEqualTo(ChannelType.SMS);
        assertThat(subscription.getSubscribed()).isTrue();
    }
}