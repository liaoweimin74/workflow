package com.workflow.notification.subscription;

import com.workflow.notification.model.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SubscriptionServiceTest {

    @Mock
    private UserSubscriptionRepository userSubscriptionRepository;

    @Mock
    private SubscriptionRuleRepository subscriptionRuleRepository;

    @InjectMocks
    private SubscriptionService subscriptionService;

    private Message createMessage(MessagePriority priority, MessageType type, MessageCategory category) {
        Message msg = new Message();
        msg.setTenantId("default");
        msg.setPriority(priority);
        msg.setMessageType(type);
        msg.setCategory(category);
        return msg;
    }

    @Test
    void shouldSend_urgent_bypasses_all() {
        Message msg = createMessage(MessagePriority.URGENT, MessageType.PRIVATE, MessageCategory.WORKFLOW);
        assertThat(subscriptionService.shouldSend(msg, 1000L, ChannelType.SMS)).isTrue();
    }

    @Test
    void shouldSend_private_always_sends() {
        Message msg = createMessage(MessagePriority.NORMAL, MessageType.PRIVATE, MessageCategory.WORKFLOW);
        assertThat(subscriptionService.shouldSend(msg, 1000L, ChannelType.SMS)).isTrue();
    }

    @Test
    void shouldSend_system_always_sends() {
        Message msg = createMessage(MessagePriority.NORMAL, MessageType.PUBLIC, MessageCategory.SYSTEM);
        assertThat(subscriptionService.shouldSend(msg, 1000L, ChannelType.SMS)).isTrue();
    }

    @Test
    void shouldSend_default_true_when_no_preference() {
        Message msg = createMessage(MessagePriority.NORMAL, MessageType.PUBLIC, MessageCategory.WORKFLOW);
        when(userSubscriptionRepository.findByTenantIdAndUserIdAndChannel("default", 1000L, ChannelType.SMS))
                .thenReturn(null);
        assertThat(subscriptionService.shouldSend(msg, 1000L, ChannelType.SMS)).isTrue();
    }

    @Test
    void shouldSend_false_when_unsubscribed() {
        Message msg = createMessage(MessagePriority.NORMAL, MessageType.PUBLIC, MessageCategory.WORKFLOW);
        UserSubscription sub = new UserSubscription();
        sub.setSubscribed(false);
        when(userSubscriptionRepository.findByTenantIdAndUserIdAndChannel("default", 1000L, ChannelType.SMS))
                .thenReturn(sub);
        assertThat(subscriptionService.shouldSend(msg, 1000L, ChannelType.SMS)).isFalse();
    }

    @Test
    void shouldSend_force_rule_overrides_unsubscribe() {
        Message msg = createMessage(MessagePriority.HIGH, MessageType.PUBLIC, MessageCategory.WORKFLOW);
        msg.setEventCode("FINANCE_URGE");
        SubscriptionRule rule = new SubscriptionRule();
        rule.setAction(SubscriptionRuleAction.FORCE);
        when(subscriptionRuleRepository.findByTenantIdAndEventCodeAndChannelAndPriorityAndEnableTrue(
                "default", "FINANCE_URGE", ChannelType.SMS, MessagePriority.HIGH))
                .thenReturn(java.util.Optional.of(rule));
        assertThat(subscriptionService.shouldSend(msg, 1000L, ChannelType.SMS)).isTrue();
    }

    @Test
    void shouldSend_deny_rule_blocks_subscribed_user() {
        Message msg = createMessage(MessagePriority.NORMAL, MessageType.PUBLIC, MessageCategory.WORKFLOW);
        msg.setEventCode("TASK_CREATED");
        SubscriptionRule rule = new SubscriptionRule();
        rule.setAction(SubscriptionRuleAction.DENY);
        when(subscriptionRuleRepository.findByTenantIdAndEventCodeAndChannelAndPriorityAndEnableTrue(
                "default", "TASK_CREATED", ChannelType.SMS, MessagePriority.NORMAL))
                .thenReturn(java.util.Optional.of(rule));

        assertThat(subscriptionService.shouldSend(msg, 1000L, ChannelType.SMS)).isFalse();
    }

    @Test
    void shouldSend_allow_rule_allows_unsubscribed_user() {
        Message msg = createMessage(MessagePriority.NORMAL, MessageType.PUBLIC, MessageCategory.WORKFLOW);
        msg.setEventCode("TASK_CREATED");
        SubscriptionRule rule = new SubscriptionRule();
        rule.setAction(SubscriptionRuleAction.ALLOW);
        when(subscriptionRuleRepository.findByTenantIdAndEventCodeAndChannelAndPriorityAndEnableTrue(
                "default", "TASK_CREATED", ChannelType.SMS, MessagePriority.NORMAL))
                .thenReturn(java.util.Optional.of(rule));

        assertThat(subscriptionService.shouldSend(msg, 1000L, ChannelType.SMS)).isTrue();
    }
}
