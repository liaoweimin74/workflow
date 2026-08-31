package com.workflow.notification.model;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class SubscriptionRuleTest {

    @Test
    void subscription_rule_creation_with_all_fields() {
        SubscriptionRule rule = new SubscriptionRule();
        rule.setTenantId(1L);
        rule.setEventCode("TASK_CREATED");
        rule.setChannel(ChannelType.SMS);
        rule.setPriority(MessagePriority.HIGH);
        rule.setEnable(true);
        rule.setCondition("user.role == 'ADMIN'");
        rule.setCreatedAt(LocalDateTime.now());

        assertThat(rule.getTenantId()).isEqualTo(1L);
        assertThat(rule.getEventCode()).isEqualTo("TASK_CREATED");
        assertThat(rule.getChannel()).isEqualTo(ChannelType.SMS);
        assertThat(rule.getEnable()).isTrue();
    }
}